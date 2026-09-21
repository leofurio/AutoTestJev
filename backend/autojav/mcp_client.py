import json
import os
import sys
from contextlib import asynccontextmanager
from datetime import timedelta

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .config import ROOT
from .models import Action, TaskInput


class BrowserMCP:
    def __init__(self, session: ClientSession):
        self.session = session

    async def call(self, tool: str, arguments: dict | None = None) -> dict:
        result = await self.session.call_tool(
            tool, arguments or {}, read_timeout_seconds=timedelta(seconds=60)
        )
        if result.isError:
            # Raw Selenium errors can contain form values and page data. Keep them out of the activity log.
            raise RuntimeError(f"Il tool MCP «{tool}» non è riuscito. Verifica lo stato del browser.")
        if result.structuredContent is not None:
            return result.structuredContent
        for item in result.content:
            if item.type == "text":
                return json.loads(item.text)
        raise RuntimeError(f"Il tool MCP «{tool}» ha restituito una risposta vuota.")

    async def execute(self, action: Action, task: TaskInput):
        arguments = {}
        if action.ref:
            arguments["ref"] = action.ref
        if action.value_key is not None:
            arguments["value"] = task.used_values[action.value_key]
        if action.operation not in {"click", "fill", "select", "scroll", "back", "wait"}:
            raise ValueError("Azione non eseguibile.")
        return await self.call(action.operation, arguments)


@asynccontextmanager
async def connect_browser():
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "autojav.selenium_server"],
        cwd=str(ROOT),
        env={**os.environ, "PYTHONPATH": str(ROOT / "backend")},
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            available = {tool.name for tool in (await session.list_tools()).tools}
            required = {"start_browser", "navigate", "observe", "click", "fill", "select", "stop_browser"}
            if not required <= available:
                raise RuntimeError("Il server MCP non espone i tool necessari.")
            client = BrowserMCP(session)
            try:
                yield client
            finally:
                try:
                    await client.call("stop_browser")
                except Exception:
                    pass
