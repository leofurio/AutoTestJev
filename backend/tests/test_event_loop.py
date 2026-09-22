import asyncio
import sys
from types import SimpleNamespace

from uvicorn import Config

from autojav import event_loop
from autojav.mcp_client import connect_browser


def test_windows_chooses_proactor(monkeypatch):
    sentinel = object()
    monkeypatch.setattr(event_loop, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setattr(event_loop.asyncio, "ProactorEventLoop", lambda: sentinel, raising=False)
    assert event_loop.create_loop() is sentinel


def test_uvicorn_reload_uses_custom_factory():
    config = Config("autojav.main:app", reload=True, loop="autojav.event_loop:create_loop")
    assert config.get_loop_factory() is event_loop.create_loop


def test_loop_supports_real_subprocess_pipes():
    async def run():
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-c", "print('subprocess-ok')", stdout=asyncio.subprocess.PIPE
        )
        stdout, _ = await process.communicate()
        assert process.returncode == 0
        assert stdout.strip() == b"subprocess-ok"

    with asyncio.Runner(loop_factory=event_loop.create_loop) as runner:
        runner.run(run())


def test_real_mcp_stdio_handshake_with_application_loop():
    async def run():
        async with connect_browser() as browser:
            tools = await browser.session.list_tools()
            assert {"start_browser", "navigate", "observe", "fill"} <= {tool.name for tool in tools.tools}

    with asyncio.Runner(loop_factory=event_loop.create_loop) as runner:
        runner.run(run())
