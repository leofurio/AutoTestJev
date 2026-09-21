import pytest
from pydantic import ValidationError

from autojav.candidates import build_candidates
from autojav.models import TaskInput


def task(**changes):
    return TaskInput.model_validate(
        {
            "url": "https://example.com",
            "instruction": "Cerca {{prodotto}}",
            "values": {"prodotto": "00123"},
            **changes,
        }
    )


@pytest.mark.parametrize(
    "url",
    ["file:///etc/passwd", "javascript:alert(1)", "https://", "http://user:pass@host", "https://host:wrong"],
)
def test_invalid_url(url):
    with pytest.raises(ValidationError):
        task(url=url)


@pytest.mark.parametrize("instruction", ["Cerca {{mancante}}", "Cerca {{prodotto", "Cerca {{ prodotto }}"])
def test_bad_placeholders(instruction):
    with pytest.raises(ValidationError):
        task(instruction=instruction)


def test_literal_values_unused_keys_and_repeated_placeholders():
    result = task(
        instruction="Cerca {{prodotto}} e poi {{prodotto}}",
        values={"prodotto": "{{altro}}", "altro": "NON ESPANDERE"},
    )
    assert result.used_values == {"prodotto": "{{altro}}"}


def test_strict_values_preserve_leading_zeros():
    assert task().values["prodotto"] == "00123"
    with pytest.raises(ValidationError):
        task(values={"prodotto": 123})


def test_no_placeholder_needed_for_navigation():
    assert task(instruction="Apri la pagina dei contatti", values={}).used_values == {}


def test_candidates_use_real_refs_and_exact_keys():
    actions = build_candidates(
        {
            "elements": [
                {"ref": "r1", "tag": "input", "editable": True, "label": "Cerca", "value": ""},
                {"ref": "r2", "tag": "input", "editable": True, "label": "Già compilato", "value": "00123"},
                {"ref": "r3", "tag": "button", "clickable": True, "label": "Invia"},
            ]
        },
        task(),
    )
    fills = [a for a in actions if a.operation == "fill"]
    assert [(a.ref, a.value_key) for a in fills] == [("r1", "prodotto")]
    assert "00123" not in " ".join(a.label for a in actions)


def test_candidate_overflow_stops_instead_of_truncating():
    with pytest.raises(ValueError, match="Troppi candidati"):
        build_candidates(
            {
                "elements": [
                    {"ref": str(i), "tag": "button", "clickable": True, "label": f"Button {i}"}
                    for i in range(251)
                ]
            },
            task(),
        )
