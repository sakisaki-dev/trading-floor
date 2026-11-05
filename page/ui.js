/* Page script for The Trading Floor. The engine (sandbox/engine.mjs) and LIBRARY are inlined above this at build time.
   Everything draws from FRAMES (one compact record per week, engine frame()): live mode appends one per tick, replay
   mode loads them from a run file written by sandbox/run.mjs. */

const PRESETS = {
  balanced: { label: 'Balanced market', set: {}, hyp: '<b>Balanced market.</b> Every strategy and social style in the mix. Bots research three players a week and play Arcade quizzes on a position they know for free packs. Watch the pass price settle, thieves get flagged, and the game bars adjust so no game becomes the easy one.' },
  mania: { label: 'Momentum mania', set: { mix: [6, 8, 34, 34, 6, 8, 6] }, hyp: '<b>Momentum mania.</b> Trend chasers and a big retail herd that never research, so most passes go up for sale. Prices sag, then run above hidden value.' },
  smart: { label: 'Smart money vs the herd', set: { mix: [30, 10, 4, 50, 4, 4, 4] }, hyp: '<b>Smart money vs the herd.</b> Many researching value bots against a large herd that sells them its passes cheaply. Does knowing pay? Check the Value lane.' },
  thieves: { label: "Thieves' den", set: { social: { sharer: 0.2, reciprocator: 0.2, thief: 0.6 } }, hyp: "<b>Thieves' den.</b> Six in ten bots steal notes. Victims flag them and stop sharing. Watch flags pile up, swaps dry up, and whether the honest minority still out-earns the thieves." },
  honest: { label: 'Sharing circle', set: { social: { sharer: 0.7, reciprocator: 0.3, thief: 0 }, stealing: false }, hyp: '<b>Sharing circle.</b> No thieves: everyone swaps notes freely. Information spreads fast, so research is worth less and the pass price drops.' },
  nogames: { label: 'No games', set: { games: false }, hyp: '<b>No games.</b> Bots earn nothing from the Arcade, only the allowance. Compare total wealth and how much research is worth when knowledge no longer wins packs.' },
  nopass: { label: 'No pass market', set: { passesTradable: false }, hyp: '<b>No pass market.</b> Passes cannot be traded. Each bot has only its own three a week, so knowledge stays evenly spread and research bots cannot buy an edge.' },
  noanchor: { label: 'Anchors off', set: { allowance: 0, outsideCollectors: false, royalties: false }, hyp: '<b>Anchors off.</b> No allowance, no outside collectors, no royalties. Nothing ties a card to its hidden value except bots that have researched it.' },
};
const SOC_LABEL = { 0: 'Sharer', 1: 'Reciprocator', 2: 'Thief' };
const TAGS = { start: ['Open', 'var(--gold)'], gen: ['Generation', 'var(--gold)'], evolve: ['Evolution', '#c3b8ff'], crash: ['Crash', '#ff9c9c'], bubble: ['Bubble', '#ffd27a'], corner: ['Corner', '#8fe38f'], flag: ['Flagged', '#ff9c9c'], pool: ['Pool', 'var(--muted)'], update: ['Update', 'var(--gold)'], ai: ['AI', '#ff9c9c'], games: ['Games', '#9cc7ff'] };

const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const COL = {};
const lerpU = (a, b, t) => a + (b - a) * t, clampU = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (x) => (x == null ? '–' : x >= 1000 ? Math.round(x).toLocaleString() : x >= 100 ? Math.round(x).toString() : x.toFixed(1));
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

/* ---------- State ---------- */
let opts = { seed: 88 }, presetKey = 'balanced';
let WORLD = null, FRAMES = [], H = null, mode = 'live', RUN = null, cursor = 0;
const KEYS = ['p', 'f', 'bub', 'gini', 'share', 'trades', 'money', 'pass', 'informed', 'flags', 'shares', 'thefts', 'gamePacks'];
function pushFrame(f) { FRAMES.push(f); for (const k of KEYS) H[k].push(f.h[k]); }
function newHist() { H = Object.fromEntries(KEYS.map((k) => [k, []])); }
const weeksPerGen = () => (mode === 'replay' ? RUN.config.weeksPerGeneration : WORLD.cfg.weeksPerGeneration);
const when = (t) => (t === 0 ? 'Start' : `Week ${t} · Gen ${Math.floor((t - 1) / weeksPerGen()) + 1}`);
const cur = () => FRAMES[mode === 'replay' ? cursor : FRAMES.length - 1];

