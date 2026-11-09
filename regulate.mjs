// The government driver (docs/regulator-spec.md, sections 7, 15, 18): one world on a clock that never waits, and a
// government that reads state/ when it wakes and writes its controls, board post and notebook. Its changes take effect at
// the start of the week after its turn ends; the lag is logged. Everything is saved so a run replays exactly with no model.
//
//   node regulate.mjs --government stub --seed 1 --weeks 300 --pace 0.5 --out runs/gov-stub      # the harness, no model
//   node regulate.mjs --government A1 --seed 1 --weeks 2000 --pace 0 --out runs/a1-1               # a scripted arm (A0-A4)
//   node regulate.mjs --replay runs/gov-stub --out runs/gov-stub-replay                            # replay a run's decision log
//   node regulate.mjs --resume runs/g1                                                              # continue after a crash
//   node regulate.mjs --government claude --session-root /Users/Shared/tf-gov/g1 ...                # run 1 (docs/GOVERNMENT.md)
//
// Options: --preset regulated (configs/<preset>.json) · --set JSON (merged last) · --seed N · --weeks N (the planned
// length: never shown to the government) · --pace S (weekSeconds; 0 = no clock) · --lockstep K (tests: the world waits
// for each turn and its controls land K weeks after the week it read) · --wake N (default wake interval) · --brief v1|neutral
// · --elections TERM[:THRESHOLD] (run 2) · --serve PORT (the live page) · --practice N (practiceGens) · --allow-dirty.
// Files in --out: meta.json (the fingerprint), decisions.jsonl (every turn, election and prediction score), hashes.txt
// (sha1 of every week's full frame), frames.jsonl.gz (every full frame), clock.jsonl (pace and lag), run.json (for the
// page: frames thinned past 104 weeks, plus the government record), state/ (what the government saw last).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
import { spawn, execSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import * as E from './engine.mjs'; import { StateWriter } from './gov/state.mjs'; import { rulesMarkdown } from './gov/rules.mjs'; import { BRIEFS, turnPrompt } from './gov/brief.mjs'; import { ARMS } from './gov/arms.mjs';
import * as CS from './gov/session.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; }, flag = (k) => argv.includes('--' + k);
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex'), sha1 = (x) => crypto.createHash('sha1').update(x).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// ---------- What to run ----------
const resumeDir = opt('resume'), replayDir = opt('replay');
const prior = resumeDir ? JSON.parse(fs.readFileSync(path.join(resumeDir, 'meta.json'), 'utf8')) : replayDir ? JSON.parse(fs.readFileSync(path.join(replayDir, 'meta.json'), 'utf8')) : null;
const A = prior ? { ...prior.args, ...(replayDir ? { government: 'replay', pace: 0, serve: opt('serve') ?? null } : {}) } : {
  government: opt('government', 'stub'), seed: +opt('seed', 1), weeks: +opt('weeks', 300), pace: +opt('pace', 4), lockstep: opt('lockstep') != null ? +opt('lockstep') : null,
  preset: opt('preset', 'regulated'), set: JSON.parse(opt('set', '{}')), wake: +opt('wake', 10), brief: opt('brief', 'v1'), model: opt('model', CS.MODEL), practice: opt('practice') != null ? +opt('practice') : null,
  elections: opt('elections') ? { term: +opt('elections').split(':')[0], threshold: +(opt('elections').split(':')[1] ?? 0.5) } : null, thinkMs: +opt('think-ms', 0),
  armOptions: JSON.parse(opt('arm-options', '{}')), sessionRoot: opt('session-root', null), turnTimeoutMs: +opt('turn-timeout', 15 * 60 * 1000), serve: opt('serve') ?? null };
const out = path.resolve(resumeDir || opt('out', path.join(here, 'runs', `gov-${A.government}-${A.seed}`)));
if (!resumeDir && fs.existsSync(path.join(out, 'meta.json')) && !flag('overwrite')) { console.error(`${out} already holds a run (use --resume, --overwrite or another --out)`); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

// ---------- The fingerprint (spec 19) ----------
function git(cmd) { try { return execSync(`git -C ${JSON.stringify(here)} ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } }
const dirty = git('status --porcelain -- engine.mjs regulate.mjs gov configs data page tools') || '';
if (dirty && !flag('allow-dirty') && !prior?.fingerprint?.allowDirty && A.government === 'claude') { console.error(`The working tree is dirty; commit first (spec 19):\n${dirty}`); process.exit(2); }
const hashFile = (f) => { try { return sha(fs.readFileSync(path.join(here, f))); } catch { return null; } };
const DATA = ['library.json', 'timeline.json', 'history.json', 'kits.json', 'names.json', 'league_rates.json', 'rookie_names.json', 'nfl_age.json'];
const fingerprint = prior?.fingerprint || { commit: git('rev-parse HEAD'), dirty: !!dirty, diffSha256: dirty ? sha(git('diff') || '') : null, allowDirty: flag('allow-dirty'),
  files: Object.fromEntries(['engine.mjs', 'regulate.mjs', 'gov/state.mjs', 'gov/rules.mjs', 'gov/brief.mjs', 'gov/session.mjs', 'gov/arms.mjs', 'gov/stub_government.mjs', 'page/ui.js', 'page/body.html', 'page/style.css', 'page/worker.js', 'package-lock.json'].map((f) => [f, hashFile(f)])),
  data: Object.fromEntries(DATA.map((f) => [f, hashFile('data/' + f)])), node: process.version, hardware: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}` },
  brief: A.government === 'claude' ? { id: A.brief, sha256: sha(BRIEFS[A.brief]) } : null, model: A.government === 'claude' ? A.model : null };

// ---------- The world ----------
const rd = (f) => JSON.parse(fs.readFileSync(path.join(here, 'data', f), 'utf8'));
const lib = rd('library.json'); lib.timeline = rd('timeline.json'); for (const k of ['history', 'kits', 'names']) lib[k] = rd(k + '.json');
lib.leagueRates = rd('league_rates.json'); lib.rookieNames = rd('rookie_names.json'); lib.nflAge = rd('nfl_age.json');
const preset = JSON.parse(fs.readFileSync(path.join(here, 'configs', A.preset + '.json'), 'utf8'));
const cfg0 = { ...preset, ...A.set, ...(A.practice != null ? { practiceGens: A.practice } : {}), seed: A.seed };
if (!cfg0.government) cfg0.government = {};
if (!BRIEFS[A.brief]) { console.error(`--brief must be one of ${Object.keys(BRIEFS).join(', ')}`); process.exit(2); }
const tSetup = Date.now(); const W = E.createWorld(lib, cfg0);
const setupSecs = (Date.now() - tSetup) / 1000;
fingerprint.config = prior?.fingerprint?.config || JSON.parse(JSON.stringify(W.cfg)); fingerprint.rng = W.rngLayout; fingerprint.pins = E.GOV_PINS;
fingerprint.rulesSha256 = sha(rulesMarkdown({ elections: A.elections, defaultWake: A.wake })); fingerprint.boardWordsSha256 = sha(JSON.stringify(E.BOARD_WORDS));

// ---------- Files ----------
const frameHash = (f) => sha1(JSON.stringify(f));
const logF = path.join(out, 'decisions.jsonl'), hashF = path.join(out, 'hashes.txt'), clockF = path.join(out, 'clock.jsonl');
const priorLog = resumeDir ? readLog(logF) : replayDir ? readLog(path.join(replayDir, 'decisions.jsonl')) : [];
const priorHashes = resumeDir ? readLines(hashF) : replayDir ? readLines(path.join(replayDir, 'hashes.txt')) : [];
function readLog(f) { return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; }
function readLines(f) { return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []; }
if (!resumeDir) { for (const f of [logF, hashF, clockF]) fs.writeFileSync(f, ''); }
const logLine0 = (x) => fs.appendFileSync(logF, JSON.stringify(x) + '\n'), logLine = logLine0;
const gz = zlib.createGzip(); gz.pipe(fs.createWriteStream(path.join(out, 'frames.jsonl.gz'))); // a resumed run writes every frame again (it re-runs from week 0)
if (resumeDir) fs.appendFileSync(clockF, JSON.stringify({ type: 'resume', at: new Date().toISOString(), weeksLogged: priorHashes.length - 1 }) + '\n');
const FULL_WEEKS = 104, THIN = ['bots', 'jn', 'aiLog', 'arcs', 'hot', 'events', 'researched', 'topics', 'top', 'movers', 'aiDetail', 'genome', 'lineages', 'pool', 'ovr', 'risk', 'lender', 'fashion'];
const frames = [], thin = (i) => { const f = frames[i]; if (!f || f._thin) return; for (const k of THIN) delete f[k]; f._thin = true; };
const record = { decisions: [], posts: [], nbVersions: [], governments: [], elections: [], predictions: [] }; // nbVersions: the notebook each time it changed

// ---------- The government's folder ----------
// stub, claude: a session folder with state/ inside (the session reads it); arms and replays: state/ in the run folder
let S = null; // the session (claude: isolation facts; stub: just its folder)
const isChild = A.government === 'stub' || A.government === 'claude';
if (A.government === 'claude') { if (!A.sessionRoot) { console.error('--government claude needs --session-root (a folder outside your home, e.g. /Users/Shared/tf-gov/g1)'); process.exit(2); } S = CS.prepareSession(A.sessionRoot); fingerprint.cli = { version: S.version, sha256: S.binSha256, source: S.source }; }
else if (A.government === 'stub') { const root = path.join(out, 'session'); fs.mkdirSync(path.join(root, 'state'), { recursive: true }); for (const f of CS.WRITABLE) if (!fs.existsSync(path.join(root, f))) fs.writeFileSync(path.join(root, f), ''); S = { cwd: root }; }
const stateDir = S ? path.join(S.cwd, 'state') : path.join(out, 'state'); fs.mkdirSync(stateDir, { recursive: true });
const SW = new StateWriter(stateDir, { elections: A.elections, defaultWake: A.wake }); SW.rules(rulesMarkdown({ elections: A.elections, defaultWake: A.wake }));
const arm = ARMS[A.government]?.({ seed: A.seed, ...(A.armOptions || {}) }) || null;
if (!isChild && !arm && A.government !== 'replay' && A.government !== 'none') { console.error(`unknown --government ${A.government} (stub, claude, none, ${Object.keys(ARMS).join(', ')})`); process.exit(2); }

// ---------- Governments in office (run 2: elections) ----------
let govNo = 1, sessionId = prior?.sessionId || crypto.randomUUID(), firstTurn = !prior, turnNo = 0, lastErrors = [];
const govRow = () => record.governments[record.governments.length - 1];
function newGovernment(from) { record.governments.push({ id: `G${govNo}`, from, to: null, terms: 0, account: 0, pop0: W.bots.length, pop1: W.bots.length, revenue: 0, transfers: 0, consumption: 0, left: null }); SW.recordTable(record.governments); }
newGovernment(0); if (A.elections) E.govTermStart(W);

// ---------- The live page (--serve) ----------
const meta = (extra = {}) => ({ id: path.basename(out), source: 'regulate.mjs', government: A.government, seed: '(hidden)', weeksRun: W.t, pace: A.pace, setupSecs, rng: W.rngLayout, status: STATUS, ...extra });
let STATUS = { state: 'starting', week: 0, since: Date.now() }, behindMs = 0, slowWeeks = 0;
if (A.serve) {
  const http = await import('node:http'), port = Number(A.serve) || 4322, pagePath = path.join(here, 'docs', 'trading-floor.html');
  const shell = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><script>window.LIVE_RUN = '/frames';</script>${body}</body></html>`;
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/frames') { const since = Number(u.searchParams.get('since')) || 0; res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ meta: meta(), config: W.cfg, total: frames.length, frames: frames.slice(since), gov: govRecord() })); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(shell(fs.readFileSync(pagePath, 'utf8')));
  }).listen(port, '0.0.0.0', () => console.log(`Live view: http://localhost:${port}`));
}
const govRecord = () => ({ decisions: record.decisions, posts: record.posts, nbVersions: record.nbVersions, governments: record.governments, elections: record.elections, predictions: record.predictions, status: STATUS, pace: A.pace, lockstep: A.lockstep, clock: { behindMs: Math.round(behindMs), slowWeeks } });

// ---------- One turn: what the government wrote, applied at the start of the next week ----------
let running = null, wake = { at: 0, when: [] }, pending = []; // pending: finished turns waiting for the next week boundary
const nbFile = () => path.join(S.cwd, 'notebook.md');
let nbLast = '';
function startTurn({ budgetDay = false, handover = false } = {}) {
  const t0 = Date.now(), weekRead = W.t, n = ++turnNo; STATUS = { state: 'thinking', week: W.t, since: t0, turn: n };
  let p;
  if (A.government === 'stub') p = new Promise((res) => { const c = spawn(process.execPath, [path.join(here, 'gov/stub_government.mjs'), '--session', S.cwd, '--think-ms', String(A.thinkMs)], { stdio: ['ignore', 'ignore', 'pipe'] }); let err = ''; c.stderr.on('data', (d) => (err += d)); c.on('exit', (code) => res({ code, ms: Date.now() - t0, err: err.slice(0, 2000), facts: { ok: code === 0, error: code ? err.slice(0, 500) : null } })); });
  else p = CS.claudeTurn(S, { prompt: turnPrompt({ week: W.t, errors: lastErrors, budgetDay, handover }), brief: BRIEFS[A.brief], model: A.model, sessionId, first: firstTurn, timeoutMs: A.turnTimeoutMs }).then((r) => ({ ...r, facts: CS.turnFacts(r) }));
  running = { n, weekRead, t0, budgetDay };
  return p.then((r) => { const done = { ...running, r, arrivedAfter: W.t, readFiles: readOutputs() }; running = null; if (A.government === 'claude' && done.r.facts.ok) firstTurn = false; return done; });
}
function readOutputs() {
  const rf = (f) => { try { return fs.readFileSync(path.join(S.cwd, f), 'utf8'); } catch { return ''; } };
  const c = rf('controls.json'), b = rf('board.md'), nb = rf('notebook.md'); fs.writeFileSync(path.join(S.cwd, 'controls.json'), ''); fs.writeFileSync(path.join(S.cwd, 'board.md'), '');
  const stray = A.government === 'claude' ? CS.strayFiles(S) : [], comp = A.government === 'claude' ? CS.newCompactions(S, (S.seen ||= new Set())) : [];
  return { controlsText: c, board: b, notebook: nb, stray, compactions: comp };
}
// Split controls.json into the engine's controls and the driver's (wake, commentary, predictions)
function parseControls(text) {
  if (!text.trim()) return { eng: {}, wakeIn: null, errors: [] };
  let c; try { c = JSON.parse(text); } catch (e) { return { eng: {}, wakeIn: null, errors: [{ dial: null, error: `controls.json is not valid JSON: ${e.message}` }] }; }
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { eng: {}, wakeIn: null, errors: [{ dial: null, error: 'controls.json must hold one JSON object' }] };
  const { wake: wk, commentary, predictions, ...eng } = c, errors = []; let wakeIn = null;
  if (wk != null) { const n = wk.inWeeks, ok = (n == null || (Number.isInteger(n) && n >= 1 && n <= 100)) && (wk.when == null || (Array.isArray(wk.when) && wk.when.every((t) => t && E.GOV_INDICATORS.includes(t.field) && E.GOV_TRIGGER_OPS.includes(t.op) && typeof t.value === 'number' && Number.isFinite(t.value))));
    if (ok) wakeIn = { inWeeks: n ?? null, when: wk.when || [] }; else errors.push({ dial: 'wake', value: wk, error: `inWeeks must be a whole number from 1 to 100; when: [{field, op, value}] with field an indicator and op one of ${E.GOV_TRIGGER_OPS.join(' ')}` }); }
  let preds = []; if (predictions != null) { if (Array.isArray(predictions) && predictions.length <= 20 && predictions.every((p) => p && E.GOV_INDICATORS.includes(p.metric) && (p.direction === 'up' || p.direction === 'down') && Number.isInteger(p.horizon) && p.horizon >= 1 && p.horizon <= 1000)) preds = predictions; else errors.push({ dial: 'predictions', value: predictions, error: 'a list of up to 20 {dial, metric (an indicator), direction up or down, horizon (weeks, 1 to 1000)}' }); }
  return { eng, wakeIn, commentary: typeof commentary === 'string' ? commentary.slice(0, 2000) : null, preds, errors };
}
const diffLines = (a, b) => { const A0 = a.split('\n'), B0 = b.split('\n'), sa = new Set(A0), sb = new Set(B0); return { added: B0.filter((l) => l && !sa.has(l)).length, removed: A0.filter((l) => l && !sb.has(l)).length, chars: b.length }; };
// Apply a finished turn now (W.t is the last finished week; it takes effect in week W.t + 1)
function applyTurn(d) {
  const P = parseControls(d.readFiles.controlsText), res = E.applyControls(W, P.eng), errors = [...P.errors, ...res.errors], eff = W.t + 1;
  const text = d.readFiles.board.trim(); let parsed = null; if (text) { parsed = E.noteBoard(W, text); SW.post(eff, text, parsed); record.posts.push({ week: eff, text, parsed }); }
  if (P.wakeIn) { wake.inWeeks = P.wakeIn.inWeeks ?? wake.inWeeks ?? A.wake; wake.when = P.wakeIn.when; } // without a wake entry the last setting stands (at first, the default)
  wake.at = W.t + (wake.inWeeks ?? A.wake);
  const nb = d.readFiles.notebook, nd = diffLines(nbLast, nb); if (nb !== nbLast) record.nbVersions.push({ week: W.t + 1, gov: `G${govNo}`, text: nb }); nbLast = nb;
  const ind = E.govIndicators(W), preds = (P.preds || []).map((p) => ({ turn: d.n, ...p, base: ind[p.metric], from: W.t, due: W.t + p.horizon, gov: `G${govNo}` })); record.predictions.push(...preds);
  const entry = { type: 'turn', gov: `G${govNo}`, turn: d.n, weekRead: d.weekRead, weekEffective: eff, lagWeeks: eff - d.weekRead, budgetDay: !!d.budgetDay, ms: d.r.ms, controls: P.eng, changes: res.changes, errors, wake: P.wakeIn, commentary: P.commentary ?? null, predictions: preds,
    board: text ? { text, parsed: parsed && { tone: parsed.tone, sentences: parsed.sentences, mentions: parsed.mentions, dials: parsed.dials } } : null, notebook: { ...nd, sha256: sha(nb) }, facts: d.r.facts, stray: d.readFiles.stray, compactions: d.readFiles.compactions };
  logLine(entry); record.decisions.push(entry); lastErrors = errors;
  SW.decision({ turn: d.n, weekRead: d.weekRead, weekEffective: eff, changes: res.changes, errors, commentary: entry.commentary });
  STATUS = { state: 'asleep', week: W.t, since: Date.now(), until: wake.at, when: wake.when };
  if (!d.r.facts.ok) STATUS = { state: d.r.facts.unavailable ? 'unavailable' : 'error', week: W.t, since: Date.now(), error: d.r.facts.error, until: wake.at };
}
// A replayed decision: the same controls and post at the same week (no wake rules, no model)
function applyLogged(e) {
  if (e.type !== 'turn' && e.type !== 'arm') return;
  E.applyControls(W, e.controls || {}); if (e.type === 'turn') SW.decision({ turn: e.turn, weekRead: e.weekRead, weekEffective: e.weekEffective, changes: e.changes, errors: e.errors, commentary: e.commentary }); if (e.board?.text) { const parsed = E.noteBoard(W, e.board.text); SW.post(W.t + 1, e.board.text, parsed); record.posts.push({ week: W.t + 1, text: e.board.text, parsed }); }
  record.decisions.push(e);
}
// The election (run 2) at the end of a term: approval counted mechanically; below the threshold a new government takes office
function election(silent = false) { // silent: re-running a logged week on resume (the engine's side is redone, nothing is logged again)
  const ap = E.govApproval(W), retained = ap.share == null || ap.share >= A.elections.threshold, e = { type: 'election', week: W.t, gov: `G${govNo}`, approval: ap, retained };
  const logLine = silent ? () => {} : logLine0; logLine(e); record.elections.push(e);
  if (retained) govRow().terms++;
  else { const acct = E.govHandover(W), row = govRow(); row.to = W.t; row.account = acct; row.left = W.treasury; govNo++; newGovernment(W.t);
    if (silent) { E.govTermStart(W); return retained; } // the session's files and id were handed over when the run first passed this week
    SW.notebook(row.id, nbLast); if (S) { fs.writeFileSync(nbFile(), ''); nbLast = ''; } sessionId = crypto.randomUUID(); firstTurn = true; wake = { at: W.t, when: [] }; logLine({ type: 'handover', week: W.t, from: row.id, to: `G${govNo}`, outgoingAccount: acct, treasury: W.treasury, sessionId }); }
  E.govTermStart(W); return retained;
}
function scorePredictions() { const ind = E.govIndicators(W); for (const p of record.predictions) if (p.due === W.t && p.hit == null) { p.value = ind[p.metric]; p.hit = p.direction === 'up' ? p.value > p.base : p.value < p.base; const e = { type: 'prediction', ...p }; logLine(e); SW.decision(e); } }
function bookWeek(f) { const r = govRow(), L = f.gov.lines; for (const [k, v] of Object.entries(L)) { if (['fees', 'holding', 'wealthTax', 'packTax', 'outsideTax', 'exitTax', 'pollTax', 'levy'].includes(k)) r.revenue += v; else if (k === 'consumption') r.consumption -= v; else if (k !== 'openingGrant') r.transfers -= v; } r.pop1 = W.bots.length; r.account = W.gov.account; r.treasury = W.treasury; }

// ---------- The run ----------
const startWeek = 0, target = A.weeks;
const f0 = E.frame(W, { full: true }); const h0 = frameHash(f0);
if (priorHashes.length && priorHashes[0] !== h0) throw new Error(`week 0 differs from the run being ${resumeDir ? 'resumed' : 'replayed'}: this engine or data is not the one that made it`);
if (!resumeDir) fs.appendFileSync(hashF, h0 + '\n'); gz.write(JSON.stringify(f0) + '\n'); frames.push(f0);
const writeState = () => SW.week(W, { lastErrors, wake: { atWeek: wake.at, when: wake.when } });
writeState();
const logged = new Map(); for (const e of priorLog) if ((e.type === 'turn' || e.type === 'arm') && (replayDir || resumeDir)) { const k = e.weekEffective; (logged.get(k) || logged.set(k, []).get(k)).push(e); }
const lastLoggedWeek = resumeDir ? priorHashes.length - 1 : -1;
if (resumeDir) { // re-run the logged weeks exactly (no clock, no government), then carry on live with the same session
  console.log(`Resuming: replaying ${lastLoggedWeek} logged weeks first (the decision log is the checkpoint)`);
  // the session's schedule, errors and predictions as the last logged turn left them; a turn that was in flight at the cut
  // (started, not yet applied) is lost, and the session wakes at once instead (logged as 'resumed')
  const turns = priorLog.filter((e) => e.type === 'turn'), last = turns[turns.length - 1]; turnNo = turns.reduce((m, e) => Math.max(m, e.turn), 0);
  for (const e of priorLog) if (e.type === 'handover') sessionId = e.sessionId;
  if (last) { wake = { inWeeks: last.wake?.inWeeks ?? null, when: last.wake?.when || [] }; for (const t of turns) if (t.wake) { wake.inWeeks = t.wake.inWeeks ?? wake.inWeeks; wake.when = t.wake.when; } wake.at = last.weekEffective - 1 + (wake.inWeeks ?? A.wake); lastErrors = last.errors || []; }
  for (const t of turns) for (const p of t.predictions || []) if (p.due != null) record.predictions.push({ ...p, hit: priorLog.some((e) => e.type === 'prediction' && e.turn === p.turn && e.metric === p.metric && e.due === p.due) ? false : undefined });
  record.predictions = record.predictions.filter((p) => p.hit === undefined).map(({ hit, ...p }) => p);
  const lastEff = last ? last.weekEffective - 1 : 0, inFlight = priorLog.some((e) => e.type === 'unfinished' || (e.type === 'wake' && e.week >= lastEff)) || wake.at <= lastLoggedWeek;
  if (inFlight) { wake.at = lastLoggedWeek; wake.when = wake.when || []; logLine({ type: 'resumed', week: lastLoggedWeek, note: 'a turn was in flight at the cut; it is lost, and the session wakes at once' }); } else logLine({ type: 'resumed', week: lastLoggedWeek });
  firstTurn = !turns.some((e) => e.facts?.ok); try { nbLast = fs.readFileSync(nbFile(), 'utf8'); } catch {} }
// Budget day: one turn with the opening state before the clock starts (every arm has it; A0 makes no move)
if (!resumeDir && !replayDir) {
  if (isChild) { const d = await startTurn({ budgetDay: true }); applyTurn(d); }
  else if (arm) { const c = arm.decide(W, E.govIndicators(W)); if (c) { const res = E.applyControls(W, c), e = { type: 'arm', arm: A.government, weekRead: 0, weekEffective: 1, controls: c, changes: res.changes, errors: res.errors }; logLine(e); record.decisions.push(e); } }
  wake.at = Math.max(wake.at, 0);
}
console.log(`Run ${path.basename(out)}: government ${A.government}, ${W.bots.length} bots, pace ${A.pace} s/week${A.lockstep != null ? `, lockstep ${A.lockstep}` : ''}; world ready in ${setupSecs.toFixed(0)} s.`);
const clock0 = Date.now();
for (let week = 1; week <= target; week++) {
  const replaying = !!replayDir || (resumeDir && week <= lastLoggedWeek);
  const tw = Date.now();
  // the start of the week: decisions that arrived (or were logged for this week) take effect
  if (replaying) for (const e of logged.get(week) || []) applyLogged(e);
  else { while (pending.length && (A.lockstep == null || pending[0].applyAt <= week)) applyTurn(pending.shift()); }
  E.step(W);
  const f = E.frame(W, { full: true }), h = frameHash(f); gz.write(JSON.stringify(f) + '\n');
  if (replaying && priorHashes[week] && priorHashes[week] !== h) throw new Error(`week ${week} differs from the logged run (hash ${h.slice(0, 12)} against ${priorHashes[week].slice(0, 12)})`);
  if (!(resumeDir && week <= lastLoggedWeek)) fs.appendFileSync(hashF, h + '\n');
  frames.push(f); if (frames.length > FULL_WEEKS) thin(frames.length - 1 - FULL_WEEKS);
  bookWeek(f); writeState(); scorePredictions();
  if (A.elections && W.t % A.elections.term === 0) { const kept = election(!!resumeDir && replaying); if (!kept && isChild && !running) wake.at = W.t; } // replays hold the elections too: a handover moves the engine's account
  // the arms decide every week (their controls land next week); a session wakes on its schedule or a trigger
  if (!replaying && arm) { const c = arm.decide(W, E.govIndicators(W)); if (c) { const res = E.applyControls(W, c), e = { type: 'arm', arm: A.government, weekRead: W.t, weekEffective: W.t + 1, controls: c, changes: res.changes, errors: res.errors }; logLine(e); record.decisions.push(e); } }
  if ((!replaying || (resumeDir && week === lastLoggedWeek)) && isChild && !running && !pending.length) {
    const fired = E.checkTriggers(W, wake.when);
    if (W.t >= wake.at || fired.length) {
      const handover = record.decisions.filter((x) => x.gov === `G${govNo}`).length === 0 && govNo > 1;
      if (fired.length) logLine({ type: 'wake', week: W.t, triggers: fired });
      const p = startTurn({ handover }).then((d) => { pending.push({ ...d, applyAt: d.weekRead + (A.lockstep ?? 0) }); });
      if (A.lockstep != null) await p; // tests only: the world waits for the turn
    }
  }
  // the clock: wait out the rest of this week's seconds; a week that took longer is logged, never skipped or made up
  const ms = Date.now() - tw; let wait = A.pace * 1000 - ms; if (wait < 0) { behindMs += -wait; slowWeeks++; }
  fs.appendFileSync(clockF, JSON.stringify({ week: W.t, computeMs: ms, waitMs: Math.max(0, Math.round(wait)), behindMs: Math.round(behindMs), slowWeeks, turn: running ? running.n : null, at: new Date().toISOString() }) + '\n');
  if (STATUS.state !== 'thinking') STATUS = { ...STATUS, week: W.t };
  if (A.pace > 0) await sleep(wait); else await new Promise((r) => setImmediate(r)); // let finished turns arrive
  if (W.t % 50 === 0 || W.t === target) { const pc = (Date.now() - clock0) / 1000 / week; console.log(`week ${W.t}/${target} · ${pc.toFixed(2)} s/week · treasury ${Math.round(W.treasury)} · own account ${Math.round(W.gov.account)} · ${W.bots.length} bots · ${record.decisions.filter((x) => x.type === 'turn').length} turns · behind ${(behindMs / 1000).toFixed(0)} s over ${slowWeeks} weeks`); }
  if (W.t % 250 === 0) saveAll();
}
if (running) { logLine({ type: 'unfinished', week: W.t, turn: running.n, weekRead: running.weekRead }); console.log(`Turn ${running.n} was still running at the end; its output is not applied.`); }
saveAll(); gz.end();
function saveAll() {
  const m = { args: A, fingerprint, sessionId, weeksRun: W.t, savedAt: new Date().toISOString(), behindMs, slowWeeks, governments: record.governments, setupSecs };
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(m, null, 1));
  fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify({ format: 'rv-sandbox-run/1', meta: meta({ weeksRun: W.t }), config: W.cfg, frames, gov: govRecord() }));
}
console.log(`Done: ${W.t} weeks, ${record.decisions.filter((x) => x.type === 'turn').length} turns. Saved to ${path.relative(process.cwd(), out)}/`);
if (!A.serve) process.exit(0);
