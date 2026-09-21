# Input dell'automazione

L'applicazione riceve tre input dall'utente:

| Campo | Tipo | Significato |
| --- | --- | --- |
| `url` | stringa | URL iniziale del sito, assoluto e con schema HTTP o HTTPS. |
| `instruction` | stringa | Obiettivo in linguaggio naturale, con eventuali segnaposto `{{chiave}}`. |
| `values` | oggetto JSON | Mappa tra nomi dei segnaposto e valori testuali da utilizzare. |

Il file `input.example.json` contiene un esempio completo. Il motore è implementato nel backend Python; avvio e limiti sono descritti in `README.md`.

## Segnaposto

- Le chiavi non includono le parentesi: `prodotto` corrisponde a `{{prodotto}}`.
- I nomi distinguono maiuscole e minuscole e seguono `[A-Za-z_][A-Za-z0-9_]*`.
- Ogni segnaposto dell'istruzione deve avere una chiave corrispondente; in caso contrario l'applicazione segnala l'errore prima di aprire il browser.
- I valori sono stringhe, anche quando rappresentano numeri, per preservare formattazione e zeri iniziali.
- Sono ammessi segnaposto ripetuti e valori vuoti. `values` può essere vuoto quando l'istruzione non contiene segnaposto.
- Le chiavi inutilizzate sono ammesse e non vengono inviate al decisore.
- I valori sono dati letterali. Non si eseguono sostituzioni ricorsive né si interpretano eventuali segnaposto presenti dentro un valore.

## Uso con Jev e Selenium MCP

L'applicazione conserva separati istruzione e valori. A ogni passo prepara per Jev lo stato osservato della pagina, l'obiettivo, la cronologia essenziale e una lista di azioni candidate. Queste informazioni sono raccolte internamente e non costituiscono ulteriori input richiesti all'utente.

Un'azione candidata per compilare un campo contiene il riferimento all'elemento osservato e una chiave di `values`. Jev sceglie l'identificativo dell'azione candidata. L'esecutore risolve la chiave nel valore originale e costruisce gli argomenti della chiamata al tool effettivamente esposto dal server Selenium MCP.

Esempio concettuale di azione interna, non di schema del server MCP:

```json
{
  "id": "azione_1",
  "operation": "fill",
  "elementRef": "campo_ricerca_1",
  "valueKey": "prodotto"
}
```

L'esecutore usa esattamente `values.prodotto`, senza chiedere a Jev di generare o ricopiare il testo. Le azioni successive sono costruite in base al nuovo stato della pagina. Se nessuna azione candidata soddisfa la richiesta, il motore deve poter fermarsi e segnalare il motivo mediante un messaggio predefinito.

Questo contratto elimina la necessità di estrarre dal linguaggio naturale i valori liberi da digitare. La costruzione delle azioni candidate, la verifica degli esiti e la gestione del ciclo restano responsabilità dell'applicazione.
