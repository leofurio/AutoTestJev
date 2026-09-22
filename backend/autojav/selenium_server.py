"""Bundled Selenium MCP server. Only this process touches WebDriver."""

import atexit
import os
import sys
import time
import uuid
from pathlib import Path

from mcp.server.fastmcp import FastMCP
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import Select, WebDriverWait

from autojav.models import check_url

os.environ.setdefault("SE_CACHE_PATH", str(Path(__file__).resolve().parents[2] / ".runtime" / "selenium"))

mcp = FastMCP("autoJev Selenium")
driver = None
references = {}

OBSERVE_JS = """
const visible = e => {
  const r = e.getBoundingClientRect();
  const s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};
const nodes = [...document.querySelectorAll(
  'a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[contenteditable=true]'
)].filter(e => visible(e) && !e.disabled);
return {
  title: document.title,
  url: location.href,
  text: document.body.innerText.slice(0, 14000),
  scroll: { y: scrollY, height: innerHeight, total: document.documentElement.scrollHeight },
  overflow: nodes.length > 40,
  elements: nodes.slice(0, 40).map(e => ({
    node: e,
    tag: e.tagName.toLowerCase(),
    type: e.type || '',
    label: (e.getAttribute('aria-label') || (e.labels && [...e.labels].map(l => l.innerText).join(' '))
      || e.innerText || e.getAttribute('placeholder') || e.name || e.id || '').trim().slice(0, 180),
    value: e.value || '',
    editable: (e.matches('input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=file]):not([type=reset]),textarea,[contenteditable=true]') && !e.readOnly),
    clickable: e.matches('a,button,[role=button],[role=link],input[type=checkbox],input[type=radio],input[type=submit],input[type=button]'),
    checked: !!e.checked,
    options: e.tagName === 'SELECT' ? [...e.options].slice(0, 50).map(o => ({label: o.text, value: o.value})) : []
  }))
};
"""


def browser():
    if driver is None:
        raise RuntimeError("Il browser non è stato avviato.")
    return driver


def element(ref: str):
    if ref not in references:
        raise ValueError("Riferimento scaduto. Osserva nuovamente la pagina.")
    return references[ref]


def settle():
    WebDriverWait(browser(), 15).until(
        lambda d: d.execute_script("return document.readyState") in {"interactive", "complete"}
    )
    time.sleep(0.25)


@mcp.tool()
def start_browser(headless: bool = True) -> dict:
    """Start an isolated Chrome session."""
    global driver
    if driver is not None:
        return {"started": True}
    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1360,960")
    options.add_argument("--disable-notifications")
    options.add_argument("--no-first-run")
    options.add_experimental_option(
        "prefs",
        {
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
            "download.prompt_for_download": True,
        },
    )
    executable = os.getenv("CHROMEDRIVER_PATH")
    service = Service(executable_path=executable) if executable else Service()
    driver = webdriver.Chrome(options=options, service=service)
    driver.set_page_load_timeout(25)
    driver.set_script_timeout(15)
    return {"started": True}


@mcp.tool()
def navigate(url: str) -> dict:
    """Open an HTTP(S) URL."""
    browser().get(check_url(url))
    settle()
    return {"url": browser().current_url}


@mcp.tool()
def observe() -> dict:
    """Observe visible interactive elements with references valid until the next observation."""
    global references
    check_url(browser().current_url)
    page = browser().execute_script(OBSERVE_JS)
    references = {}
    snapshot_id = uuid.uuid4().hex[:8]
    for index, el in enumerate(page["elements"]):
        ref = f"{snapshot_id}_{index}"
        references[ref] = el.pop("node")
        el["ref"] = ref
    page["screenshot"] = browser().get_screenshot_as_base64()
    return page


@mcp.tool()
def click(ref: str) -> dict:
    """Click a previously observed element."""
    el = element(ref)
    href = el.get_attribute("href")
    if href:
        check_url(href)
    before = set(browser().window_handles)
    el.click()
    opened = set(browser().window_handles) - before
    if opened:
        browser().switch_to.window(next(iter(opened)))
    settle()
    return {"clicked": True}


@mcp.tool()
def fill(ref: str, value: str) -> dict:
    """Replace a field's content with an exact literal value."""
    el = element(ref)
    if el.get_attribute("contenteditable") == "true":
        el.click()
        el.send_keys(Keys.COMMAND if sys.platform == "darwin" else Keys.CONTROL, "a")
        el.send_keys(Keys.BACKSPACE)
    else:
        el.clear()
    el.send_keys(value)
    return {"filled": True}


@mcp.tool()
def select(ref: str, value: str) -> dict:
    """Choose an existing select option by exact value or visible text."""
    control = Select(element(ref))
    matching = [o for o in control.options if o.get_attribute("value") == value or o.text == value]
    if not matching:
        raise ValueError("Nessuna opzione corrisponde al valore fornito.")
    matching[0].click()
    return {"selected": True}


@mcp.tool()
def scroll() -> dict:
    """Scroll down by one viewport."""
    browser().execute_script("window.scrollBy(0, window.innerHeight * .8)")
    time.sleep(0.2)
    return {"scrolled": True}


@mcp.tool()
def back() -> dict:
    """Navigate back once."""
    browser().back()
    settle()
    return {"back": True}


@mcp.tool()
def wait() -> dict:
    """Wait briefly for a page update."""
    time.sleep(1)
    return {"waited": True}


@mcp.tool()
def stop_browser() -> dict:
    """Close this server's browser and release resources."""
    global driver, references
    if driver is not None:
        try:
            driver.quit()
        finally:
            driver = None
            references = {}
    return {"closed": True}


atexit.register(stop_browser)

if __name__ == "__main__":
    mcp.run(transport="stdio")
