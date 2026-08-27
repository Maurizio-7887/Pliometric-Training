# Railway — Scatto Forza 30

Il servizio Railway contiene **un solo registro del proprietario** e serve il dashboard desktop. La PWA GitHub Pages resta l'interfaccia mobile per allenarsi e usa token per singolo dispositivo, non la chiave master.

## Distribuzione

1. Nel progetto Railway crea PostgreSQL.
2. Crea un servizio dal repository `Maurizio-7887/Pliometric-Training`, con **Root Directory** `/server`, **Start Command** `npm start` e healthcheck `/health`.
3. Genera un dominio pubblico HTTPS e verifica `https://<servizio>.up.railway.app/health`. La risposta attesa è `{"ok":true,"database":"postgresql"}`.

All'avvio il server crea/migra automaticamente le vecchie tabelle `workout_sessions` e `training_state`, quindi i registri già esistenti restano disponibili. Aggiunge anche `pairing_codes` e `device_tokens`.

## Variabili Railway

| Variabile | Obbligatoria | Valore |
| --- | --- | --- |
| `DATABASE_URL` | sì | riferimento al servizio PostgreSQL |
| `SYNC_KEY` | sì | chiave master casuale del proprietario, almeno 24 caratteri (40+ consigliati) |
| `ALLOWED_ORIGINS` | sì | es. `https://maurizio-7887.github.io`; più origini separate da virgole, senza slash finale |
| `PUBLIC_API_URL` | sì in produzione | URL HTTPS canonico pubblico dell’API, es. `https://<servizio>.up.railway.app`; non usare URL di preview né host derivati dalla richiesta |
| `PAIRING_APP_URL` | consigliata | URL completo della PWA Pages, es. `https://maurizio-7887.github.io/Pliometric-Training/`; abilita il link copiabile di associazione |
| `PAIRING_GLOBAL_LIMIT` | no | tentativi di pairing per account/servizio ogni 10 minuti (default `60`) |
| `PAIRING_CODE_MAX_ATTEMPTS` | no | tentativi consentiti per lo stesso codice inserito (default `5`) |
| `PGSSLMODE` | no | `disable` nella rete privata Railway; `require` solo per PostgreSQL SSL pubblico |

Non mettere mai `DATABASE_URL` o `SYNC_KEY` nel repository, nel link di pairing o nel telefono. Se `PAIRING_APP_URL` manca il dashboard mostra comunque il codice breve, ma non il link copiabile.

## Flusso proprietario/dispositivi

1. Apri `https://<servizio>.up.railway.app/dashboard` sul desktop e accedi con `SYNC_KEY`. La chiave viene mantenuta solo nel localStorage di quel browser; **Esci** la rimuove.
2. Nella sezione **Dispositivi** scegli **Genera codice**. Ogni codice ha sei cifre, è monouso e scade dopo 10 minuti. I tentativi sono limitati sia per IP, sia globalmente per servizio, sia per singolo codice.
3. Copia il link proposto sul telefono, oppure digita il codice nella PWA in **Registro allenamenti**. Il pairing restituisce un token random al dispositivo una sola volta; Railway conserva soltanto SHA-256 del token.
4. Il dashboard elenca i dispositivi e permette **Revoca**. Dopo la revoca il token riceve 401 e il telefono deve essere associato di nuovo.

`/api/sync` accetta sia token dispositivo sia `SYNC_KEY` per continuità delle installazioni precedenti. Usa questa compatibilità solo per migrare: associando il telefono si sostituisce la chiave master memorizzata dal client. Il dashboard e le API di generazione/revoca restano riservati alla chiave master.

## Diagnostica

- **401 token non valido/revocato**: genera un nuovo codice nel dashboard e associa nuovamente quel dispositivo.
- **URL pubblico**: in produzione imposta sempre `PUBLIC_API_URL` HTTPS; il server rifiuta HTTP. In sviluppo accetta il fallback `http://localhost:<PORT>`.
- **CORS**: aggiungi l'origine esatta di GitHub Pages a `ALLOWED_ORIGINS`, poi riavvia/ridistribuisci il servizio.
- **Link non disponibile**: valorizza `PAIRING_APP_URL` con l'URL effettivo della PWA, incluso eventuale sottopercorso.
- **Dati in attesa**: la PWA conserva la outbox finché `/api/sync` non conferma i record; aprila online o usa **Invia ora**.