function startLive() {
  mode = 'live'; RUN = null; $('liveBtn').hidden = true; $('runFile').value = '';
  WORLD = createWorld(LIBRARY, { ...opts, ...PRESETS[presetKey].set });
  FRAMES = []; newHist(); pushFrame(frame(WORLD));
  for (let i = 0; i < 40; i++) { step(WORLD); pushFrame(frame(WORLD)); } // open two generations in, so the page has a story at rest
  syncControls();
  $('hyp').innerHTML = PRESETS[presetKey].hyp; $('preset').value = presetKey;
  arcsLive = []; pos.clear(); redrawAll();
}
function startReplay(run) {
  mode = 'replay'; RUN = run; FRAMES = []; newHist();
  for (const f of run.frames) pushFrame(f);
  cursor = 0; $('liveBtn').hidden = false; setPlay(true);
  const ai = run.meta?.aiBots || [];
  $('hyp').innerHTML = `<b>Replay: ${run.meta?.id || 'AI run'}.</b> ${run.frames.length - 1} weeks, ${ai.length} AI bot${ai.length === 1 ? '' : 's'} (${ai.map((b) => `${b.name} on ${b.model}`).join(', ') || 'none'}) among ${run.frames[0].bots.length} bots. API cost: $${(run.meta?.costUsd ?? 0).toFixed(2)}. Hover a red AI dot for its memo.`;
  arcsLive = []; pos.clear(); redrawAll();
}

/* ---------- Canvas ---------- */
function fit(cv) { const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return [x, r.width, r.height]; }

/* ---------- Floor ---------- */
const floor = $('floor'), floorTip = $('floorTip');
let dom = [2.5, 4], pos = new Map(), hover = null, arcsLive = [];
function lanes() { const f = cur(); const hasAi = (RUN && RUN.frames.some((x) => x.bots.some((b) => b[9]))) || f.bots.some((b) => b[9]); return ARCH.map((a, i) => i).filter((i) => i < AI || hasAi); }
function drawFloor() {
  const f = cur(); if (!f) return;
  const [x, Wd, Ht] = fit(floor); x.clearRect(0, 0, Wd, Ht);
  const L = Wd < 560 ? 92 : 150, ln = lanes(), lh = Ht / ln.length, small = Wd < 560 ? 0.62 : 1;
  const vals = f.bots.map((b) => b[3]);
  const lo = Math.log10(Math.max(20, Math.min(...vals))), hi = Math.log10(Math.max(...vals) * 1.05);
  dom = [lerpU(dom[0], lo, 0.08), lerpU(dom[1], hi, 0.08)];
  const X = (v) => L + 8 + ((Math.log10(Math.max(1, v)) - dom[0]) / Math.max(0.01, dom[1] - dom[0])) * (Wd - L - 24);
  const share = f.h.share;
  ln.forEach((a, row) => {
    const y0 = row * lh;
    x.fillStyle = row % 2 ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.035)'; x.fillRect(L, y0, Wd - L, lh);
    x.fillStyle = ARCH[a].color; x.fillRect(0, y0 + lh / 2 - 7, 4, 14);
    x.fillStyle = COL.chalk; x.font = `800 ${L < 120 ? 13 : 15}px ${css('--display')}`; x.textBaseline = 'middle';
    x.fillText(ARCH[a].label.toUpperCase(), 10, y0 + lh / 2 - 8);
    x.fillStyle = COL.muted; x.font = `500 11px ${css('--mono')}`;
    x.fillText(`${f.bots.filter((b) => b[1] === a).length} bots · ${Math.round((share[a] || 0) * 100)}%`, 10, y0 + lh / 2 + 9);
  });
  x.font = `500 10px ${css('--mono')}`; x.fillStyle = COL.faint; x.textBaseline = 'bottom';
  for (let e = Math.ceil(dom[0] * 2) / 2; e <= dom[1]; e += 0.5) { const v = Math.pow(10, e), px = X(v); if (px < L + 20 || px > Wd - 20) continue; x.fillRect(px, 0, 1, Ht - 14); x.fillText(fmt(v), px + 3, Ht - 1); }
  const ids = new Set();
  for (const b of f.bots) {
    const [id, a, , w, n] = b; ids.add(id);
    const row = ln.indexOf(a), jit = ((id * 2654435761) % 1000) / 1000;
    const tx = X(w), ty = row * lh + 10 + jit * (lh - 20);
    const p = pos.get(id) || { x: tx, y: ty };
    p.x = lerpU(p.x, tx, 0.15); p.y = lerpU(p.y, ty, 0.2); p.r = clampU(2 + Math.sqrt(n) * 0.55, 2.5, 10) * small * (b[9] ? 1.4 : 1); p.b = b; pos.set(id, p);
  }
  for (const id of [...pos.keys()]) if (!ids.has(id)) pos.delete(id);
  x.lineWidth = 1;
  arcsLive = arcsLive.filter((a) => a.age < 40);
  for (const a of arcsLive) {
    const s = pos.get(a.s), b = pos.get(a.b); a.age++;
    if (!s || !b) continue;
    x.strokeStyle = `rgba(238,241,250,${0.3 * (1 - a.age / 40)})`;
    x.beginPath(); x.moveTo(s.x, s.y); x.quadraticCurveTo((s.x + b.x) / 2, Math.min(s.y, b.y) - 26, b.x, b.y); x.stroke();
  }
  for (const [id, p] of pos) {
    const b = p.b, col = ARCH[b[1]].color;
    x.beginPath(); x.arc(p.x, p.y, p.r + 1.5, 0, Math.PI * 2); x.fillStyle = COL.panel; x.fill();
    x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fillStyle = hover && hover !== id ? rgba(col, 0.45) : col; x.fill();
    if (b[5] === 2) { x.setLineDash([2, 2]); x.strokeStyle = COL.chalk; x.lineWidth = 1.2; x.beginPath(); x.arc(p.x, p.y, p.r + 2.5, 0, Math.PI * 2); x.stroke(); x.setLineDash([]); }
    if (b[6] >= 5) { x.strokeStyle = '#ff6b6b'; x.lineWidth = 1.6; x.beginPath(); x.arc(p.x, p.y, p.r + 4.5, 0, Math.PI * 2); x.stroke(); }
    if (hover === id) { x.strokeStyle = COL.gold; x.lineWidth = 2; x.beginPath(); x.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); x.stroke(); }
  }
}
function floorPointer(e) {
  const r = floor.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 196;
  for (const [id, p] of pos) { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = [id, p]; } }
  hover = best ? best[0] : null;
  if (!best) { floorTip.hidden = true; return; }
  const [id, a, name, w, n, soc, flaggedBy, cash, notes, isAi, gen, model, seasons] = best[1].b;
  let extra = '';
  if (mode === 'live') {
    const b = WORLD.bots.find((x) => x.id === id);
    if (b) {
      const g = b.g, gt = { 0: `research error ±${Math.round(g.err * 100)}%, margin ${Math.round(g.margin * 100)}%`, 1: `spread ${(g.spread * 100).toFixed(1)}% on ${g.size} cards`, 2: `lookback ${g.look} wk, trigger ${Math.round(g.trig * 100)}%`, 3: `panics after a ${Math.round(g.panic * 100)}% drop`, 4: `rips when pulls beat the pack by ${Math.round((g.trig - 1) * 100)}%`, 5: `hoards ${g.targets.map((t) => WORLD.cards[t].name).join(' & ')}`, 6: `buys ${Math.round(g.dip * 100)}% dips` }[a] || '';
      extra = `<br><span class="k">${gt}</span><br><span class="k">Swapped notes ${b.stats.shared}× · stole ${b.stats.stolen}× (caught ${b.stats.caught}) · ${b.passes.length} passes</span>`;
    }
  } else if (isAi && RUN.memos) {
    const m = RUN.memos[name]?.[cursor] || Object.entries(RUN.memos[name] || {}).filter(([t]) => +t <= cursor).pop()?.[1];
    if (m) extra = `<br><span class="k">Memo:</span> ${escapeHtml(m).slice(0, 260)}`;
  }
  floorTip.innerHTML = `<b><span class="sw" style="background:${ARCH[a].color}"></span>${name}</b><br><span class="k">${ARCH[a].label}${model ? ` · ${model}` : ''} · ${SOC_LABEL[soc]} · gen ${gen} · ${seasons} generations</span><br>Worth <span class="mono">${fmt(w)}</span> · cash <span class="mono">${fmt(cash)}</span> · ${n} cards<br>${notes} notes · flagged by ${flaggedBy}${extra}`;
  floorTip.hidden = false;
  const pr = floor.parentElement.getBoundingClientRect(), p = best[1];
  floorTip.style.left = clampU(p.x + (r.left - pr.left) + 14, 8, pr.width - 270) + 'px';
  floorTip.style.top = Math.min(p.y + (r.top - pr.top) + 14, pr.height - 150) + 'px';
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
floor.addEventListener('pointermove', floorPointer); floor.addEventListener('pointerdown', floorPointer);
floor.addEventListener('pointerleave', () => { hover = null; floorTip.hidden = true; });

