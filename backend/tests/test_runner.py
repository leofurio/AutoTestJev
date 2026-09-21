from contextlib import asynccontextmanager

from autojav.jev import JevError
from autojav.mcp_client import BrowserMCP
from autojav.models import Action, Decision, StartRun, TaskInput
from autojav.runner import Run, failure_message, perform

TASK = TaskInput(
    url="https://example.com", instruction="Cerca {{prodotto}}", values={"prodotto": "{{letterale}}"}
)


def test_provider_error_survives_mcp_exception_groups():
    error = ExceptionGroup(
        "mcp", [ExceptionGroup("session", [JevError("Credito OpenRouter insufficiente.")])]
    )
    assert failure_message(error) == "Credito OpenRouter insufficiente."


def test_unknown_mcp_error_does_not_expose_raw_contents():
    error = ExceptionGroup("raw private data", [OSError("private details")])
    assert failure_message(error) == "Connessione MCP o browser non disponibile."


class Browser:
    def __init__(self):
        self.calls = []
        self.executed = []
        self.closed = False

    async def call(self, tool, arguments=None):
        self.calls.append(tool)
        if tool == "observe":
            return {"url": "https://example.com", "text": "Cerca", "screenshot": "base64", "elements": []}
        return {}

    async def execute(self, action, task):
        self.executed.append(action.operation)

    @asynccontextmanager
    async def connection(self):
        try:
            yield self
        finally:
            self.closed = True


class Decider:
    def __init__(self, choice, confidence=0.99, on_decide=None):
        self.choice = choice
        self.confidence = confidence
        self.on_decide = on_decide

    async def decide(self, *args):
        if self.on_decide:
            self.on_decide()
        return Decision(choice=self.choice, confidence=self.confidence)


async def test_low_confidence_stops_before_action():
    run = Run(StartRun(task=TASK))
    browser = Browser()
    await perform(run, Decider("scroll", 0.2), browser.connection)
    assert run.status == "blocked"
    assert browser.executed == []
    assert browser.closed


async def test_cancel_after_inference_does_not_execute():
    run = Run(StartRun(task=TASK))
    browser = Browser()
    await perform(run, Decider("scroll", on_decide=run.cancel.set), browser.connection)
    assert run.status == "cancelled"
    assert browser.executed == []
    assert browser.closed


async def test_repeated_actions_stop_and_release_browser():
    run = Run(StartRun(task=TASK))
    browser = Browser()
    await perform(run, Decider("scroll"), browser.connection)
    assert run.status == "blocked"
    assert browser.executed == ["scroll", "scroll"]
    assert browser.closed


async def test_done_does_not_dispatch_as_mcp_tool():
    run = Run(StartRun(task=TASK))
    browser = Browser()
    await perform(run, Decider("done"), browser.connection)
    assert run.status == "completed"
    assert not browser.executed
    assert run.screenshot == "base64"
    assert "values" not in run.view()


async def test_exact_value_passed_to_mcp_without_recursive_expansion():
    captured = []

    class Client(BrowserMCP):
        async def call(self, tool, arguments=None):
            captured.append((tool, arguments))

    client = Client(None)
    await client.execute(
        Action(id="a", operation="fill", label="Compila", ref="observed-ref", value_key="prodotto"), TASK
    )
    assert captured == [("fill", {"ref": "observed-ref", "value": "{{letterale}}"})]
