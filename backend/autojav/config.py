import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    model: str = os.getenv("JEV_MODEL", "typesafe/jev-1.13")
    endpoint: str = os.getenv("JEV_ENDPOINT", "https://openrouter.ai/api/alpha/decisions")
    min_confidence: float = float(os.getenv("JEV_MIN_CONFIDENCE", "0.65"))
    max_steps: int = int(os.getenv("MAX_STEPS", "24"))
    headless: bool = os.getenv("SELENIUM_HEADLESS", "true").lower() == "true"


settings = Settings()
