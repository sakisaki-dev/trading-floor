// The plumbing test's first half (spec 10.2, 17.6 step 8): one real turn of the isolated session, to confirm the CLI
// flags on the installed CLI before any run. It USES THE OWNER'S SUBSCRIPTION (one short turn) and is never run by the
// test suite. It captures the session's effective context as the CLI reports it (the stream-json init event: tools, MCP
// servers, model, slash commands, memory and settings sources, plus a debug log of the request), checks that only the
// brief and the Read and Write tools are there, and writes context-dump.json with its SHA-256 for the fingerprint.
//   CLAUDE_CODE_OAUTH_TOKEN=... node gov/plumbing.mjs --session-root /Users/Shared/tf-gov/plumbing
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { spawnSync } from 'node:child_process';
import * as CS from './session.mjs'; import { BRIEFS } from './brief.mjs';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const root = opt('session-root'); if (!root) { console.error('usage: node gov/plumbing.mjs --session-root /Users/Shared/tf-gov/plumbing [--brief v1] [--model claude-haiku-5-5]'); process.exit(2); }
const S = CS.prepareSession(root), brief = BRIEFS[opt('brief', 'v1')], model = opt('model', CS.MODEL), id = crypto.randomUUID();
fs.writeFileSync(path.join(S.cwd, 'state', 'rules.md'), '# Rules\n\nThis is a plumbing test. Write {"wake": {"inWeeks": 1}} to ./controls.json (in your working folder, next to state/, not inside it) and nothing else.\n');
const debug = path.join(S.root, 'plumbing-debug.log');
const args = [...CS.sessionArgs({ prompt: 'Week 0. The state folder, ./state/, is up to date. ./state/rules.md says how everything works.', brief, model, sessionId: id, first: true, format: 'stream-json' }), '--debug-file', debug];
console.log(`claude ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}\n(cwd ${S.cwd}, HOME ${S.home})`);
const r = spawnSync(S.bin, args, { cwd: S.cwd, env: CS.sessionEnv(S), encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 1 << 26 });
const events = (r.stdout || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const init = events.find((e) => e.type === 'system' && e.subtype === 'init') || null, result = events.find((e) => e.type === 'result') || null;
const dbg = fs.existsSync(debug) ? fs.readFileSync(debug, 'utf8') : '';
// A built-in plugin the machine's managed (MDM) settings seat cannot be switched off from the command line; it is
// reported as 'look' and recorded, not failed. Any other plugin fails.
const policyPlugin = (p) => p.path === 'builtin' && new RegExp(`${p.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} seated outermost: this machine has managed settings`).test(dbg);
const stray = CS.strayFiles(S);
const checks = [
  ['the turn finished', r.status === 0 && result && !result.is_error],
  ['authenticated on the subscription (no API key in the environment)', !process.env.ANTHROPIC_API_KEY && result != null && !/auth|login|credential/i.test(result?.result || '')],
  ['tools are exactly Read and Write', init && JSON.stringify([...(init.tools || [])].sort()) === JSON.stringify(['Read', 'Write'])],
  ['no MCP servers', init && (init.mcp_servers || []).length === 0],
  ['no slash commands, skills or plugins', init && !(init.slash_commands || []).length && !(init.skills || []).length && (!(init.plugins || []).filter((p) => !policyPlugin(p)).length && ((init.plugins || []).length ? `only ${init.plugins.map((p) => p.name).join(', ')}, which this Mac's managed settings force on (recorded in context-dump.json)` : true))],
  [`the model resolves to ${model}`, init && String(init.model || '').startsWith(model)],
  ['no CLAUDE.md or memory in the request', !/CLAUDE\.md|auto-memory|MEMORY\.md/i.test(dbg)],
  ['the brief is the system prompt', dbg.includes(brief.slice(0, 60)) || 'not visible in the debug log: inspect plumbing-debug.log'],
  [`only controls.json was written${stray.length ? ` (it also wrote ${stray.join(', ')}; removed)` : ''}`, fs.readFileSync(path.join(S.cwd, 'controls.json'), 'utf8').includes('wake') && !stray.length],
];
const dump = { at: new Date().toISOString(), cli: { version: S.version, sha256: S.binSha256 }, args, init, result: result && { is_error: result.is_error, modelUsage: result.modelUsage, usage: result.usage, num_turns: result.num_turns }, debugSha256: crypto.createHash('sha256').update(dbg).digest('hex'), checks };
const text = JSON.stringify(dump, null, 1); fs.writeFileSync(path.join(S.root, 'context-dump.json'), text);
for (const [k, v] of checks) console.log(`${v === true ? 'ok  ' : v ? 'look' : 'FAIL'} ${k}${typeof v === 'string' ? `: ${v}` : ''}`);
console.log(`context-dump.json sha256 ${crypto.createHash('sha256').update(text).digest('hex')} (record it with the pre-registration)`);
process.exit(checks.every(([, v]) => v) ? 0 : 1);
