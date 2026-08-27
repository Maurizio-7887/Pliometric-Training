# Scatto Forza 30 — PWA

PWA installabile per il programma di pliometria e le ripetute GPS. Funziona prima di tutto in locale; opzionalmente sincronizza il registro su un servizio Railway privato, con dashboard desktop per il solo proprietario.

## Sviluppo e pubblicazione

Richiede Node.js 20+ e npm:

```bash
npm ci
npm run dev
npm run build
npm run preview
```

Il workflow GitHub Pages esegue `npm ci` e `npm run build` a ogni push su `main`. `vite.config.ts` usa URL relativi, quindi l'app funziona anche sotto `https://utente.github.io/nome-repository/`.

Per installarla, visita l'URL HTTPS di Pages da Chrome Android (**Installa app/Aggiungi a schermata Home**) o Safari iOS (**Condividi → Aggiungi a schermata Home**). Voice, GPS e Wake Lock dipendono dal browser e dai permessi del telefono.

## Dati, ripresa e offline

- Progressi e registro sono mantenuti nel `localStorage` (`scatto-forza-30-progress` e `scatto-forza-30-session-log`). Le installazioni precedenti con questi nomi continuano a funzionare.
- Un checkpoint della seduta guidata o delle ripetute è salvato localmente. Alla riapertura viene proposta la ripresa **in pausa**: countdown, recupero e GPS non avanzano durante la chiusura/offline.
- Le modifiche da inviare sono conservate nella outbox `scatto-forza-30-sync-outbox`. Se la rete o Railway non sono disponibili, restano nella coda e vengono ritentate al ritorno online o con **Invia ora**.
- Il service worker mette in cache soltanto app shell e asset statici dello stesso sito; non intercetta API o richieste cross-origin e non conserva risposte di sincronizzazione.
- Da Registro allenamenti, **Cancella dati locali** pulisce solo questo dispositivo e disattiva la reimportazione automatica delle vecchie copie Railway. Il database remoto non viene cancellato.

## Collegare un telefono a Railway

La chiave `SYNC_KEY` è la chiave master del proprietario: non va copiata sui telefoni nuovi. Il server deve definire `PUBLIC_API_URL` come URL HTTPS canonico pubblico: il pairing e il QR/link non deducono più l’host dalla richiesta.

1. Configura e apri il dashboard Railway come descritto in [`server/RAILWAY.md`](server/RAILWAY.md).
2. Nel dashboard autenticato, genera un codice di associazione: è di 6 cifre, monouso e valido 10 minuti.
3. Sul telefono apri **Registro allenamenti → Associa questo dispositivo**, inserisci codice e nome del telefono. In alternativa usa il link copiabile creato dal dashboard: compila automaticamente codice e server.
4. Il server restituisce un token casuale, conservato localmente dal telefono. Nel database viene conservato esclusivamente il suo hash. Il proprietario può revocarlo dal dashboard; quel telefono dovrà poi associarsi di nuovo.

Le configurazioni precedenti che conservavano la chiave nel vecchio storage `scatto-forza-30-sync-token` restano leggibili per consentire la migrazione. Associa il dispositivo appena possibile per sostituire tale chiave master con un token revocabile.

## Limiti

- Il token dispositivo è in `localStorage`, quindi la protezione del telefono/browser rimane importante. Non è una soluzione per account multiutente: il servizio gestisce volutamente un solo proprietario e un solo registro condiviso.
- Le tracce GPS sono stime e dipendono dal segnale. Una seduta ripresa richiede di riattivare il GPS dal pulsante **RIPRENDI**.
- La cache offline richiede almeno una prima visita riuscita e non può aggiornare l'app senza rete.