/* ---------- Charts ---------- */
const charts = {};
const nNow = () => (mode === 'replay' ? cursor + 1 : FRAMES.length);
function axes(x, Wd, Ht, pad, ymin, ymax, fmtY, n) {
  x.font = `500 10px ${css('--mono')}`; x.textBaseline = 'middle'; x.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const v = ymin + ((ymax - ymin) * i) / 4, y = pad.t + (Ht - pad.t - pad.b) * (1 - i / 4); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(pad.l, Math.round(y), Wd - pad.l - pad.r, 1); x.fillStyle = COL.faint; x.fillText(fmtY(v), pad.l - 6, y); }
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  const g = weeksPerGen();
  for (let t = g; t < n; t += g) { const px = pad.l + ((Wd - pad.l - pad.r) * t) / Math.max(1, n - 1); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(px, pad.t, 1, Ht - pad.t - pad.b); }
  x.fillStyle = COL.faint;
  if (n > 1) { x.fillText('Start', pad.l, Ht - 2); x.textAlign = 'right'; x.fillText(`Week ${FRAMES[n - 1].t}`, Wd - pad.r, Ht - 2); x.textAlign = 'left'; }
}
function lineChart(id, series, o) {
  const cv = $(id), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const n = nNow(), pad = { l: 40, r: 10, t: 8, b: 16 };
  const data = series.map((s) => s.data.slice(0, n));
  let ymin = Infinity, ymax = -Infinity; data.forEach((d) => d.forEach((v) => { if (v == null) return; ymin = Math.min(ymin, v); ymax = Math.max(ymax, v); }));
  if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
  if (o.ref !== undefined) { ymin = Math.min(ymin, o.ref); ymax = Math.max(ymax, o.ref); }
  const span = ymax - ymin || 1; ymin -= span * 0.06; ymax += span * 0.06; if (o.min !== undefined) ymin = o.min; if (o.max !== undefined) ymax = Math.max(o.max, ymax);
  const X = (i) => pad.l + ((Wd - pad.l - pad.r) * i) / Math.max(1, n - 1), Y = (v) => pad.t + (Ht - pad.t - pad.b) * (1 - (v - ymin) / (ymax - ymin));
  axes(x, Wd, Ht, pad, ymin, ymax, o.fmtY, n);
  if (o.ref !== undefined) { x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(pad.l, Math.round(Y(o.ref)), Wd - pad.l - pad.r, 1); }
  series.forEach((s, k) => {
    const d = data[k];
    const path = () => { x.beginPath(); let on = false; d.forEach((v, i) => { if (v == null) { on = false; return; } on ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)); on = true; }); };
    if (s.fill) { const first = d.findIndex((v) => v != null); if (first >= 0) { path(); x.lineTo(X(n - 1), Ht - pad.b); x.lineTo(X(first), Ht - pad.b); x.closePath(); const gr = x.createLinearGradient(0, pad.t, 0, Ht - pad.b); gr.addColorStop(0, rgba(s.color, 0.22)); gr.addColorStop(1, rgba(s.color, 0)); x.fillStyle = gr; x.fill(); } }
    path(); x.setLineDash(s.dash ? [5, 4] : []); x.strokeStyle = s.color; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke(); x.setLineDash([]);
    const lv = d[n - 1]; if (lv != null) { x.beginPath(); x.arc(X(n - 1), Y(lv), 3.5, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); }
  });
  const c = (charts[id] ||= {}); Object.assign(c, { X, n, pad, Wd, Ht });
  if (c.hoverI !== undefined && c.hoverI < n) { x.fillStyle = 'rgba(238,241,250,0.35)'; x.fillRect(Math.round(X(c.hoverI)), pad.t, 1, Ht - pad.t - pad.b); series.forEach((s, k) => { const v = data[k][c.hoverI]; if (v == null) return; x.beginPath(); x.arc(X(c.hoverI), Y(v), 4, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); x.strokeStyle = COL.panel; x.lineWidth = 2; x.stroke(); }); }
}
function stackChart(id, layers) {
  const cv = $(id), [x, Wd, Ht] = fit(cv); x.clearRect(0, 0, Wd, Ht);
  const n = nNow(), L = layers.slice(0, n), pad = { l: 40, r: 10, t: 8, b: 16 };
  const X = (i) => pad.l + ((Wd - pad.l - pad.r) * i) / Math.max(1, n - 1), Y = (v) => pad.t + (Ht - pad.t - pad.b) * (1 - v);
  axes(x, Wd, Ht, pad, 0, 1, (v) => Math.round(v * 100) + '%', n);
  const base = new Array(n).fill(0);
  ARCH.forEach((a, k) => {
    const top = L.map((s, i) => base[i] + (s[k] || 0));
    x.beginPath(); top.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); for (let i = n - 1; i >= 0; i--) x.lineTo(X(i), Y(base[i])); x.closePath();
    x.fillStyle = a.color; x.fill();
    x.beginPath(); top.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)))); x.strokeStyle = COL.panel; x.lineWidth = 2; x.stroke();
    top.forEach((v, i) => (base[i] = v));
  });
  const c = (charts[id] ||= {}); Object.assign(c, { X, n, pad, Wd, Ht });
  if (c.hoverI !== undefined && c.hoverI < n) { x.fillStyle = 'rgba(238,241,250,0.6)'; x.fillRect(Math.round(X(c.hoverI)), pad.t, 1, Ht - pad.t - pad.b); }
}
function crosshair(id, render) {
  const cv = $(id), tip = $(id + 'Tip');
  const move = (e) => {
    const c = charts[id]; if (!c) return;
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left;
    const i = clampU(Math.round(((mx - c.pad.l) / (c.Wd - c.pad.l - c.pad.r)) * (c.n - 1)), 0, c.n - 1);
    c.hoverI = i; tip.innerHTML = render(i); tip.hidden = false;
    const pr = cv.parentElement.getBoundingClientRect();
    tip.style.left = clampU(c.X(i) + (r.left - pr.left) + 12, 8, pr.width - 230) + 'px'; tip.style.top = r.top - pr.top + 8 + 'px';
    drawCharts();
  };
  cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
  cv.addEventListener('pointerleave', () => { if (charts[id]) charts[id].hoverI = undefined; tip.hidden = true; drawCharts(); });
}
crosshair('market', (i) => `<b>${when(FRAMES[i].t)}</b><br><span class="sw" style="background:var(--gold)"></span>Price index <span class="mono">${H.p[i].toFixed(1)}</span><br><span class="sw" style="background:var(--chalk)"></span>Hidden value index <span class="mono">${H.f[i].toFixed(1)}</span><br><span class="k">Price ÷ hidden value, all cards: ${H.bub[i].toFixed(2)}×</span>`);
crosshair('gini', (i) => `<b>${when(FRAMES[i].t)}</b><br>Gini <span class="mono">${H.gini[i].toFixed(3)}</span>`);
crosshair('pass', (i) => `<b>${when(FRAMES[i].t)}</b><br>Pass price <span class="mono">${H.pass[i] == null ? 'no trade yet' : H.pass[i].toFixed(2) + ' coins'}</span>`);
crosshair('notes', (i) => `<b>${when(FRAMES[i].t)}</b><br><span class="sw" style="background:#3987e5"></span>Swaps <span class="mono">${H.shares[i]}</span><br><span class="sw" style="background:#e66767"></span>Thefts <span class="mono">${H.thefts[i]}</span><br><span class="k">${H.flags[i]} flags in force</span>`);
crosshair('strat', (i) => `<b>${when(FRAMES[i].t)}</b><br>` + ARCH.map((a, k) => [a, H.share[i][k] || 0]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).map(([a, v]) => `<span class="sw" style="background:${a.color}"></span>${a.label} <span class="mono">${Math.round(v * 100)}%</span>`).join('<br>'));
function drawCharts() {
  lineChart('market', [{ data: H.p, color: COL.gold, fill: true }, { data: H.f, color: COL.chalk, dash: true }], { fmtY: (v) => Math.round(v), ref: 100 });
  lineChart('gini', [{ data: H.gini, color: '#3987e5', fill: true }], { fmtY: (v) => v.toFixed(2), min: 0, max: 0.5 });
  lineChart('pass', [{ data: H.pass, color: COL.gold, fill: true }], { fmtY: (v) => v.toFixed(1), min: 0 });
  lineChart('notes', [{ data: H.shares, color: '#3987e5' }, { data: H.thefts, color: '#e66767' }], { fmtY: (v) => Math.round(v), min: 0 });
  stackChart('strat', H.share);
}

