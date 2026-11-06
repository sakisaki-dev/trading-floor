/* The Trading Floor's world, run off the page's main thread. The engine source is prepended at build time. It runs one
   week at a time at the chosen speed and sends each finished week as a frame, the settings, and details for whatever
   player and bot the page has selected. */
let W = null, LIB = null, playing = true, speed = 1, timer = null, sel = { p: null, b: null };
const det = () => ({ p: sel.p == null ? null : playerDetail(W, sel.p), b: sel.b == null ? null : botDetail(W, sel.b) });
function one() { step(W); postMessage({ type: 'frame', frames: [frame(W, { full: true })], cfg: W.cfg, detail: det() }); }
function schedule() {
  clearTimeout(timer); if (!playing || !W) return;
  const tick = () => { if (!playing) return; const t0 = Date.now(); one(); const dt = Date.now() - t0; timer = setTimeout(tick, Math.max(typeof INLINE !== 'undefined' ? dt * 1.5 : 0, 333 / speed - dt)); }; // on the page itself (no worker), leave it time to draw between weeks
  timer = setTimeout(tick, 0);
}
onmessage = (e) => {
  const m = e.data;
  if (m.cmd === 'init') { LIB = m.lib; return; }
  if (m.cmd === 'start') {
    clearTimeout(timer); W = createWorld(LIB, m.opts); playing = !!m.playing; speed = m.speed || 1;
    const frames = [frame(W, { full: true })], warm = W.cfg.brain === 'nn' ? 2 : 60; // genome worlds open three generations in
    for (let i = 0; i < warm; i++) { step(W); frames.push(frame(W, { full: true })); }
    postMessage({ type: 'reset', frames, cfg: W.cfg, detail: det() }); schedule(); return;
  }
  if (!W) return;
  if (m.cmd === 'play') { playing = m.v; schedule(); }
  else if (m.cmd === 'speed') speed = m.v || 1;
  else if (m.cmd === 'step') one();
  else if (m.cmd === 'cfg') { W.cfg[m.k] = m.v; postMessage({ type: 'cfg', cfg: W.cfg }); }
  else if (m.cmd === 'sel') { sel = { p: m.p, b: m.b }; postMessage({ type: 'detail', detail: det() }); }
};
