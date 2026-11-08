// Same seed, same run: runs a short Realism world twice in separate processes and checks that every week's frame
// hashes the same, and that no frame holds NaN or Infinity.
//   node tests/determinism.test.mjs [--weeks 6] [--seed 31761]
import { execFileSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const weeks = opt('weeks', '6'), seed = opt('seed', '31761');
const run = () => JSON.parse(execFileSync(process.execPath, [path.join(here, 'run_check.mjs'), '--weeks', weeks, '--seed', seed], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const a = run(), b = run();
let failed = 0; const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
check(a.hash === b.hash, `seed ${seed}, ${weeks} weeks: frame hashes match (${a.hash.slice(0, 12)})`);
check(a.nBad === 0 && b.nBad === 0, `no NaN or Infinity in any frame (${a.nBad}, ${b.nBad})`);
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
