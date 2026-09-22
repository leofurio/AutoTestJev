# Verifica della prima versione

Verifica locale eseguita il 20 settembre 2026.

- Test Python: validazione dei tre input, valori letterali, segnaposto mancanti e ripetuti, generazione candidati, contratto Decisions, errori del provider, chiave assente, confidenza insufficiente, annullamento, ripetizioni e API locale.
- Frontend TypeScript: compilazione e build Vite riuscite.
- Controllo statico Python: Ruff superato.
- Test end-to-end con Chrome reale e server Selenium MCP via stdio: `fill → select → click`, conclusione in 3,3 secondi. La schermata mostra due risultati per «scarpe da trekking», taglia 42.
- Test dall'interfaccia: caricamento dell'esempio, avvio, aggiornamento del registro e della schermata, stato finale «Completata».
- Layout verificato a 390 px: larghezza del documento uguale alla viewport, senza overflow orizzontale.

Le risposte Jev sono simulate nei test automatici. Non è stata effettuata una chiamata reale a OpenRouter: la chiave non era configurata. La demo non è una misura dell'accuratezza di Jev né una prova su siti esterni.

Per ripetere le verifiche, consulta i comandi in `README.md`.

## Supporto Windows — 22 settembre 2026

Verifiche eseguite su macOS dopo l'introduzione dei launcher portabili:

- `npm run setup`: installazione e build completate con il nuovo script Node.
- `npm test`: 9 test Node e 39 test Python superati, inclusi subprocess con pipe e handshake MCP reale.
- `npm run lint`: superato.
- Backend avviato con il nuovo launcher, loop esplicito e auto-reload sulla porta di test 8012: demo Chrome/MCP completata in 3,2 secondi con azioni `fill → select → click`.
- `git diff --check`: superato.

I test Node verificano anche i percorsi Windows e gli argomenti contenenti spazi. Non è stata eseguita una sessione Windows nativa in questo ambiente. Il workflow `.github/workflows/compatibility.yml` prepara la verifica su Windows e Linux con Python 3.11 e 3.14 dopo la pubblicazione su GitHub; non include Chrome o chiamate OpenRouter.
