// The government's Claude session (spec 10.2, 15.2): the local `claude` CLI on the owner's subscription, isolated.
// - It runs from a folder outside the owner's home tree holding only state/, the three files it writes and nothing else;
//   its HOME is a separate empty folder, so no CLAUDE.md, user settings, memory or auto-memory exist on its path.
// - The system prompt is replaced by the brief (--system-prompt), setting sources are off, MCP servers are off, slash
//   commands and customisations are off (--safe-mode), the file tools are confined to the folder (--restricted), and the
//   only tools are Read (the folder) and Write (controls.json, notebook.md, board.md); anything else is denied without a
//   prompt (--permission-mode dontAsk --permission-prompts none).
// - The CLI binary is copied into the run folder, its SHA-256 recorded, and auto-update is off.
// - One session for the whole run: started with --session-id, then resumed each turn (--resume).
// Nothing here runs a model by itself: the driver calls claudeTurn() only for a real run, which the owner starts.
// The flags were fixed against Claude Code 2.1.318; the plumbing test (gov/plumbing.mjs) must confirm them on the
// installed CLI before run 1, from the session's own effective context.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawn, execFileSync } from 'node:child_process';
export const MODEL = 'claude-haiku-5-5';
export const WRITABLE = ['controls.json', 'notebook.md', 'board.md'];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export function findCli() {
  const c = [process.env.CLAUDE_CLI, path.join(os.homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  try { const ext = path.join(os.homedir(), '.vscode/extensions'); for (const d of fs.readdirSync(ext).filter((x) => x.startsWith('anthropic.claude-code-')).sort().reverse()) c.push(path.join(ext, d, 'resources/native-binary/claude')); } catch {}
  return c.find((p) => p && fs.existsSync(p)) || null;
}
// The isolated folder: ROOT/session (the working folder), ROOT/home (its HOME), ROOT/bin/claude (the pinned binary)
export function prepareSession(root, { cli = findCli() } = {}) {
  const abs = path.resolve(root), home = os.homedir();
  if (abs === home || abs.startsWith(home + path.sep)) throw new Error(`the session folder must be outside the home tree (${home}); use e.g. /Users/Shared/tf-gov/<run>`);
  if (!cli) throw new Error('no claude CLI found: set CLAUDE_CLI to its path');
  for (const d of ['session/state', 'home', 'bin']) fs.mkdirSync(path.join(abs, d), { recursive: true });
  for (let up = path.dirname(abs); ; up = path.dirname(up)) { for (const f of ['CLAUDE.md', 'CLAUDE.local.md', '.claude']) if (fs.existsSync(path.join(up, f))) throw new Error(`${path.join(up, f)} exists on the session's path: remove it or choose another folder`); if (up === path.dirname(up)) break; }
  const bin = path.join(abs, 'bin', 'claude'); if (!fs.existsSync(bin)) { fs.copyFileSync(cli, bin); fs.chmodSync(bin, 0o755); }
  for (const f of WRITABLE) if (!fs.existsSync(path.join(abs, 'session', f))) fs.writeFileSync(path.join(abs, 'session', f), '');
  let version = null; try { version = execFileSync(bin, ['--version'], { env: { HOME: path.join(abs, 'home'), PATH: '/usr/bin:/bin', DISABLE_AUTOUPDATER: '1' }, encoding: 'utf8', timeout: 20000 }).trim(); } catch (e) { version = `unknown (${e.message.slice(0, 80)})`; }
  return { root: abs, cwd: path.join(abs, 'session'), home: path.join(abs, 'home'), bin, binSha256: sha(bin), version, source: cli };
}
// The CLI's own built-in plugins load even under --safe-mode (2.1.319: agents-md, telemetry, privacy, plugin-authoring,
// the last with skill and tool hooks; sec-default appears once signed in). They are switched off by name; the plumbing test fails if a new one appears.
const BUILTIN_PLUGINS = ['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-privacy', 'cc-plugin-plugin-authoring', 'cc-plugin-sec-default'];
const NO_PLUGINS = JSON.stringify({ enabledPlugins: Object.fromEntries(BUILTIN_PLUGINS.map((n) => [`${n}@builtin`, false])) });
export function sessionArgs({ prompt, brief, model = MODEL, sessionId, first, format = 'json' }) {
  return ['-p', prompt, '--model', model, '--system-prompt', brief,
    '--tools', 'Read,Write', '--disallowedTools', 'Edit(./state/**)', '--allowedTools', 'Read(./**)', ...WRITABLE.map((f) => `Edit(./${f})`), // file rules are Edit(path) for every file-writing tool (Write(path) is never matched); the only tools are still Read and Write
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--setting-sources', '', '--settings', NO_PLUGINS, '--strict-mcp-config', '--disable-slash-commands', '--safe-mode', '--restricted',
    '--output-format', format, ...(format === 'stream-json' ? ['--verbose'] : []), first ? '--session-id' : '--resume', sessionId];
}
export function sessionEnv(S) {
  const env = { HOME: S.home, CLAUDE_CONFIG_DIR: path.join(S.home, '.claude'), PATH: '/usr/bin:/bin', DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_ERROR_REPORTING: '1', DISABLE_TELEMETRY: '1' };
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) env.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN; // from `claude setup-token` (the subscription), never an API key
  return env;
}
// One turn: resolves with { code, ms, out (the CLI's JSON result), err, timedOut }. Never throws.
export function claudeTurn(S, { prompt, brief, model, sessionId, first, timeoutMs = 15 * 60 * 1000 }) {
  return new Promise((resolve) => {
    const t0 = Date.now(); let out = '', err = '', timedOut = false;
    const p = spawn(S.bin, sessionArgs({ prompt, brief, model, sessionId, first }), { cwd: S.cwd, env: sessionEnv(S), stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = setTimeout(() => { timedOut = true; p.kill('SIGTERM'); setTimeout(() => p.kill('SIGKILL'), 5000); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(kill); resolve({ code: -1, ms: Date.now() - t0, out: null, err: String(e.message), timedOut }); });
    p.on('exit', (code) => { clearTimeout(kill); let j = null; try { j = JSON.parse(out); } catch {} resolve({ code, ms: Date.now() - t0, out: j, raw: j ? null : out.slice(0, 2000), err: err.slice(0, 2000), timedOut }); });
  });
}
// What the CLI's JSON result says about usage and the model (logged per turn)
export function turnFacts(r) {
  const o = r.out || {}, usageLimit = /usage limit|rate limit|limit reached|resets? at/i.test(`${o.result || ''} ${r.err || ''}`);
  return { ok: r.code === 0 && !o.is_error, sessionId: o.session_id ?? null, models: o.modelUsage ? Object.keys(o.modelUsage) : null, usage: o.usage ?? null, costUsdListPrice: o.total_cost_usd ?? null, turns: o.num_turns ?? null, durationApiMs: o.duration_api_ms ?? null, unavailable: usageLimit, error: o.is_error ? String(o.result || '').slice(0, 500) : r.code ? (r.err || r.raw || `exit ${r.code}`).slice(0, 500) : null };
}
// Compactions (spec 15.3): Claude Code writes the session transcript under HOME/.claude/projects/; a compaction leaves a
// summary entry. Returns the ones not seen before, each with its timestamp and a hash of the summary.
export function newCompactions(S, seen = new Set()) {
  const found = []; const dir = path.join(S.home, '.claude', 'projects'); if (!fs.existsSync(dir)) return found;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith('.jsonl')) for (const line of fs.readFileSync(f, 'utf8').split('\n')) { if (!line) continue; let j; try { j = JSON.parse(line); } catch { continue; } if (j.isCompactSummary || j.type === 'summary' || j.subtype === 'compact_boundary') { const id = j.uuid || j.leafUuid || crypto.createHash('sha1').update(line).digest('hex'); if (seen.has(id)) continue; seen.add(id); found.push({ id, at: j.timestamp || null, hash: crypto.createHash('sha256').update(JSON.stringify(j.message ?? j.summary ?? j)).digest('hex') }); } } } };
  walk(dir); return found;
}
// After a turn: any file in the working folder other than state/ and the three it may write is removed and reported, and
// so is any file in state/ the world doesn't write there. The CLI lets a session write anywhere in its folder (the
// allow rules only skip the prompt), so a deny rule keeps it out of state/ and this check backs the rule up.
export const STATE_FILES = new Set(['rules.md', 'now.json', 'ledger.csv', 'history.csv', 'trades.jsonl', 'market.json', 'guide.json', 'league.json', 'decisions.jsonl', 'board.md', 'record.md', 'record.json']);
export function strayFiles(S) {
  const stray = [], rm = (f, name) => { fs.rmSync(f, { recursive: true, force: true }); stray.push(name); };
  for (const e of fs.readdirSync(S.cwd, { withFileTypes: true })) { if (e.name === 'state' || WRITABLE.includes(e.name)) continue; rm(path.join(S.cwd, e.name), e.name); }
  const st = path.join(S.cwd, 'state');
  if (fs.existsSync(st)) for (const e of fs.readdirSync(st, { withFileTypes: true })) {
    const f = path.join(st, e.name);
    if (e.isFile() && (STATE_FILES.has(e.name) || e.name.endsWith('.tmp'))) continue;
    if (e.isDirectory() && e.name === 'notebooks') { for (const n of fs.readdirSync(f, { withFileTypes: true })) if (!(n.isFile() && /^[A-Za-z0-9_-]+\.md$/.test(n.name))) rm(path.join(f, n.name), `state/notebooks/${n.name}`); continue; }
    rm(f, `state/${e.name}`);
  }
  return stray;
}
