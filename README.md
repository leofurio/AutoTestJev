# autoJev

Web app locale con backend **Python / FastAPI**, frontend **React / TypeScript / Vite (Node.js)**, decisore **Jev via OpenRouter** e un server **Selenium MCP** incluso. Nessun LLM generativo nel ciclo.

## Avvio

Requisiti: Python 3.11+, Node.js 20.19+ e Google Chrome. Setup e avvio funzionano con gli stessi comandi su Windows, macOS e Linux.

```bash
npm run setup
npm start
```

Apri **http://127.0.0.1:8000**. `npm run setup` installa le dipendenze, prepara `.env` se assente e compila il frontend. Il primo avvio di Selenium può scaricare ChromeDriver tramite Selenium Manager nella cartella `.runtime/selenium`.

### Windows (PowerShell o Prompt dei comandi)

Installa Python e Node.js, poi apri un nuovo terminale nella cartella del progetto. Non servono WSL, Git Bash o l'attivazione manuale di `.venv`.

```powershell
npm.cmd run setup
notepad .env
npm.cmd start
```

`npm.cmd` evita eventuali restrizioni di PowerShell su `npm.ps1`, senza modificare l'Execution Policy. Nel Prompt dei comandi puoi usare anche `npm`. Il setup cerca Python tramite `py -3`, `python` e `python3`, e usa `.venv\Scripts\python.exe`. Su macOS/Linux usa `.venv/bin/python`.

Per scegliere un'installazione Python specifica, prima del setup in PowerShell:

```powershell
$env:AUTOJEV_PYTHON = "C:\Program Files\Python314\python.exe"
npm.cmd run setup
```

Sostituisci il percorso con quello della tua installazione. Se trasferisci il progetto da un altro sistema, usa una copia senza `.venv` e `node_modules`: il setup li ricrea sul computer di destinazione. Il file `.env` esistente viene conservato. Per controllare l'interprete effettivo: `npm.cmd run python -- --version`.

Per lo sviluppo con aggiornamento automatico:

```bash
npm run dev
```

Frontend su **http://127.0.0.1:5173**, backend su **http://127.0.0.1:8000**. Vite inoltra `/api` e `/playground` al backend. Per ricompilare dopo una modifica: `npm run build`, poi riavvia `npm start`.

## Prova senza chiave

Premi **Prova un esempio**, poi **Avvia demo**. L'app apre la pagina locale Trail Supply in un vero Chrome controllato tramite MCP, compila la ricerca e la taglia e preme Cerca. La demo usa una sequenza decisionale predefinita, non chiama Jev e non interpreta istruzioni diverse dall'esempio. Il risultato è visibile nell'anteprima e nel registro. Se cambi l'esempio, seleziona Jev live.

## Esempio SauceDemo

Premi **Esempio SauceDemo** per caricare URL, istruzione e valori da [examples/saucedemo.json](examples/saucedemo.json). Il flusso accede con l'account pubblico `standard_user` / `secret_sauce`, apre il prodotto **Sauce Labs Backpack**, lo aggiunge al carrello e ne verifica la quantità 1.

