"""End-to-end smoke test against a running local server; no OpenRouter calls."""

import json
import sys
import time
from pathlib import Path

import httpx

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
with httpx.Client(base_url=base, timeout=15) as client:
    health = client.get("/api/health")
    health.raise_for_status()
    example = client.get("/api/example").json()
    response = client.post("/api/runs", json={"task": example, "mode": "demo"})
    response.raise_for_status()
    run_id = response.json()["id"]
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in {"completed", "blocked", "failed", "cancelled"}:
            break
        time.sleep(0.5)
    else:
        client.post(f"/api/runs/{run_id}/cancel")
        raise AssertionError("La demo non si è conclusa entro 90 secondi.")
    assert run["status"] == "completed", json.dumps(run, indent=2)
    actions = [event["operation"] for event in run["events"] if event["kind"] == "action"]
    assert actions == ["fill", "select", "click"], actions
    screenshot = client.get(f"/api/runs/{run_id}/screenshot")
    screenshot.raise_for_status()
    assert screenshot.content.startswith(b"\x89PNG")
    destination = Path(__file__).resolve().parents[1] / ".runtime" / "smoke-result.png"
    destination.parent.mkdir(exist_ok=True)
    destination.write_bytes(screenshot.content)
    print(f"PASS: demo reale via MCP completata in {run['elapsed']} s; azioni {actions}.")
    print(f"Schermata: {destination}")
