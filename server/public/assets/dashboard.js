(() => {
  'use strict';
  const STORAGE_KEY = 'scatto-forza-30-dashboard-sync-key';
  const $ = id => document.getElementById(id);
  const els = {
    login: $('login-view'), dashboard: $('dashboard-view'), error: $('dashboard-error'),
    form: $('login-form'), key: $('sync-key'), loginError: $('login-error'), loginButton: $('login-button'),
    reveal: $('key-visibility'), refresh: $('refresh-button'), forget: $('forget-button'), state: $('connection-state'),
    retry: $('retry-button'), errorText: $('dashboard-error-text'),
    pairingButton: $('pairing-button'), pairingResult: $('pairing-result'), pairingCode: $('pairing-code'),
    pairingExpiry: $('pairing-expiry'), pairingError: $('pairing-error'),
  };
  let activeKey = '';
  let lastPayload = null;

  const dateFormat = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  const shortDate = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' });
  const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
  const number = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
  const athleteProfile = Object.freeze({ weightKg: 84, heightCm: 175, age: 60, sex: 'M' });
  const PLYO_MET = 8;
  // Catalogo di riserva per mostrare anche gli esercizi delle sedute già salvate
  // prima che il telefono iniziasse a inviare il dettaglio nominale.
  const plyoCatalog = {
    "w1d1": [["Riscaldamento dinamico",1],["Pogo jumps",3],["Squat jump",3],["Salto in lungo da fermo",3],["Calf raise esplosivo monopodalico",3],["Accelerazioni 20 m",4],["Defaticamento",1]],
    "w1d2": [["Riscaldamento dinamico",1],["Piedi rapidi sulla linea",4],["Skater bounds",3],["Piedi rapidi laterali",4],["Accelerazione e arresto",4],["Power skip",3],["Defaticamento",1]],
    "w1d3": [["Riscaldamento dinamico",1],["Pogo jumps",3],["Balzi alternati",3],["Salto in lungo da fermo",3],["Accelerazioni 20 m",5],["Calf raise esplosivo monopodalico",3],["Defaticamento",1]],
    "w2d1": [["Riscaldamento dinamico",1],["Pogo jumps",4],["Squat jump",4],["Tuck jump controllato",3],["Split squat jump",3],["Accelerazioni 20 m",4],["Defaticamento",1]],
    "w2d2": [["Riscaldamento dinamico",1],["Skater bounds",4],["Piedi rapidi laterali",5],["Piedi rapidi sulla linea",4],["Accelerazione e arresto",5],["Power skip",3],["Defaticamento",1]],
    "w2d3": [["Riscaldamento dinamico",1],["Pogo jumps",4],["Balzi alternati",4],["Salto in lungo da fermo",4],["Sprint breve in salita",5],["Calf raise esplosivo monopodalico",3],["Defaticamento",1]],
    "w3d1": [["Riscaldamento dinamico",1],["Pogo jumps",4],["Squat jump",4],["Tuck jump controllato",4],["Salto in lungo da fermo",4],["Accelerazioni 20 m",5],["Defaticamento",1]],
    "w3d2": [["Riscaldamento dinamico",1],["Piedi rapidi sulla linea",5],["Piedi rapidi laterali",5],["Skater bounds",4],["Accelerazione e arresto",5],["Accelerazioni 20 m",4],["Defaticamento",1]],
    "w3d3": [["Riscaldamento dinamico",1],["Power skip",4],["Balzi alternati",4],["Split squat jump",3],["Sprint breve in salita",6],["Calf raise esplosivo monopodalico",3],["Defaticamento",1]],
    "w4d1": [["Riscaldamento dinamico",1],["Pogo jumps",3],["Squat jump",3],["Salto in lungo da fermo",3],["Accelerazioni 20 m",4],["Defaticamento",1]],
    "w4d2": [["Riscaldamento dinamico",1],["Piedi rapidi sulla linea",3],["Piedi rapidi laterali",3],["Skater bounds",3],["Accelerazione e arresto",3],["Power skip",3],["Defaticamento",1]],
    "w4d3": [["Riscaldamento dinamico",1],["Pogo jumps",3],["Salto in lungo da fermo",3],["Squat jump",3],["Accelerazioni 20 m",4],["Calf raise esplosivo monopodalico",2],["Defaticamento",1]],
  };

  function pace(value) {
    if (!Number.isFinite(value) || value <= 0) return '—';
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function duration(value) {
    if (!Number.isFinite(value) || value < 0) return '—';
    const minutes = Math.floor(value / 60);
    return minutes ? `${minutes} min ${Math.round(value % 60)} s` : `${Math.round(value)} s`;
  }
  function asDate(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }
  function setConnection(label, live) {
    els.state.textContent = label;
    els.state.classList.toggle('is-live', live);
  }
  function showDashboard() {
    els.login.classList.add('is-hidden');
    els.error.classList.add('is-hidden');
    els.dashboard.classList.remove('is-hidden');
    els.refresh.classList.remove('is-hidden');
    els.forget.classList.remove('is-hidden');
  }
  function showLogin(message = '') {
    els.dashboard.classList.add('is-hidden');
    els.error.classList.add('is-hidden');
    els.login.classList.remove('is-hidden');
    els.refresh.classList.add('is-hidden');
    els.forget.classList.add('is-hidden');
    els.loginError.textContent = message;
    setConnection('Accesso richiesto', false);
  }
  function showError(message) {
    els.dashboard.classList.add('is-hidden');
    els.login.classList.add('is-hidden');
    els.error.classList.remove('is-hidden');
    els.errorText.textContent = message;
    els.refresh.classList.remove('is-hidden');
    els.forget.classList.remove('is-hidden');
    setConnection('Connessione non riuscita', false);
  }
  function sessionTotals(log) {
    const reps = Array.isArray(log.runRepetitions) ? log.runRepetitions : [];
    const distance = Number(log.totalDistanceMeters) || reps.reduce((sum, rep) => sum + (Number(rep?.distanceMeters) || 0), 0);
    const seconds = reps.reduce((sum, rep) => sum + (Number(rep?.durationSeconds) || 0), 0);
    const averagePace = Number(log.averagePaceSecondsPerKm) || (distance > 0 && seconds > 0 ? seconds / (distance / 1000) : null);
    const match = String(log.workoutId || '').match(/ripetute-(400|800|1000)m/i);
    return { distance, seconds, averagePace, target: match ? Number(match[1]) : null };
  }
  function effectiveDurationSeconds(log) {
    const saved = Number(log?.durationSeconds);
    // Salvagente per le sedute pliometriche storiche che conteggiavano anche i giorni
    // di sospensione. I nuovi allenamenti inviano già la somma esatta dei segmenti attivi.
    if (/^w[1-4]d[1-3]$/.test(String(log?.workoutId || '')) && saved > 21600) {
      return String(log.workoutId).startsWith('w4d') ? 2190 : 2400;
    }
    return saved;
  }
  function normalize(payload) {
    const raw = Array.isArray(payload?.logs) ? payload.logs : [];
    // Interrupted work is a useful part of the plyometric record, while run charts stay
    // restricted to completed interval sessions so their pace comparison remains meaningful.
    const terminal = raw.filter(log => log && ['completato', 'interrotto'].includes(log.status) && asDate(log.startedAt))
      .map(log => ({ ...log, durationSeconds: effectiveDurationSeconds(log), date: asDate(log.startedAt), run: sessionTotals(log) }))
      .sort((a, b) => b.date - a.date);
    const completed = terminal.filter(log => log.status === 'completato');
    const runs = completed.filter(log => log.run.target || Array.isArray(log.runRepetitions) && log.runRepetitions.length);
    const plyo = terminal.filter(log => !(log.run.target || Array.isArray(log.runRepetitions) && log.runRepetitions.length));
    return { completed, runs, plyo };
  }
  function monday(date) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    return copy;
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

  function renderMetrics(data) {
    const totalDistance = data.runs.reduce((sum, log) => sum + log.run.distance, 0);
    $('metric-sessions').textContent = integer.format(data.completed.length);
    $('metric-sessions-note').textContent = data.completed.length === 1 ? 'nel registro' : 'nel registro';
    $('metric-runs').textContent = integer.format(data.runs.length);
    $('metric-runs-note').textContent = data.runs.length ? `${integer.format(data.runs.reduce((sum, log) => sum + (Array.isArray(log.runRepetitions) ? log.runRepetitions.length : 0), 0))} prove misurate` : 'nessuna ancora';
    $('metric-distance').textContent = `${number.format(totalDistance / 1000)} km`;
    const completedPlyo = data.plyo.filter(log => log.status === 'completato').length;
    const interruptedPlyo = data.plyo.filter(log => log.status === 'interrotto').length;
    $('metric-plyo').textContent = integer.format(completedPlyo);
    $('metric-plyo-note').textContent = interruptedPlyo ? `${integer.format(interruptedPlyo)} interrotta${interruptedPlyo === 1 ? '' : 'e'}` : (completedPlyo === 1 ? 'seduta completata' : 'sedute completate');
    $('data-summary').textContent = data.completed.length
      ? `${data.completed.length} sedute completate disponibili nel registro Railway.`
      : 'Il registro è pronto: completa una seduta dalla PWA per iniziare a leggere i dati.';
    $('updated-at').textContent = dateTime.format(new Date());
  }

  function renderPaceChart(runs) {
    const container = $('pace-chart');
    const empty = $('pace-chart-empty');
    const data = runs.filter(item => Number.isFinite(item.run.averagePace) && item.run.averagePace > 0).slice(0, 12).reverse();
    container.innerHTML = '';
    empty.classList.toggle('is-visible', !data.length);
    if (!data.length) return;
    const width = 760, height = 265, padding = { top: 22, right: 18, bottom: 33, left: 43 };
    const values = data.map(item => item.run.averagePace);
    const rawMin = Math.min(...values), rawMax = Math.max(...values);
    const spread = Math.max(12, rawMax - rawMin);
    const min = Math.max(0, rawMin - spread * .3), max = rawMax + spread * .3;
    const innerW = width - padding.left - padding.right, innerH = height - padding.top - padding.bottom;
    const x = index => padding.left + (data.length === 1 ? innerW / 2 : index / (data.length - 1) * innerW);
    const y = value => padding.top + (max - value) / (max - min) * innerH;
    const id = 'pace-area';
    const grid = [0, .5, 1].map(step => { const value = min + (max - min) * step; const yy = y(value); return `<line class="chart-grid" x1="${padding.left}" x2="${width - padding.right}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="0" y="${yy + 4}">${pace(value)}</text>`; }).join('');
    const line = data.map((item, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(item.run.averagePace).toFixed(1)}`).join(' ');
    const area = `${line} L ${x(data.length - 1)} ${height - padding.bottom} L ${x(0)} ${height - padding.bottom} Z`;
    const labels = data.map((item, index) => (data.length <= 6 || index === 0 || index === data.length - 1 || index % 2 === 0) ? `<text class="chart-label" text-anchor="middle" x="${x(index)}" y="${height - 8}">${shortDate.format(item.date)}</text>` : '').join('');
    const dots = data.map((item, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(item.run.averagePace)}" r="4"><title>${dateFormat.format(item.date)} · ${item.run.target || 'Ripetute'} m · ${pace(item.run.averagePace)} min/km</title></circle>`).join('');
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#65a773" stop-opacity=".30"/><stop offset="1" stop-color="#65a773" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area" fill="url(#${id})" d="${area}"/><path class="chart-line" d="${line}"/>${dots}${labels}</svg>`;
  }

  function renderVolumeChart(runs) {
    const container = $('volume-chart');
    const empty = $('volume-chart-empty');
    const nowMonday = monday(new Date());
    const weeks = Array.from({ length: 8 }, (_, index) => { const date = new Date(nowMonday); date.setDate(nowMonday.getDate() - (7 - index) * 7); return { date, distance: 0 }; });
    runs.forEach(log => { const start = monday(log.date); const bucket = weeks.find(week => sameDay(week.date, start)); if (bucket) bucket.distance += log.run.distance; });
    const hasDistance = weeks.some(week => week.distance > 0);
    container.innerHTML = '';
    empty.classList.toggle('is-visible', !hasDistance);
    if (!hasDistance) { $('volume-total').textContent = '—'; return; }
    const max = Math.max(...weeks.map(week => week.distance), 1);
    container.innerHTML = weeks.map((week, index) => {
      const percentage = Math.max(3, week.distance / max * 100);
      const label = index === 7 ? 'questa' : shortDate.format(week.date);
      return `<div class="volume-column"><div class="volume-bar" style="height:${percentage}%"><b>${week.distance ? `${number.format(week.distance / 1000)} km` : ''}</b></div><small>${label}</small></div>`;
    }).join('');
    const total = weeks.reduce((sum, week) => sum + week.distance, 0);
    $('volume-total').textContent = `${number.format(total / 1000)} km / 8 sett.`;
  }

  function trendMarkup(entries) {
    const latest = average(entries.slice(0, 3).map(item => item.run.averagePace).filter(Number.isFinite));
    const before = average(entries.slice(3, 6).map(item => item.run.averagePace).filter(Number.isFinite));
    if (latest == null || before == null) return '<span class="trend neutral">Servono 6 sedute</span>';
    const change = Math.round(latest - before);
    if (Math.abs(change) < 3) return '<span class="trend neutral">→ andamento stabile</span>';
    return change < 0
      ? `<span class="trend good">↓ ${Math.abs(change)} sec/km più veloce</span>`
      : `<span class="trend warn">↑ ${change} sec/km più lento</span>`;
  }
  function renderPaceCards(runs) {
    const container = $('pace-cards');
    container.innerHTML = [400, 800, 1000].map(target => {
      const entries = runs.filter(log => log.run.target === target && Number.isFinite(log.run.averagePace));
      const values = entries.map(item => item.run.averagePace);
      const latest = values[0] ?? null;
      const best = values.length ? Math.min(...values) : null;
      return `<article class="distance-card"><header><strong>${target} metri</strong><span>${entries.length} ${entries.length === 1 ? 'seduta' : 'sedute'}</span></header><div class="pace-value">${latest == null ? '—' : pace(latest)} <small>min/km</small></div><div class="distance-stats"><div><span>Migliore</span><b>${best == null ? '—' : `${pace(best)} min/km`}</b></div><div><span>Tendenza</span><b>${trendMarkup(entries)}</b></div></div></article>`;
    }).join('');
  }

  function plyoEstimate(durationSeconds) {
    const minutes = Math.max(0, Number(durationSeconds) || 0) / 60;
    // Stima standard MET: kcal = MET × 3,5 × kg / 200 × minuti.
    // La pliometria vigorosa usa prevalentemente glicogeno: mostriamo una ripartizione
    // teorica 80% carboidrati / 20% grassi, non una misura metabolica individuale.
    const calories = PLYO_MET * 3.5 * athleteProfile.weightKg / 200 * minutes;
    return {
      calories: Math.round(calories),
      carbohydratesGrams: Math.round(calories * 0.8 / 4),
      fatGrams: Math.round(calories * 0.2 / 9),
      load: Math.round(PLYO_MET * minutes),
    };
  }

  function plyoEstimateMarkup(log) {
    const estimate = plyoEstimate(log.durationSeconds);
    return `<div class="plyo-estimates" aria-label="Stime energetiche teoriche"><div><b>${integer.format(estimate.calories)}</b><small>kcal stimate</small></div><div><b>${integer.format(estimate.carbohydratesGrams)} g</b><small>carboidrati stimati</small></div><div><b>${integer.format(estimate.fatGrams)} g</b><small>grassi stimati</small></div><div><b>${PLYO_MET} MET</b><small>intensità vigorosa</small></div><div><b>${integer.format(estimate.load)}</b><small>carico MET·min</small></div></div><div class="plyo-estimate-note">Stima standard sul profilo: uomo, 60 anni, 84 kg, 1,75 m. I grammi indicano substrati energetici teorici, non perdita di peso corporeo.</div>`;
  }

  function performedExerciseMarkup(log) {
    let entries = Array.isArray(log.performedExercises)
      ? log.performedExercises.map(item => ({ name: String(item?.name || ''), completedSets: Number(item?.completedSets), plannedSets: Number(item?.plannedSets) })).filter(item => item.name && item.completedSets > 0)
      : [];
    if (!entries.length) {
      const catalog = plyoCatalog[String(log.workoutId || '')];
      if (Array.isArray(catalog)) {
        let remaining = log.status === 'completato'
          ? catalog.reduce((sum, item) => sum + Number(item[1] || 0), 0)
          : Math.max(0, Number(log.completedSetCount) || 0);
        entries = catalog.map(([name, plannedSets]) => {
          const completedSets = Math.min(Number(plannedSets) || 0, remaining);
          remaining -= completedSets;
          return { name, completedSets, plannedSets };
        }).filter(item => item.completedSets > 0);
      }
    }
    if (!entries.length) return '<div class="plyo-exercise-empty">Nessun esercizio completato disponibile.</div>';
    return `<ol class="plyo-exercise-list" aria-label="Esercizi svolti">${entries.map(item => {
      const partial = Number.isFinite(item.plannedSets) && item.plannedSets > 0 && item.completedSets < item.plannedSets;
      const sets = partial ? `${integer.format(item.completedSets)}/${integer.format(item.plannedSets)} serie` : `${integer.format(item.completedSets)} ${item.completedSets === 1 ? 'serie' : 'serie'}`;
      return `<li><span>${escapeHtml(item.name)}</span><small>${sets}${partial ? ' · parziale' : ''}</small></li>`;
    }).join('')}</ol>`;
  }

  function renderPlyo(data) {
    const sessions = data.plyo;
    const completed = sessions.filter(item => item.status === 'completato');
    const interrupted = sessions.filter(item => item.status === 'interrotto');
    $('plyo-count').textContent = sessions.length ? `${completed.length} ✓ · ${interrupted.length} inter.` : '—';
    $('plyo-summary').textContent = sessions.length
      ? `${completed.length} completate, ${interrupted.length} interrotte. Il carico usa la durata effettiva salvata.`
      : 'Le sedute guidate concluse o terminate prima compariranno qui con il relativo progresso.';

    const container = $('plyo-load-chart');
    const empty = $('plyo-load-empty');
    const nowMonday = monday(new Date());
    const weeks = Array.from({ length: 8 }, (_, index) => { const date = new Date(nowMonday); date.setDate(nowMonday.getDate() - (7 - index) * 7); return { date, seconds: 0 }; });
    sessions.forEach(log => {
      const bucket = weeks.find(week => sameDay(week.date, monday(log.date)));
      if (bucket) bucket.seconds += Math.max(0, Number(log.durationSeconds) || 0);
    });
    const hasLoad = weeks.some(week => week.seconds > 0);
    container.innerHTML = '';
    empty.classList.toggle('is-visible', !hasLoad);
    if (hasLoad) {
      const max = Math.max(...weeks.map(week => week.seconds), 1);
      container.innerHTML = weeks.map((week, index) => {
        const percentage = Math.max(3, week.seconds / max * 100);
        const label = index === 7 ? 'questa' : shortDate.format(week.date);
        return `<div class="volume-column"><div class="volume-bar plyo-bar" style="height:${percentage}%"><b>${week.seconds ? `${integer.format(Math.round(week.seconds / 60))} min` : ''}</b></div><small>${label}</small></div>`;
      }).join('');
      const total = weeks.reduce((sum, week) => sum + week.seconds, 0);
      $('plyo-load-total').textContent = `${integer.format(Math.round(total / 60))} min totali · ultime 8 settimane`;
    } else $('plyo-load-total').textContent = '—';

    const list = $('plyo-session-list');
    list.innerHTML = sessions.length ? sessions.slice(0, 8).map(log => {
      const isInterrupted = log.status === 'interrotto';
      const planned = Number(log.plannedSetCount);
      const done = Number(log.completedSetCount);
      const progress = Number.isFinite(planned) && planned > 0 ? `${Number.isFinite(done) ? done : 0}/${planned} serie` : 'Progresso non disponibile';
      return `<div class="plyo-session-item"><div class="plyo-session-main"><div class="plyo-session-head"><div><div class="plyo-session-title">${escapeHtml(log.workoutTitle || 'Seduta pliometrica')}</div><div class="plyo-session-meta">${dateFormat.format(log.date)} · ${duration(Number(log.durationSeconds))} · ${progress}</div></div><span class="plyo-status ${isInterrupted ? 'is-interrupted' : 'is-complete'}">${isInterrupted ? 'INTERROTTA' : 'COMPLETATA'}</span></div>${plyoEstimateMarkup(log)}<div class="plyo-exercise-heading">ESERCIZI SVOLTI</div>${performedExerciseMarkup(log)}</div></div>`;
    }).join('') : '<div class="empty-state">Il registro pliometria è ancora vuoto.</div>';
  }

  function renderAdvice(data) {
    const suggestions = [];
    const latest = data.completed[0];
    if (!latest) suggestions.push('Completa la prima seduta dalla PWA: qui compariranno automaticamente volume, passo e andamento.');
    if (latest) {
      const elapsedHours = (Date.now() - latest.date.getTime()) / 3600000;
      if (elapsedHours < 48) suggestions.push(`L’ultima seduta è stata ${Math.max(1, Math.round(elapsedHours))} ore fa. Rispetta il recupero previsto prima di una nuova pliometria intensa.`);
      else if (elapsedHours > 7 * 24) suggestions.push('Non risultano allenamenti negli ultimi sette giorni. Riparti gradualmente, senza compensare il volume perso in una sola seduta.');
    }
    const recentEight = data.completed.slice(0, 8);
    const recentRuns = recentEight.filter(item => data.runs.includes(item)).length;
    const recentPlyo = recentEight.filter(item => data.plyo.includes(item)).length;
    if (recentRuns >= 3 && recentPlyo === 0) suggestions.push('Le ultime sedute sono tutte ripetute: inserisci una seduta pliometrica solo se hai recuperato bene e mantieni almeno 48 ore tra due lavori pliometrici.');
    [400, 800, 1000].forEach(target => {
      const entries = data.runs.filter(item => item.run.target === target && Number.isFinite(item.run.averagePace));
      const recent = average(entries.slice(0, 3).map(item => item.run.averagePace));
      const earlier = average(entries.slice(3, 6).map(item => item.run.averagePace));
      if (recent != null && earlier != null && recent - earlier <= -4) suggestions.push(`${target} m: il passo recente è migliorato di ${Math.round(earlier - recent)} sec/km. Mantieni la progressione senza alzare insieme distanza e intensità.`);
      if (recent != null && earlier != null && recent - earlier >= 9) suggestions.push(`${target} m: il passo recente è più lento di ${Math.round(recent - earlier)} sec/km. Dai priorità a recupero, sonno e qualità tecnica.`);
    });
    if (!suggestions.length) suggestions.push('Andamento regolare: continua con gradualità e usa il passo come indicatore, non come obiettivo da forzare in ogni seduta.');
    $('advice-list').innerHTML = suggestions.slice(0, 3).map((text, index) => `<div class="advice-item"><span class="advice-bullet">${index + 1}</span><span>${escapeHtml(text)}</span></div>`).join('');
  }

  function renderRecent(completed) {
    $('recent-count').textContent = `${completed.length} totali`;
    const recent = completed.slice(0, 7);
    $('recent-list').innerHTML = recent.length ? recent.map(log => {
      const isRun = log.run.target || Array.isArray(log.runRepetitions) && log.runRepetitions.length;
      const result = isRun && Number.isFinite(log.run.averagePace) ? `${pace(log.run.averagePace)} min/km` : duration(Number(log.durationSeconds));
      const detail = isRun ? `${integer.format(log.run.distance)} m GPS${log.run.target ? ` · ${log.run.target} m` : ''}` : 'Seduta pliometrica';
      return `<div class="recent-item"><div><div class="recent-title">${escapeHtml(log.workoutTitle || (isRun ? 'Ripetute' : 'Pliometria'))}</div><div class="recent-meta">${dateFormat.format(log.date)} · ${detail}</div></div><div class="recent-result">${result}<small>${isRun ? 'passo medio' : 'durata'}</small></div></div>`;
    }).join('') : '<div class="empty-state">Il registro è ancora vuoto.</div>';
  }

  function render(payload) {
    lastPayload = payload;
    const data = normalize(payload);
    renderMetrics(data);
    renderPaceChart(data.runs);
    renderVolumeChart(data.runs);
    renderPaceCards(data.runs);
    renderPlyo(data);
    renderAdvice(data);
    renderRecent(data.completed);
  }

  async function loadData(key, persistOnSuccess = false) {
    if (!key || key.length < 24) { showLogin('Inserisci una SYNC_KEY valida (almeno 24 caratteri).'); return; }
    els.loginButton.disabled = true;
    els.refresh.disabled = true;
    setConnection('Connessione in corso…', false);
    try {
      const response = await fetch('/api/sync', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
      if (!response.ok) {
        let message = '';
        try { const detail = await response.json(); message = detail?.error || ''; } catch { /* use fallback */ }
        if (response.status === 401) throw new Error('La chiave personale non è valida. Controlla di usare la stessa SYNC_KEY configurata su Railway.');
        throw new Error(message || `Il servizio ha risposto con errore ${response.status}.`);
      }
      const payload = await response.json();
      activeKey = key;
      if (persistOnSuccess) localStorage.setItem(STORAGE_KEY, key);
      render(payload);
      showDashboard();
      setConnection('Dati Railway aggiornati', true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore di connessione inatteso.';
      if (activeKey) showError(message); else showLogin(message);
    } finally {
      els.loginButton.disabled = false;
      els.refresh.disabled = false;
    }
  }

  async function generatePairingCode() {
    if (!activeKey) { showLogin('Accedi prima con la SYNC_KEY per generare il codice.'); return; }
    els.pairingButton.disabled = true;
    els.pairingError.textContent = '';
    els.pairingResult.classList.add('is-hidden');
    try {
      const response = await fetch('/api/pairings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeKey}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        let message = '';
        try { message = (await response.json())?.error || ''; } catch { /* use fallback */ }
        throw new Error(message || `Impossibile generare il codice (${response.status}).`);
      }
      const data = await response.json();
      if (!/^\d{6}$/.test(String(data.code || ''))) throw new Error('Il server non ha restituito un codice valido.');
      els.pairingCode.textContent = data.code;
      const expiresAt = Date.parse(data.expiresAt);
      els.pairingExpiry.textContent = Number.isFinite(expiresAt)
        ? `Valido fino alle ${new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(expiresAt))}`
        : 'Valido per 10 minuti';
      els.pairingResult.classList.remove('is-hidden');
    } catch (error) {
      els.pairingError.textContent = error instanceof Error ? error.message : 'Errore durante la generazione del codice.';
    } finally {
      els.pairingButton.disabled = false;
    }
  }

  els.form.addEventListener('submit', event => { event.preventDefault(); loadData(els.key.value.trim(), true); });
  els.refresh.addEventListener('click', () => loadData(activeKey || localStorage.getItem(STORAGE_KEY) || ''));
  els.pairingButton.addEventListener('click', generatePairingCode);
  els.retry.addEventListener('click', () => loadData(activeKey || localStorage.getItem(STORAGE_KEY) || ''));
  els.forget.addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); activeKey = ''; lastPayload = null; els.key.value = ''; showLogin(); });
  els.reveal.addEventListener('click', () => { const visible = els.key.type === 'text'; els.key.type = visible ? 'password' : 'text'; els.reveal.textContent = visible ? 'Mostra' : 'Nascondi'; });

  const remembered = localStorage.getItem(STORAGE_KEY);
  if (remembered) { els.key.value = remembered; loadData(remembered); }
})();
