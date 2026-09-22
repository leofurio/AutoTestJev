"""MCP subprocess pipes require a Proactor loop on Windows, including with uvicorn --reload."""

import asyncio
import sys


def create_loop() -> asyncio.AbstractEventLoop:
    if sys.platform == "win32":
        return asyncio.ProactorEventLoop()
    return asyncio.new_event_loop()
