import json

import httpx
import pytest

from autojav.config import Settings
from autojav.jev import JevClient, JevError
from autojav.models import Action, TaskInput

TASK = TaskInput(
    url="https://example.com",
    instruction="Cerca {{prodotto}}",
    values={"prodotto": "scarpe", "unused": "private"},
)
ACTIONS = [Action(id="done", operation="done", label="Completato")]
PAGE = {
    "url": "https://example.com",
    "text": "Pagina",
    "screenshot": "large",
    "elements": [{"ref": "r1", "value": "secret"}],
}


async def test_decisions_request_and_response_contract():
    def handler(request):
        assert str(request.url) == "https://openrouter.ai/api/alpha/decisions"
        assert request.headers["Authorization"] == "Bearer test-key"
        body = json.loads(request.content)
        assert body["questions"]["next_action"]["type"] == "choice"
        assert body["state"]["placeholder_values"] == {"prodotto": "scarpe"}
        assert "secret" not in request.content.decode()
        assert "screenshot" not in body["state"]["page_observation"]
        return httpx.Response(
            200,
            json={
                "answers": {
                    "next_action": {
                        "type": "choice",
                        "choice": "done",
                        "confidence": 0.9,
                        "probabilities": {"done": 1},
                    }
                }
            },
        )

    decision = await JevClient(Settings(api_key="test-key"), httpx.MockTransport(handler)).decide(
        TASK, PAGE, ACTIONS, []
    )
    assert decision.choice == "done"
    assert decision.confidence == 0.9


@pytest.mark.parametrize(
    "answer",
    [
        {"choice": "invented", "confidence": 0.99},
        {"choice": "done", "confidence": 9},
        {"choice": "done"},
    ],
)
async def test_invalid_choices_rejected(answer):
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json={"answers": {"next_action": answer}}))
    with pytest.raises(JevError, match="non valida"):
        await JevClient(Settings(api_key="test-key"), transport).decide(TASK, PAGE, ACTIONS, [])


@pytest.mark.parametrize(
    "status, phrase", [(401, "non valida"), (402, "insufficiente"), (429, "Limite"), (500, "HTTP 500")]
)
async def test_provider_errors_are_actionable_without_echoing_body(status, phrase):
    transport = httpx.MockTransport(lambda _: httpx.Response(status, text="SECRET: do not echo"))
    with pytest.raises(JevError, match=phrase) as error:
        await JevClient(Settings(api_key="test-key"), transport).decide(TASK, PAGE, ACTIONS, [])
    assert "SECRET" not in str(error.value)


async def test_missing_key_does_not_attempt_request():
    with pytest.raises(JevError, match="OPENROUTER_API_KEY"):
        await JevClient(Settings(api_key="")).decide(TASK, PAGE, ACTIONS, [])
