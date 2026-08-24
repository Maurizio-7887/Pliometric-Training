# Railway — Scatto Forza 30

Il servizio Railway conserva il registro condiviso della PWA e serve il **dashboard desktop di sola analisi**. L’app GitHub Pages rimane invece l’esperienza mobile per RIPETUTE, PLIOMETRIA e registro.

## 1. Crea PostgreSQL

Nel progetto Railway crea un servizio **PostgreSQL**. Railway può esporre `DATABASE_URL` al servizio API tramite riferimento a variabile. Il database e la chiave non devono essere inseriti nel repository.

## 2. Crea il servizio API dal repository GitHub

Aggiungi un servizio dal repository `Maurizio-7887/Pliometric-Training` e configura:

- **Root Directory:** `/server`
- **Start Command:** `npm start` (normalmente rilevato in automatico)
- **Healthcheck Path:** `/health`

Il server inizializza automaticamente le tabelle `workout_sessions` e `training_state` al primo avvio.

## 3. Variabili del servizio API

Imposta nelle **Variables**:

| Variabile | Valore |
| --- | --- |
| `DATABASE_URL` | riferimento alla variabile del servizio PostgreSQL |
| `SYNC_KEY` | chiave casuale personale di almeno 24 caratteri; consigliati 40+ |
| `ALLOWED_ORIGINS` | `https://maurizio-7887.github.io` (aggiungi altri domini Pages separandoli con virgole, se necessari) |
| `PGSSLMODE` | `disable` per API e PostgreSQL nella rete privata Railway; `require` solo per un database SSL pubblico |

Non pubblicare mai `DATABASE_URL` o `SYNC_KEY`. La `SYNC_KEY` è la stessa da inserire una volta nel telefono e nel browser desktop.

## 4. Dominio e verifica

In **Settings → Networking** genera un dominio pubblico HTTPS, per esempio:

```text
https://nome-servizio.up.railway.app
```

Controlla prima la salute del servizio:

```text
https://nome-servizio.up.railway.app/health
```

La risposta attesa è:

```json
{"ok":true,"database":"postgresql"}
```

## 5. Collega la PWA mobile

Nella PWA GitHub Pages apri **Registro allenamenti** e, nella scheda **Salvataggio online**, scegli **Collega questo dispositivo**. Inserisci:

1. l’indirizzo API Railway completo (senza `/api/sync`);
2. la stessa `SYNC_KEY` delle Variables.

Dopo **Salva collegamento**, le sedute restano registrate anche offline e vengono inviate automaticamente al ritorno della rete. Il pulsante **Invia ora** serve solo a forzare l’invio: la PWA non espone grafici o analisi desktop.

## 6. Apri l’analisi sul PC

Su un computer visita:

```text
https://nome-servizio.up.railway.app/dashboard
```

Il dashboard chiede la `SYNC_KEY` nel browser, poi legge i record dall’endpoint già autenticato `/api/sync`. La chiave viene salvata nel `localStorage` **solo di quel browser**, non nei link né nel database. Usa **Esci** nel dashboard per rimuoverla dal browser.

Il dashboard non contiene comandi per avviare allenamenti: mostra soltanto riepilogo delle sedute, chilometri GPS, passo per 400/800/1.000 m, tendenze, volume recente, consigli e registro recente.

## Risoluzione problemi

- **401 / “chiave non valida”**: verifica che PWA e dashboard usino esattamente la `SYNC_KEY` attuale del servizio Railway.
- **Errore CORS nella PWA**: aggiungi l’esatto dominio GitHub Pages a `ALLOWED_ORIGINS`, senza slash finale, quindi ridistribuisci o riavvia il servizio.
- **Dashboard senza sedute**: apri la PWA e usa **Invia ora** dopo aver completato una seduta; controlla quindi `/health` e riprova il dashboard.
- **PWA offline**: i record rimangono nel browser e vengono ritentati quando la rete torna disponibile.
