// The page's own government driver: regulate.mjs's loop for the scripted governments, run inside the page's worker
// (no files, no processes, no model). The arms A0–A4 decide after every week; the stub takes turns on its wake schedule
// (in N weeks or when a trigger fires) with the same file protocol held in memory (controls, board post, notebook).
// A scripted turn takes no time here, so every turn reads week t and takes effect at the start of week t + 1 (lag 1).
// Elections, the notebook handover, predictions and the record of governments work as in regulate.mjs. The record it
// keeps has the shape of regulate.mjs's govRecord(), so the page draws a browser world, a --serve run and a replay alike.
import * as E from '../engine.mjs'; import { ARMS } from './arms.mjs'; import { stubTurn } from './stub_core.mjs';
export const PAGE_GOVS = { A0: 'A0 · do nothing', A1: 'A1 · balanced-budget thermostat', A2: 'A2 · greedy: high fee, no spending', A3: 'A3 · generous: spends it all', A4: 'A4 · random legal moves', stub: 'Stub · every kind of control' };
export function pageGovernment(W, { kind = 'A1', elections = null, wakeDefault = 10 } = {}) {
  const R4 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x);
  const rec = { decisions: [], posts: [], nbVersions: [], governments: [], elections: [], predictions: [], notebooks: [], status: { state: 'asleep', week: 0 }, pace: null, lockstep: 0, clock: null, kind, kinds: [{ from: 0, kind }],
    wake: { at: 0, when: [], inWeeks: null, fired: null }, electionsCfg: elections, scale: E.govScale(W), inputNames: E.govInputNames(W), source: 'page' };
  let arm = null, govNo = 1, turnNo = 0, notebook = '', lastErrors = [];
  const setKind = (k) => { kind = k; rec.kind = k; arm = ARMS[k] ? ARMS[k]({ seed: W.cfg.seed }) : null; if (rec.kinds.at(-1).kind !== k) rec.kinds.push({ from: W.t + 1, kind: k }); if (!arm) rec.wake.at = W.t; status(); };
  const govRow = () => rec.governments[rec.governments.length - 1];
  const newGovernment = (from) => rec.governments.push({ id: `G${govNo}`, from, to: null, terms: 0, account: 0, pop0: W.bots.length, pop1: W.bots.length, revenue: 0, transfers: 0, consumption: 0, left: null });
  const status = () => { rec.status = arm ? { state: 'scripted', week: W.t, kind } : { state: 'asleep', week: W.t, until: rec.wake.at, when: rec.wake.when, kind }; };
  newGovernment(0); if (elections) E.govTermStart(W);
  // controls.json split into the engine's controls and the driver's (wake, commentary, predictions), as regulate.mjs does
  function parseControls(c) {
    const { wake: wk, commentary, predictions, ...eng } = c || {}, errors = []; let wakeIn = null, preds = [];
    if (wk != null) { const n = wk.inWeeks, ok = (n == null || (Number.isInteger(n) && n >= 1 && n <= 100)) && (wk.when == null || (Array.isArray(wk.when) && wk.when.every((t) => t && E.GOV_INDICATORS.includes(t.field) && E.GOV_TRIGGER_OPS.includes(t.op) && typeof t.value === 'number' && Number.isFinite(t.value))));
      if (ok) wakeIn = { inWeeks: n ?? null, when: wk.when || [] }; else errors.push({ dial: 'wake', value: wk, error: 'inWeeks must be a whole number from 1 to 100; when: [{field, op, value}]' }); }
    if (predictions != null) { if (Array.isArray(predictions) && predictions.length <= 20 && predictions.every((p) => p && E.GOV_INDICATORS.includes(p.metric) && (p.direction === 'up' || p.direction === 'down') && Number.isInteger(p.horizon) && p.horizon >= 1 && p.horizon <= 1000)) preds = predictions; else errors.push({ dial: 'predictions', value: predictions, error: 'a list of up to 20 {dial, metric, direction, horizon}' }); }
    return { eng, wakeIn, commentary: typeof commentary === 'string' ? commentary.slice(0, 2000) : null, preds, errors };
  }
  // One stub turn: read now (as state/now.json has it), write its three files, apply them for next week
  function stubTurnNow({ budgetDay = false, handover = false, fired = null } = {}) {
    const weekRead = W.t, n = ++turnNo, ind = E.govIndicators(W), dials = {}; for (const k of Object.keys(E.GOV_DIALS)) dials[k] = E.GOV_DIALS[k].cfg ? W.cfg[k] : W.gov.d[k];
    const now = { week: W.t, indicators: Object.fromEntries(Object.entries(ind).map(([k, v]) => [k, R4(v)])), dials };
    const players = W.players.filter((p) => p.lg && (p.lg.active || p.lg.season?.g > 0)).map((p) => ({ name: p.name, active: !!p.lg.active, career: p.lg.tot }));
    const out = stubTurn({ now, notebook, league: { players } }), P = parseControls(out.controls), res = E.applyControls(W, P.eng), errors = [...P.errors, ...res.errors], eff = W.t + 1;
    const text = (out.board || '').trim(); let parsed = null; if (text) { parsed = E.noteBoard(W, text); rec.posts.push({ week: eff, text, parsed }); }
    const wk = rec.wake; if (P.wakeIn) { wk.inWeeks = P.wakeIn.inWeeks ?? wk.inWeeks ?? wakeDefault; wk.when = P.wakeIn.when; } wk.at = W.t + (wk.inWeeks ?? wakeDefault);
    if (out.notebook !== notebook) rec.nbVersions.push({ week: eff, gov: `G${govNo}`, text: out.notebook }); notebook = out.notebook;
    const preds = P.preds.map((p) => ({ turn: n, ...p, base: ind[p.metric], from: W.t, due: W.t + p.horizon, gov: `G${govNo}` })); rec.predictions.push(...preds);
    rec.decisions.push({ type: 'turn', gov: `G${govNo}`, turn: n, weekRead, weekEffective: eff, lagWeeks: eff - weekRead, budgetDay, handover, wakeReason: budgetDay ? 'budget day' : handover ? 'new government' : fired ? 'trigger' : 'schedule', triggers: fired, ms: 0, controls: P.eng, changes: res.changes, errors, wake: P.wakeIn, commentary: P.commentary, predictions: preds,
      board: text ? { text, parsed: { tone: parsed.tone, sentences: parsed.sentences, mentions: parsed.mentions, dials: parsed.dials } } : null, facts: { ok: true } });
    lastErrors = errors; status();
  }
  function armTurn(weekRead) { const c = arm.decide(W, E.govIndicators(W)); if (!c) return; const res = E.applyControls(W, c); rec.decisions.push({ type: 'arm', arm: kind, gov: `G${govNo}`, weekRead, weekEffective: weekRead + 1, budgetDay: weekRead === 0, controls: c, changes: res.changes, errors: res.errors }); }
  function election() {
    const ap = E.govApproval(W), retained = ap.share == null || ap.share >= elections.threshold; rec.elections.push({ type: 'election', week: W.t, gov: `G${govNo}`, approval: ap, retained });
    if (retained) govRow().terms++;
    else { const acct = E.govHandover(W), row = govRow(); row.to = W.t; row.account = acct; row.left = W.treasury; rec.notebooks.push({ id: row.id, week: W.t, text: notebook }); govNo++; newGovernment(W.t); notebook = ''; rec.wake.at = W.t; rec.wake.when = [];
      rec.decisions.push({ type: 'handover', week: W.t, weekEffective: W.t + 1, from: row.id, to: `G${govNo}`, outgoingAccount: acct, treasury: W.treasury }); }
    E.govTermStart(W); return retained;
  }
  function bookWeek(f) { const r = govRow(); for (const [k, v] of Object.entries(f.gov?.lines || {})) { if (['fees', 'holding', 'wealthTax', 'packTax', 'outsideTax', 'exitTax', 'pollTax', 'levy'].includes(k)) r.revenue += v; else if (k === 'consumption') r.consumption -= v; else if (k !== 'openingGrant') r.transfers -= v; } r.pop1 = W.bots.length; r.account = W.gov.account; r.treasury = W.treasury; }
  function scorePredictions() { const ind = E.govIndicators(W); for (const p of rec.predictions) if (p.due === W.t && p.hit == null) { p.value = ind[p.metric]; p.hit = p.direction === 'up' ? p.value > p.base : p.value < p.base; } }
  setKind(kind); rec.kinds = [{ from: 0, kind }];
  return {
    rec, setKind,
    // Budget day: one turn with the opening state before the first week (A0 makes no move)
    budgetDay() { if (arm) armTurn(0); else stubTurnNow({ budgetDay: true }); status(); },
    // After each finished week (f: its frame): the books, predictions, the election, then the government's turn
    after(f) {
      bookWeek(f); scorePredictions();
      let handover = false; if (elections && W.t % elections.term === 0) handover = !election();
      if (arm) armTurn(W.t);
      else { const fired = E.checkTriggers(W, rec.wake.when); rec.wake.fired = fired.length ? fired : null; if (W.t >= rec.wake.at || fired.length) stubTurnNow({ handover: handover || (govNo > 1 && !rec.decisions.some((d) => d.type === 'turn' && d.gov === `G${govNo}`)), fired: fired.length ? fired : null }); }
      status(); rec.lastErrors = lastErrors;
    },
    nextElection: () => (elections ? (Math.floor(W.t / elections.term) + 1) * elections.term : null),
  };
}
