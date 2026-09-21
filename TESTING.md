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
