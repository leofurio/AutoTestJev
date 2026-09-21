import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PLACEHOLDER = re.compile(r"\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}")
KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


def check_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise ValueError
        _ = parsed.port
    except ValueError:
        raise ValueError("Inserisci un URL HTTP o HTTPS valido, senza credenziali nell'URL.") from None
    return value


class TaskInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    url: str = Field(min_length=1, max_length=2048)
    instruction: str = Field(min_length=3, max_length=6000)
    values: dict[str, str]

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return check_url(value.strip())

    @field_validator("values")
    @classmethod
    def validate_values(cls, values: dict[str, str]) -> dict[str, str]:
        if len(values) > 20:
            raise ValueError("Sono ammessi al massimo 20 valori.")
        for key, value in values.items():
            if not KEY.fullmatch(key):
                raise ValueError(f"Nome del segnaposto non valido: {key}")
            if len(value) > 4000:
                raise ValueError(f"Il valore di {key} supera i 4000 caratteri.")
        return values

    @model_validator(mode="after")
    def validate_placeholders(self):
        remainder = PLACEHOLDER.sub("", self.instruction)
        if "{{" in remainder or "}}" in remainder:
            raise ValueError("Usa la sintassi {{chiave}} per i segnaposto.")
        missing = self.used_keys - self.values.keys()
        if missing:
            raise ValueError("Valori mancanti: " + ", ".join(sorted(missing)))
        return self

    @property
    def used_keys(self) -> set[str]:
        return set(PLACEHOLDER.findall(self.instruction))

    @property
    def used_values(self) -> dict[str, str]:
        return {key: value for key, value in self.values.items() if key in self.used_keys}


class StartRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task: TaskInput
    mode: Literal["live", "demo"] = "live"


class Action(BaseModel):
    id: str
    operation: Literal["click", "fill", "select", "scroll", "back", "wait", "done", "blocked"]
    label: str
    ref: str | None = None
    value_key: str | None = None


class Decision(BaseModel):
    choice: str
    confidence: float = Field(ge=0, le=1)
    probabilities: dict[str, float] = Field(default_factory=dict)