L'esempio seleziona **Jev live**: richiede la chiave OpenRouter. Il pulsante carica i tre input; l'esecuzione parte solo premendo **Avvia automazione**. Puoi cambiare il valore di `prodotto` per provare un altro articolo. Le credenziali di prova sono pubblicate nella [pagina di accesso SauceDemo](https://www.saucedemo.com/).

## Jev live

Configura nel file `.env` (mai nel frontend):

```dotenv
OPENROUTER_API_KEY=la_tua_chiave
JEV_MODEL=typesafe/jev-1.13
JEV_ENDPOINT=https://openrouter.ai/api/alpha/decisions
JEV_MIN_CONFIDENCE=0.65
MAX_STEPS=24
SELENIUM_HEADLESS=true
```

Riavvia il backend, seleziona **Jev live**, inserisci i tre input e avvia. L'endpoint Decisions è in alpha: modello ed endpoint sono configurabili. Le chiamate consumano il credito dell'account OpenRouter. La chiave non viene inviata al frontend.

Jev riceve l'istruzione, solo i valori effettivamente referenziati, lo stato testuale osservato della pagina e la cronologia essenziale. Le immagini restano nell'app locale. I valori sono dati letterali: la compilazione dei campi è effettuata dall'esecutore con il contenuto originale del JSON, senza generazione o sostituzione ricorsiva.

## Tre input

```json
{
  "url": "https://example.com",
  "instruction": "Cerca {{prodotto}} e seleziona la taglia {{taglia}}.",
  "values": {
    "prodotto": "scarpe da trekking",
    "taglia": "42"
  }
}
```

Vedi [INPUT_CONTRACT.md](INPUT_CONTRACT.md). Tutti i valori devono essere stringhe; le chiavi distinguono maiuscole e minuscole. La modalità di esecuzione è un'opzione dell'app esterna ai tre input.

## Architettura

```text
React / Vite → FastAPI → Jev (OpenRouter Decisions)
                         ↓ scelta di un candidato
               Esecutore Python / client MCP
                         ↓ MCP stdio
               Server Selenium MCP incluso → Chrome
                         ↑ stato pagina e schermata
```

- Ogni esecuzione possiede un server MCP e un browser isolati.
- Il client esegue il vero handshake MCP e verifica i tool con `list_tools`.
- I candidati contengono riferimenti a elementi realmente osservati e chiavi del JSON; Jev restituisce solo l'ID della scelta.
- Tool inclusi: `start_browser`, `navigate`, `observe`, `click`, `fill`, `select`, `scroll`, `back`, `wait`, `stop_browser`.
- Il server MCP può essere avviato separatamente con `npm run --silent mcp` (`npm.cmd run --silent mcp` in PowerShell). L'opzione `--silent` mantiene lo standard output riservato al protocollo MCP.
- L'avvio usa un loop Proactor su Windows anche con auto-reload, così le pipe del processo MCP restano disponibili. La chiusura del launcher termina anche i suoi processi figli su Windows.
- Una nuova osservazione segue ciascuna azione. Confidenza insufficiente, ripetizioni senza progresso e limite di azioni arrestano il ciclo.
- L'arresto richiesto attende la chiamata in corso (timeout MCP 60 s / OpenRouter 45 s), poi impedisce nuove azioni e chiude il browser.
- La scelta `done` è un giudizio del decisore: la schermata finale permette la verifica umana, non costituisce una garanzia formale di successo.

## Ambito della prima versione

Navigazione, clic, compilazione di input/textarea, select, scroll verso il basso, attesa e ritorno alla pagina precedente nel documento principale. Si osservano fino a 40 elementi interattivi visibili e 14.000 caratteri di testo; Jev ha al massimo 255 azioni candidate. Iframe, shadow DOM, upload, download gestiti, autenticazione persistente e generazione di testo libero non sono implementati. Il ragionamento su siti sconosciuti dipende dalla qualità delle decisioni di Jev e va valutato su casi reali.

L'app è progettata per l'uso locale, senza autenticazione multiutente; ascolta solo su loopback e rifiuta mutazioni cross-origin. Esegue una sessione alla volta. Conserva fino a 20 registri e le ultime schermate in memoria, persi al riavvio; il registro è scaricabile dalla UI. La pagina del browser può contenere dati inseriti durante la sessione. Non vengono salvati task o chiavi in localStorage. Non esporre il server locale direttamente in rete.

## Verifica

```bash
npm test
npm run lint
npm run build
```

I test coprono validazione, sostituzione letterale, candidati, contratto OpenRouter con risposte simulate, errori, confidenza, arresto e ripetizioni. Per il test end-to-end con Chrome reale, con il server avviato:

```bash
npm run smoke
```

Il test esegue la demo locale attraverso l'API, verifica le azioni MCP e la schermata finale. Non usa chiavi e non misura l'accuratezza di Jev live.

`npm test` include test Node per percorsi Windows, individuazione di Python, argomenti con spazi e gestione degli errori, oltre ai test Python con handshake MCP reale. Il workflow `Platform compatibility` verifica setup, build, test e lint su runner Windows e Linux, con Python 3.11 e 3.14; viene eseguito dopo la pubblicazione delle modifiche su GitHub. Il workflow non avvia Chrome né usa la chiave OpenRouter.

## Riferimenti API

- [TypeSafe · Choice](https://docs.typesafe.ai/primitives/choice)
- [OpenRouter · Jev recipes](https://openrouter.ai/labs/jev/compile)
- [OpenRouter · Decisions provider](https://github.com/OpenRouterTeam/ai-sdk-provider)
- [MCP Python SDK v1](https://github.com/modelcontextprotocol/python-sdk/tree/v1.x)
