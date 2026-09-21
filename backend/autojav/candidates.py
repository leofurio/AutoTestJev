from .models import Action, TaskInput


def build_candidates(page: dict, task: TaskInput) -> list[Action]:
    """Bound the candidate set without silently dropping elements or placeholder values."""
    actions = [
        Action(
            id="done", operation="done", label="Obiettivo interamente completato, verificato sulla pagina"
        ),
        Action(
            id="blocked",
            operation="blocked",
            label="Nessuna azione adatta, dati mancanti o richiesta impossibile",
        ),
        Action(id="wait", operation="wait", label="Attendi il caricamento della pagina"),
        Action(id="scroll", operation="scroll", label="Scorri verso il basso per vedere altri elementi"),
        Action(id="back", operation="back", label="Torna alla pagina precedente"),
    ]
    for el in page.get("elements", []):
        ref = el["ref"]
        label = el.get("label") or el.get("tag", "elemento")
        if el.get("editable") or el.get("tag") == "select":
            operation = "select" if el.get("tag") == "select" else "fill"
            for key, value in task.used_values.items():
                # Do not repeatedly type values already placed in the same field.
                if el.get("value") == value:
                    continue
                actions.append(
                    Action(
                        id=f"a{len(actions)}",
                        operation=operation,
                        ref=ref,
                        value_key=key,
                        label=f"{'Seleziona' if operation == 'select' else 'Compila'} «{label}» usando {{{{{key}}}}}",
                    )
                )
        elif el.get("clickable"):
            actions.append(
                Action(id=f"a{len(actions)}", operation="click", ref=ref, label=f"Clicca «{label}»")
            )
    if len(actions) > 255:
        raise ValueError("Troppi candidati per Jev. Riduci il numero di segnaposto o semplifica la pagina.")
    return actions
