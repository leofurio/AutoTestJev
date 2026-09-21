import asyncio
import base64
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import ROOT, settings
from .models import StartRun, TaskInput
from .runner import TERMINAL, Run, perform

runs: dict[str, Run] = {}
DEMO_INSTRUCTION = (
    "Cerca {{prodotto}}, seleziona la taglia {{taglia}} e premi Cerca per mostrare i risultati."
)
DEMO_VALUES = {"prodotto": "scarpe da trekking", "taglia": "42"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    jobs = [run.job for run in runs.values() if run.job and not run.job.done()]
    for run in runs.values():
        run.cancel.set()
    if jobs:
        _, pending = await asyncio.wait(jobs, timeout=8)
        for job in pending:
            job.cancel()
        await asyncio.gather(*pending, return_exceptions=True)


app = FastAPI(title="autoJev", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])


@app.middleware("http")
async def local_origin(request: Request, call_next):
    # This local browser controller is only served on loopback; reject cross-origin mutations.
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and urlsplit(origin).netloc != request.headers.get("host"):
            return JSONResponse({"detail": "Origine della richiesta non consentita."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "jev_configured": bool(settings.api_key),
        "model": settings.model,
        "max_steps": settings.max_steps,
        "min_confidence": settings.min_confidence,
        "mcp": "Selenium MCP incluso · stdio",
    }


@app.get("/api/example")
async def example(request: Request, name: Literal["local", "saucedemo"] = "local"):
    if name == "saucedemo":
        return TaskInput.model_validate_json(
            (ROOT / "examples" / "saucedemo.json").read_text(encoding="utf-8")
        )
    return {
        "url": str(request.base_url).rstrip("/") + "/playground",
        "instruction": DEMO_INSTRUCTION,
        "values": DEMO_VALUES,
    }


@app.post("/api/validate")
async def validate(task: TaskInput):
    return {
        "valid": True,
        "keys": sorted(task.used_keys),
        "unused_keys": sorted(task.values.keys() - task.used_keys),
    }


@app.post("/api/runs", status_code=202)
async def start(request: StartRun, http_request: Request):
    if any(run.status not in TERMINAL for run in runs.values()):
        raise HTTPException(409, "Un'esecuzione è già in corso. Attendi o interrompila.")
    if request.mode == "live" and not settings.api_key:
        raise HTTPException(
            409, "Configura OPENROUTER_API_KEY nel file .env e riavvia il backend, oppure avvia la demo."
        )
    if request.mode == "demo":
        target = urlsplit(request.task.url)
        if (
            target.hostname not in {"localhost", "127.0.0.1"}
            or target.path != "/playground"
            or target.netloc != urlsplit(str(http_request.base_url)).netloc
            or request.task.instruction != DEMO_INSTRUCTION
            or request.task.values != DEMO_VALUES
        ):
            raise HTTPException(
                422, "La demo esegue solo l'esempio locale predefinito. Carica l'esempio o usa Jev live."
            )
    # Runs are ephemeral and bounded. No task values are written to disk.
    while len(runs) >= 20:
        old = next((key for key, run in runs.items() if run.status in TERMINAL), None)
        if old is None:
            break
        del runs[old]
    run = Run(request)
    runs[run.id] = run
    run.job = asyncio.create_task(perform(run))
    return run.view()


def get_run(run_id: str) -> Run:
    if run_id not in runs:
        raise HTTPException(
            404, "Esecuzione non trovata. Potrebbe essere stata rimossa o il backend riavviato."
        )
    return runs[run_id]


@app.get("/api/runs/{run_id}")
async def status(run_id: str):
    return get_run(run_id).view()


@app.get("/api/runs/{run_id}/screenshot")
async def screenshot(run_id: str):
    run = get_run(run_id)
    if not run.screenshot:
        raise HTTPException(404, "Nessuna schermata disponibile.")
    return Response(base64.b64decode(run.screenshot), media_type="image/png")


@app.post("/api/runs/{run_id}/cancel")
async def cancel(run_id: str):
    run = get_run(run_id)
    if run.status not in TERMINAL:
        run.cancel.set()
        run.emit("info", "Arresto richiesto. Attendo il completamento dell'operazione in corso.")
    return run.view()


@app.get("/playground")
async def playground():
    return FileResponse(Path(__file__).with_name("playground.html"))


dist = ROOT / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
