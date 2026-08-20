# Scatto Forza 30 — PWA

Versione autonoma e installabile dello **Scatto Forza 30**. Include il programma completo di 4 settimane e 12 allenamenti, sagome atletiche professionali con movimenti tecnici fluidi, timer guidato, segnali acustici e voce italiana. Registra automaticamente allenamento, data, ora di inizio, ora di fine, durata effettiva e stato. Non richiede il runtime Tasklet: progressi e registro sono salvati nel `localStorage` del dispositivo.

## Requisiti

- Node.js 18+ (consigliato Node.js 20+)
- npm

## Avvio locale

```bash
npm install
npm run dev
```

Apri l'indirizzo mostrato da Vite (di solito `http://localhost:5173`). Per simulare la versione pubblicata:

```bash
npm run build
npm run preview
```

La cartella `dist/` è già inclusa nel pacchetto e viene rigenerata da `npm run build`.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub e copia dentro il repository tutti i file di questa cartella (oppure usa il contenuto come base del repository).
2. Esegui `npm install` e `npm run build`.
3. Il workflow già incluso in `.github/workflows/deploy-pages.yml` esegue `npm ci`, `npm run build` e pubblica automaticamente `dist` su GitHub Pages a ogni push su `main`.
4. Nel repository apri **Settings → Pages** e imposta **Source: GitHub Actions**. Dopo il primo workflow completato troverai l'URL pubblico nella sezione Pages e nella pagina dell'esecuzione Actions.
5. In alternativa, puoi usare un tuo workflow o pubblicare `dist` con il metodo Pages supportato dal tuo repository.

Il progetto usa `base: './'` in `vite.config.ts` e URL relativi nel manifest/service worker: funziona anche dentro un sottopercorso del tipo `https://utente.github.io/nome-repo/`.

## Installazione su smartphone

### Android (Chrome)

1. Apri l'URL HTTPS di GitHub Pages in Chrome.
2. Attendi il primo caricamento (serve a preparare la cache offline).
3. Apri il menu ⋮ e scegli **Installa app** (o **Aggiungi a schermata Home**).
4. Conferma. L'app si aprirà in modalità autonoma.

### iPhone/iPad (Safari)

1. Apri l'URL HTTPS in Safari.
2. Tocca **Condividi**.
3. Scegli **Aggiungi alla schermata Home** e conferma.

Su iPhone la voce guidata dipende dal volume/silenzioso e dalle impostazioni di iOS; avvia il timer con un gesto dopo aver collegato le cuffie.

## Dati e offline

- I completamenti sono memorizzati localmente con la chiave `scatto-forza-30-progress`.
- Il registro delle sedute è memorizzato con la chiave `scatto-forza-30-session-log`.
- Non viene usato alcun database o servizio remoto.
- Il service worker (`public/sw.js`) mette in cache il guscio dell'app e le risorse caricate, così l'app può essere usata offline dopo la prima visita.
- Per azzerare il programma, cancella i dati del sito dal browser oppure esegui in console: `localStorage.removeItem('scatto-forza-30-progress')`.

## Limiti noti

- La sintesi vocale usa `SpeechSynthesis` del browser e le voci/lingue disponibili sul dispositivo; alcune versioni iOS richiedono che il timer sia avviato con un tocco.
- Il blocco schermo (`Wake Lock`) è facoltativo e dipende dal browser.
- GitHub Pages deve essere servito in HTTPS per installazione PWA, service worker e Wake Lock.
- La pagina pubblicata deve usare un server HTTP(S): aprire `dist/index.html` direttamente come file locale può impedire service worker e alcune API.
