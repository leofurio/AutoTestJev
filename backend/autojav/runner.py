import asyncio
import hashlib
import json
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime

from .candidates import build_candidates
from .config import settings
from .jev import DemoDecider, JevClient, JevError
from .mcp_client import connect_browser
from .models import StartRun

TERMINAL = {"completed", "blocked", "failed", "cancelled"}


def failure_message(exc: Exception) -> str:
    """MCP task groups can wrap a provider failure; preserve only controlled public messages."""
    errors = list(exc.exceptions) if isinstance(exc, ExceptionGroup) else [exc]
    leaves = []
    while errors:
        error = errors.pop(0)
        if isinstance(error, ExceptionGroup):
            errors.extend(error.exceptions)
        else:
            leaves.append(error)
    for error in leaves:
        if isinstance(error, JevError):
            return str(error)
    for error in leaves:
        if isinstance(error, (ValueError, RuntimeError)):
            return str(error)
    return "Connessione MCP o browser non disponibile."


@dataclass
class Run:
    request: StartRun
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    status: str = "queued"
    events: list = field(default_factory=list)
    page: dict | None = None
    screenshot: str | None = None
    steps: int = 0
    confidence: float | None = None
    started: float = field(default_factory=time.monotonic)
    elapsed: float = 0
    cancel: asyncio.Event = field(default_factory=asyncio.Event)
    job: asyncio.Task | None = None

    def emit(self, kind: str, message: str, **details):
        self.events.append(
            {
                "id": len(self.events),
                "time": datetime.now(UTC).isoformat(),
                "kind": kind,
                "message": message,
                **details,
            }
        )

    def view(self):
        return {
            "id": self.id,
            "status": self.status,
            "mode": self.request.mode,
            "steps": self.steps,
            "confidence": self.confidence,
            "elapsed": round(self.elapsed if self.status in TERMINAL else time.monotonic() - self.started, 1),
            "events": self.events,
            "page": self.page,
            "has_screenshot": self.screenshot is not None,
        }

    def finish(self, status: str, message: str):
        self.status = status
        self.elapsed = time.monotonic() - self.started
        self.emit(status, message)


def page_fingerprint(page: dict) -> str:
    stable = {key: page.get(key) for key in ("url", "text", "scroll")}
    stable["elements"] = [{k: v for k, v in el.items() if k != "ref"} for el in page.get("elements", [])]
    return hashlib.sha256(json.dumps(stable, sort_keys=True).encode()).hexdigest()


async def perform(run: Run, decider=None, connection_factory=connect_browser):
    history = []
    repeated = Counter()
    decider = decider or (DemoDecider() if run.request.mode == "demo" else JevClient(settings))
    run.status = "running"
    run.emit("info", "Avvio del browser tramite Selenium MCP.")
    if run.request.mode == "demo":
        run.emit("info", "Demo locale: decisioni predefinite, browser reale. Nessuna chiamata a Jev.")
    try:
        async with connection_factory() as browser:
            await browser.call("start_browser", {"headless": settings.headless})
            if run.cancel.is_set():
                run.finish("cancelled", "Esecuzione interrotta.")
                return
            await browser.call("navigate", {"url": run.request.task.url})
            run.emit("navigation", "Sito aperto. Osservo gli elementi disponibili.")
            for _ in range(settings.max_steps + 1):
                if run.cancel.is_set():
                    run.finish("cancelled", "Esecuzione interrotta.")
                    return
                page = await browser.call("observe")
                run.screenshot = page.pop("screenshot", None)
                run.page = {
                    "url": page["url"],
                    "title": page.get("title"),
                    "elements": len(page.get("elements", [])),
                }
                actions = build_candidates(page, run.request.task)
                run.emit(
                    "observation",
                    f"{len(page.get('elements', []))} elementi osservati · {len(actions)} azioni candidate.",
                )
                decision = await decider.decide(run.request.task, page, actions, history)
                if run.cancel.is_set():
                    run.finish("cancelled", "Esecuzione interrotta. Nessuna nuova azione eseguita.")
                    return
                action = next((a for a in actions if a.id == decision.choice), None)
                if action is None:
                    raise ValueError("Il decisore ha scelto un'azione non disponibile.")
                run.confidence = decision.confidence
                run.emit("decision", action.label, confidence=decision.confidence, operation=action.operation)
                if decision.confidence < settings.min_confidence:
                    run.finish(
                        "blocked", "Confidenza insufficiente: l'esecuzione si è fermata prima di agire."
                    )
                    return
                if action.operation == "blocked":
                    run.finish("blocked", "Nessuna azione adatta. Verifica istruzione, dati e pagina.")
                    return
                if action.operation == "done":
                    run.finish(
                        "completed",
                        "Obiettivo dichiarato completato dal decisore. Controlla l'ultima schermata.",
                    )
                    return
                if run.steps >= settings.max_steps:
                    run.finish("blocked", f"Raggiunto il limite di {settings.max_steps} azioni.")
                    return
                signature = (page_fingerprint(page), action.operation, action.label)
                repeated[signature] += 1
                if repeated[signature] > 2:
                    run.finish("blocked", "La stessa azione si ripete senza progresso. Esecuzione fermata.")
                    return
                run.steps += 1
                try:
                    await browser.execute(action, run.request.task)
                    history.append({"action": action.label, "outcome": "executed"})
                    run.emit("action", action.label, operation=action.operation)
                except Exception:
                    history.append({"action": action.label, "outcome": "failed"})
                    run.emit(
                        "warning", "Azione non riuscita. Osservo nuovamente la pagina prima di decidere."
                    )
    except asyncio.CancelledError:
        run.finish("cancelled", "Esecuzione interrotta durante l'arresto del server.")
        raise
    except Exception as exc:
        run.finish("failed", failure_message(exc))
