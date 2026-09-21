from fastapi.testclient import TestClient

from autojav.config import Settings
from autojav.main import app


def test_health_does_not_expose_api_key():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert "api_key" not in response.json()


def test_validation_and_missing_keys():
    with TestClient(app) as client:
        task = {"url": "https://example.com", "instruction": "Cerca {{query}}", "values": {}}
        assert client.post("/api/validate", json=task).status_code == 422
        task["values"] = {"query": "abc"}
        assert client.post("/api/validate", json=task).json()["keys"] == ["query"]


def test_live_requires_key(monkeypatch):
    monkeypatch.setattr("autojav.main.settings", Settings(api_key=""))
    with TestClient(app) as client:
        response = client.post(
            "/api/runs",
            json={
                "task": {
                    "url": "https://example.com",
                    "instruction": "Apri la pagina",
                    "values": {},
                },
                "mode": "live",
            },
        )
        assert response.status_code == 409


def test_demo_cannot_drive_arbitrary_site():
    with TestClient(app) as client:
        response = client.post(
            "/api/runs",
            json={
                "task": {
                    "url": "https://example.com",
                    "instruction": "Apri la pagina",
                    "values": {},
                },
                "mode": "demo",
            },
        )
        assert response.status_code == 422


def test_cross_origin_mutation_rejected():
    with TestClient(app) as client:
        response = client.post("/api/validate", headers={"origin": "https://unrelated.example"}, json={})
        assert response.status_code == 403


def test_playground_is_served():
    with TestClient(app) as client:
        response = client.get("/playground")
        assert response.status_code == 200
        assert 'id="search-form"' in response.text