/* ---------- Panels ---------- */
const bubblePill = (r) => (r > 1.2 ? '<span class="pill pill--hot">▲ Rich</span>' : r < 0.85 ? '<span class="pill pill--cool">▼ Cheap</span>' : '<span class="pill pill--fair">Fair</span>');
let libId = 0;
function priceSeries(id) {
  if (mode === 'live') return [WORLD.cards[id].Ph.slice(-60), Array(Math.min(60, WORLD.cards[id].Ph.length)).fill(WORLD.cards[id].F)];
  const from = Math.max(0, cursor - 59), P = [], F = [];
  let v = null; for (let i = 0; i <= cursor; i++) { if (FRAMES[i].values) v = FRAMES[i].values; if (i >= from) { P.push(FRAMES[i].prices?.[id]); F.push(v?.[id]); } }
  return [P, F];
}
function drawPanels() {
  const f = cur(), n = nNow(); if (!f) return;
  $('cWeek').textContent = f.t ? `Week ${f.t}` : 'Start'; $('cWeekS').textContent = `generation ${Math.floor(Math.max(0, f.t - 1) / weeksPerGen()) + 1}${mode === 'replay' ? ` · replay ${cursor + 1}/${FRAMES.length}` : ''}`;
  $('cBub').textContent = f.h.bub.toFixed(2) + '×'; $('cBubS').innerHTML = bubblePill(f.h.bub);
  $('cGini').textContent = f.h.gini.toFixed(3); $('cGiniS').textContent = `${f.h.gini >= H.gini[0] ? '▲' : '▼'} from ${H.gini[0].toFixed(3)} at the start`;
  $('cTrades').textContent = f.h.trades.toLocaleString(); $('cTradesS').textContent = `${f.house.fees.toLocaleString()} coins in fees · ${f.house.packs.toLocaleString()} packs`;
  $('cPass').textContent = f.h.pass == null ? '–' : f.h.pass.toFixed(2); $('cPassS').textContent = f.h.pass == null ? 'no pass traded yet' : `coins · ${f.h.informed.toFixed(1)} fresh notes per bot`;
  const ranked = f.bots.slice().sort((a, b) => b[3] - a[3]);
  $('cTop').textContent = fmt(ranked[0][3]); $('cTopS').textContent = `${ranked[0][2]} · ${ARCH[ranked[0][1]].label}`;
  $('lb').tBodies[0].innerHTML = ranked.slice(0, 10).map((b) => `<tr><td><span class="sw" style="background:${ARCH[b[1]].color}"></span>${b[2]}${b[11] ? ` <span class="k">${b[11]}</span>` : ''}</td><td class="num">${fmt(b[3])}</td><td class="num">${Math.round((b[7] / Math.max(1, b[3])) * 100)}%</td><td class="num">${b[8]}</td><td>${SOC_LABEL[b[5]]}${b[6] >= 5 ? ' <span class="pill pill--hot">Flagged</span>' : ''}</td></tr>`).join('');
  // Social table
  const soc = [0, 1, 2].map((s) => { const xs = f.bots.filter((b) => b[5] === s); return [s, xs.length, xs.length ? xs.reduce((a, b) => a + b[3], 0) / xs.length : 0, xs.length ? xs.reduce((a, b) => a + b[6], 0) / xs.length : 0]; });
  $('social').tBodies[0].innerHTML = soc.map(([s, k, w, fl]) => `<tr><td>${SOC_LABEL[s]}</td><td class="num">${k}</td><td class="num">${k ? fmt(w) : '–'}</td><td class="num">${k ? fl.toFixed(1) : '–'}</td></tr>`).join('');
  $('researched').innerHTML = (f.researched.length ? 'Most researched this week: ' + f.researched.map(([id, k]) => `${LIBRARY.players[id].name} (${k})`).join(', ') : 'Nobody researched this week.') + (f.games ? `<br>Games: <b style="color:var(--chalk)">${f.games.packsWeek}</b> free packs won this week. Higher or Lower pays a pack per ${f.games.need} in a row, and Over / Under slips have ${f.games.legs} legs.` : '');
  // Hottest cards
  $('spot').innerHTML = f.hot.map(([id, P, F, vol, circ, pool], i) => { const p = LIBRARY.players[id]; return `<button type="button" class="cardrow" data-lib="${id}" style="text-align:left;border:0;cursor:pointer;color:inherit;font:inherit;width:100%"><div><b>${p.pos} ${p.name}</b><span>${teamShort(p.team)} · ${fmt(P)} vs ${fmt(F)} ${bubblePill(P / F)}<br>${vol} trades · ${circ} out, ${pool} in pool</span></div><canvas id="sp${i}" aria-label="${p.name} price and hidden value"></canvas></button>`; }).join('');
  f.hot.forEach(([id], i) => {
    const [x, Wd, Ht] = fit($('sp' + i)); x.clearRect(0, 0, Wd, Ht);
    const [P, F] = priceSeries(id), all = P.concat(F).filter((v) => v != null); if (!all.length) return;
    const lo = Math.min(...all), hi = Math.max(...all), sp = hi - lo || 1;
    const draw = (d, col, dash) => { x.beginPath(); let on = false; d.forEach((v, k) => { if (v == null) { on = false; return; } const px = Wd - 2 - ((d.length - 1 - k) / 59) * (Wd - 4), py = Ht - 3 - ((v - lo) / sp) * (Ht - 6); on ? x.lineTo(px, py) : x.moveTo(px, py); on = true; }); x.setLineDash(dash ? [3, 3] : []); x.strokeStyle = col; x.lineWidth = 1.6; x.stroke(); x.setLineDash([]); };
    draw(F, COL.chalk, true); draw(P, COL.gold, false);
  });
  // Ticker: events up to the cursor, newest first
  const evs = []; for (let i = n - 1; i >= 0 && evs.length < 60; i--) for (const e of FRAMES[i].events) evs.push(e);
  drawActivity();
  $('ticker').innerHTML = evs.slice(0, 60).map((e) => { const [tag, col] = TAGS[e.kind] || ['Note', 'var(--muted)']; return `<div class="ev"><time>${e.t ? 'W' + e.t : 'Start'}</time><div><span class="tag" style="color:${col}">${tag}</span>${escapeHtml(e.text)}</div></div>`; }).join('');
}
let actF = 'all';
const ACT = {
  trade: (j) => [`<b>${escapeHtml(j.buyer)}</b> bought ${escapeHtml(j.card)} from ${escapeHtml(j.seller)} for ${j.price}`, 'Trade'],
  passTrade: (j) => [`<b>${escapeHtml(j.buyer)}</b> bought a research pass from ${escapeHtml(j.seller)} for ${j.price}`, 'Pass'],
  ticketTrade: (j) => [`<b>${escapeHtml(j.buyer)}</b> bought a game ticket from ${escapeHtml(j.seller)} for ${j.price}`, 'Ticket'],
  auctionList: (j) => [`<b>${escapeHtml(j.seller)}</b> put ${escapeHtml(j.card)} up for auction (reserve ${j.reserve})`, 'Auction'],
  auctionResult: (j) => [j.winner ? `<b>${escapeHtml(j.winner)}</b> won ${escapeHtml(j.card)} from ${escapeHtml(j.seller)} for ${j.price} (${j.bids} sealed bids, top ${j.topBid})` : `${escapeHtml(j.card)} from ${escapeHtml(j.seller)} went unsold (${j.bids} bids, reserve ${j.reserve})`, 'Auction'],
  research: (j) => [`<b>${escapeHtml(j.bot)}</b> researched ${escapeHtml(j.player)}`, 'Research'],
  share: (j) => [`<b>${escapeHtml(j.a)}</b> and <b>${escapeHtml(j.b)}</b> swapped notes (${j.notesMoved} moved)`, 'Swap'],
  steal: (j) => [j.ok ? `<b>${escapeHtml(j.thief)}</b> stole ${j.notes} notes from ${escapeHtml(j.victim)}${j.caught ? ` and was caught (${j.flaggedBy} bots flag it)` : ''}` : `<b>${escapeHtml(j.thief)}</b> tried to steal from ${escapeHtml(j.victim)}, who was watching`, 'Theft'],
  game: (j) => [`<b>${escapeHtml(j.bot)}</b> played ${j.game === 'higherOrLower' ? 'Higher or Lower' : 'Over / Under'} (${j.topic}): ${j.correct}/${j.of} right, ${j.packs} pack${j.packs === 1 ? '' : 's'}`, 'Game'],
  pack: (j) => [`<b>${escapeHtml(j.bot)}</b> ${j.free ? 'opened a free game pack' : `ripped a pack for ${j.price}`}: ${j.pulls.map(escapeHtml).join(', ')}`, 'Pack'],
  post: (j) => [`<b>${escapeHtml(j.from)}</b> posted: ${escapeHtml(j.text)}`, 'Board'],
  message: (j) => [`<b>${escapeHtml(j.from)}</b> → ${escapeHtml(j.to)}: ${escapeHtml(j.text)}`, 'Message'],
  aiActions: (j) => [`<b>${escapeHtml(j.bot)}</b> decided: ${escapeHtml(Object.entries(j.actions || {}).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k, v]) => `${k}${Array.isArray(v) ? ` ×${v.length}` : ''}`).join(', ') || 'nothing')}`, 'AI'],
  eliminated: (j) => [`<b>${escapeHtml(j.bot)}</b> (${j.kind}, ${j.social}) was eliminated`, 'Evolution'],
  born: (j) => [`<b>${escapeHtml(j.bot)}</b> was born, a copy of ${escapeHtml(j.parent)}`, 'Evolution'],
};
const ACT_GROUP = { trade: ['trade', 'passTrade', 'ticketTrade'], auction: ['auctionList', 'auctionResult'], research: ['research'], notes: ['share', 'steal'], game: ['game'], pack: ['pack'], talk: ['post', 'message'], ai: ['aiActions'] };
function drawActivity() {
  const f = cur(); if (!f?.jn) { $('activity').innerHTML = '<p class="muted">No activity recorded for this week.</p>'; return; }
  const rows = f.jn.filter((j) => actF === 'all' || ACT_GROUP[actF].includes(j.type)).slice().reverse();
  $('activity').innerHTML = rows.length ? rows.map((j) => { const r = ACT[j.type]?.(j); if (!r) return ''; return `<div class="ev"><time>W${j.t}</time><div><span class="tag" style="color:var(--muted)">${r[1]}</span>${r[0]}</div></div>`; }).join('') : '<p class="muted" style="font-size:13px">Nothing of this kind in the latest entries.</p>';
}
document.querySelectorAll('#actFilter [data-f]').forEach((b) => b.addEventListener('click', () => { actF = b.dataset.f; document.querySelectorAll('#actFilter [data-f]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); drawActivity(); }));
function drawLibrary() {
  const p = LIBRARY.players[libId]; if (!p) return;
  const row = (k, v) => `<tr><td class="k" style="white-space:normal">${k}</td><td class="num">${typeof v === 'number' ? v.toLocaleString() : v}</td></tr>`;
  const awards = ['Rings', 'MVP', 'OPOY', 'SBMVP', 'ROTY'].filter((k) => p.stats[k]).map((k) => `${p.stats[k]} ${k}`).join(' · ') || 'none';
  const stats = Object.entries(p.stats).filter(([k]) => !['Rings', 'MVP', 'OPOY', 'SBMVP', 'ROTY'].includes(k));
  $('libPage').innerHTML = `<div style="display:grid;gap:8px;margin-top:8px"><div><b style="font:800 20px/1.1 var(--display);letter-spacing:.02em">${p.pos} ${p.name}</b><br><span class="muted" style="font-size:13px">${p.team}${p.nickname ? ` · "${escapeHtml(p.nickname)}"` : ''}${p.hallOfFame ? ' · Hall of Fame' : ''}</span></div>
  <div class="muted" style="font-size:13px">OVR <b style="color:var(--chalk)">${p.ovr ?? '–'}</b> · skill ${p.skill ?? '–'} · grade ${p.grade ?? '–'} · Career Legacy ${p.careerLegacy?.toLocaleString() ?? '–'}<br>Awards: ${awards}<br>Plays like: ${(p.playsLike || []).join(', ')}</div>
  <div class="tablewrap"><table><tbody>${stats.map(([k, v]) => row(k, v)).join('')}${Object.entries(p.rates).map(([k, v]) => row(k, v)).join('')}</tbody></table></div></div>`;
}
document.addEventListener('click', (e) => { const t = e.target.closest('[data-lib]'); if (t) { libId = +t.dataset.lib; $('libPick').value = libId; drawLibrary(); } });

/* ---------- Static bits ---------- */
$('archTable').innerHTML = ARCH.map((a) => `<tr><td style="white-space:normal;vertical-align:top;width:34%"><span class="sw" style="background:${a.color}"></span><b style="font-family:var(--display);font-size:15px;letter-spacing:.02em">${a.label}</b></td><td style="white-space:normal;color:var(--muted);font-size:13px">${a.blurb}</td></tr>`).join('') + `<tr><td colspan="2" style="white-space:normal;color:var(--muted);font-size:13px">Every bot also has a social style. <b style="color:var(--chalk)">Sharers</b> swap notes with anyone who hasn't wronged them. <b style="color:var(--chalk)">Reciprocators</b> swap only with friends or bots nobody has flagged. <b style="color:var(--chalk)">Thieves</b> copy other bots' notes. A caught thief is flagged by its victim (and, with warnings on, the victim's friends), and flagged bots get no more swaps.</td></tr>`;
$('stratLegend').innerHTML = ARCH.map((a) => `<span><i style="background:${a.color}"></i>${a.label}</span>`).join('');
$('preset').innerHTML = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
$('libPick').innerHTML = LIBRARY.players.map((p, i) => `<option value="${i}">${p.pos} ${p.name}</option>`).join('');
$('libPick').addEventListener('change', (e) => { libId = +e.target.value; drawLibrary(); });

/* ---------- Controls ---------- */
const SLIDERS = { fee: [0.01, (v) => v + '%'], allowance: [1, (v) => v + ' coins'], packEdge: [0.01, (v) => v + '%'], passesPerWeek: [1, (v) => String(v)], knowledgeWeeks: [1, (v) => v + ' wk'], detectChance: [0.01, (v) => v + '%'] };
const TOGGLES = ['passesTradable', 'sharing', 'stealing', 'gossip', 'games', 'outsideCollectors', 'royalties', 'evolve', 'leagueUpdates'];
function syncControls() {
  const c = WORLD.cfg;
  for (const [k, [scale, f]] of Object.entries(SLIDERS)) { $(k).value = Math.round(c[k] / scale * 100) / 100; $(k + 'V').textContent = f(+$(k).value); }
  for (const k of TOGGLES) $(k).checked = !!c[k];
}
for (const [k, [scale, f]] of Object.entries(SLIDERS)) $(k).addEventListener('input', () => { const v = +$(k).value; $(k + 'V').textContent = f(v); opts[k] = v * scale; if (WORLD && mode === 'live') WORLD.cfg[k] = v * scale; });
for (const k of TOGGLES) $(k).addEventListener('change', (e) => { opts[k] = e.target.checked; if (WORLD && mode === 'live') WORLD.cfg[k] = e.target.checked; });
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, speed = 1, acc = 0, lastT = 0, panelT = 0;
function setPlay(v) { playing = v; $('play').textContent = v ? 'Pause' : 'Play'; }
function advance() {
  if (mode === 'live') { step(WORLD); const f = frame(WORLD); pushFrame(f); for (const [s, b] of f.arcs) arcsLive.push({ s, b, age: 0 }); if (FRAMES.length > 2000) { /* keep memory bounded */ } return true; }
  if (cursor < FRAMES.length - 1) { cursor++; for (const [s, b] of FRAMES[cursor].arcs) arcsLive.push({ s, b, age: 0 }); return true; }
  setPlay(false); return false;
}
function frameLoop(ts) {
  const dt = Math.min(0.1, (ts - lastT) / 1000 || 0); lastT = ts;
  let ran = false;
  if (playing) { acc += dt * 3 * speed; while (acc >= 1) { if (!advance()) { acc = 0; break; } acc -= 1; ran = true; } }
  drawFloor();
  if (ran) drawCharts();
  if (ran && ts - panelT > 250) { drawPanels(); panelT = ts; }
  requestAnimationFrame(frameLoop);
}
function redrawAll() { $('stratLegend').innerHTML = lanes().map((i) => `<span><i style="background:${ARCH[i].color}"></i>${ARCH[i].label}</span>`).join(''); drawFloor(); drawCharts(); drawPanels(); libId = cur().hot[0]?.[0] ?? 0; $('libPick').value = libId; drawLibrary(); }
$('play').addEventListener('click', () => setPlay(!playing));
$('step').addEventListener('click', () => { setPlay(false); advance(); drawCharts(); drawPanels(); });
$('reset').addEventListener('click', () => { if (mode === 'replay') { cursor = 0; arcsLive = []; redrawAll(); return; } opts.seed = Number($('seed').value) || 88; startLive(); });
$('seed').addEventListener('change', () => { opts.seed = Number($('seed').value) || 88; if (mode === 'live') startLive(); });
$('preset').addEventListener('change', (e) => { presetKey = e.target.value; opts = { seed: opts.seed }; startLive(); });
$('liveBtn').addEventListener('click', () => startLive());
$('runFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try { const run = JSON.parse(await file.text()); if (!run.frames?.length) throw new Error('no frames'); startReplay(run); }
  catch (err) { $('hyp').innerHTML = `<b>That file isn't a sandbox run.</b> Pick a JSON file written by <span class="mono">node sandbox/run.mjs</span> (${escapeHtml(err.message)}).`; }
});
document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { speed = Number(b.dataset.speed); document.querySelectorAll('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); }));
Object.assign(COL, { chalk: css('--chalk'), muted: css('--muted'), faint: css('--faint'), gold: css('--gold'), panel: css('--panel') });
setPlay(playing);
startLive();
requestAnimationFrame(frameLoop);
window.addEventListener('resize', () => { drawCharts(); drawPanels(); });
