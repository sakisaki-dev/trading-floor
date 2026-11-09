# Running the AI government

How to start the government runs of [regulator-spec.md](regulator-spec.md) on a Mac, with a real Claude session on your
subscription. Nothing in this repository starts a session on its own: every command below that names
`--government claude` or `gov/plumbing.mjs` uses your subscription, and only you run them.

## What is built

| Piece | File | Spec |
|---|---|---|
| The government's engine layer: dials and their legal ranges, the treasury's lines, pro rata, consumption and the own account, transfers, sales and exit taxes, rule-based dials, the board and placebo inputs, approval | `engine.mjs` (search "The government") | 4, 5, 6, 9, 11, 14 |
| The regulated preset: Realism with the pinned settings | `configs/regulated.json` | 9.5, 17.1 |
| The driver: clock, budget day, wake rules, decision log, replay, resume, elections, the live page | `regulate.mjs` | 7, 15, 18 |
| The government's view: the whitelist state writer | `gov/state.mjs` | 8 |
| The rules file, generated from the engine's own tables | `gov/rules.mjs` | 10.3 |
| The brief (v1 and neutral) and the turn message | `gov/brief.mjs` | 10.1 |
| The isolated Claude session | `gov/session.mjs` | 10.2, 15.2 |
| The plumbing test's first turn | `gov/plumbing.mjs` | 10.2, 17.6 step 8 |
| Scripted arms A0–A4 | `gov/arms.mjs` | 12.2 |
| A scripted stand-in for the session (tests) | `gov/stub_government.mjs` | |
| Gate A instrument checks | `tests/gov.test.mjs` | 17.3 |

## Without a model

```bash
node regulate.mjs --government stub --seed 1 --weeks 300 --pace 0.5 --serve 4322 --out runs/gov-stub --allow-dirty
node regulate.mjs --replay runs/gov-stub --out runs/gov-stub-replay          # must end without "differs"
node regulate.mjs --government A0 --seed 1 --weeks 2000 --pace 0 --out runs/a0-1   # an arm: A0, A1, A2, A3, A4
npm run test:gov
```

Open <http://localhost:4322> to watch: the page shows the Government panel (status, treasury, ledger, commentary, board,
notebook, dials). A finished run replays on the page with Load run → `runs/<id>/run.json`.

## The short way: `tools/gov.sh`

One launcher does every step below. It keeps the subscription token in the macOS Keychain (never in a file or the
shell history), finds the newest installed CLI, and prints where to watch.

```bash
tools/gov.sh check        # what's ready; starts nothing
tools/gov.sh token        # once: claude setup-token, then paste the token into the Keychain
tools/gov.sh plumbing     # the one-turn plumbing test (subscription)
tools/gov.sh plumbing200  # 200 weeks at 2 s a week, live at http://localhost:4322 (subscription)
tools/gov.sh replay200    # the replay check of that run (no session)
tools/gov.sh run1         # run 1, live (subscription); 7,000 weeks at 4 s, WEEKS= PACE= to override
tools/gov.sh resume       # after a crash
tools/gov.sh view         # opens the live view; prints the phone address on the same Wi-Fi
```

Run 1 is 7,000 weeks (the owner's choice, 2026-11-09). The full league can't hold 4 s a week past about week 900
(spec 24), so from then on the world runs at engine speed and the run takes well over a day.

## Before run 1, once

1. **Commit.** The driver refuses a `claude` run with uncommitted changes to the engine, driver, data, configs or page
   (the fingerprint records the commit).
2. **A token for the subscription.** The session runs with its own empty HOME, so it cannot read your login. Make a
   long-lived token once and keep it in your shell for the run (never an API key):

   ```bash
   CLI=~/.vscode/extensions/anthropic.claude-code-2.1.318-darwin-arm64/resources/native-binary/claude   # or: which claude
   "$CLI" setup-token
   export CLAUDE_CODE_OAUTH_TOKEN=...      # the token it prints
   export CLAUDE_CLI="$CLI"
   ```

3. **A folder outside your home.** `/Users/Shared/tf-gov/` works. The driver checks that no CLAUDE.md or `.claude`
   folder sits on its path, copies the CLI binary into it and records its SHA-256.

   ```bash
   sudo mkdir -p /Users/Shared/tf-gov && sudo chown "$USER" /Users/Shared/tf-gov
   ```

4. **The plumbing test** (one short turn, then 200 weeks at 2 s a week). It confirms the CLI flags on the installed CLI:
   only Read and Write, no MCP servers, no CLAUDE.md or memory, the brief as the system prompt, the model resolved.

   ```bash
   node gov/plumbing.mjs --session-root /Users/Shared/tf-gov/plumbing
   caffeinate -dimsu node regulate.mjs --government claude --session-root /Users/Shared/tf-gov/plumbing-200 \
     --seed 1 --weeks 200 --pace 2 --out runs/plumbing-200 --serve 4322
   node regulate.mjs --replay runs/plumbing-200 --out runs/plumbing-200-replay
   ```

   Read `context-dump.json` in the plumbing folder. A line marked `FAIL` means a flag in `gov/session.mjs` needs changing
   for this CLI version before anything else runs. Check `decisions.jsonl`: `facts.models` should name
   `claude-haiku-5-5`, and `facts.unavailable` shows how a used-up usage window looks (spec 5.4: if the CLI never reports
   remaining usage, usage windows are reported as outages).

5. **The rest of the rollout** (spec 17.6) is not code: the red-team pass (Gate C), pre-registration part 1, Gate B's
   world-response runs (the arms and sweeps run with `--government A0`…`A4` and `--pace 0`), pre-registration part 2
   with the opening dial vector (put it in `configs/regulated.json` under `government.dials`).

## Run 1

```bash
cd ~/Code/Research/trading-floor
caffeinate -dimsu node regulate.mjs --government claude --brief v1 --model claude-haiku-5-5 \
  --session-root /Users/Shared/tf-gov/g1 --seed 1 --weeks 7000 --pace 4 \
  --out runs/g1 --serve 4322
```

- Plugged in. The world sets up first (a few minutes with practice generations), then the budget-day turn runs with the
  clock stopped; after it the clock starts and never waits.
- Watch at <http://localhost:4322> (or the Mac's LAN address from a phone).
- `runs/g1/` (git-ignored) collects `meta.json` (the fingerprint), `decisions.jsonl`, `hashes.txt`, `frames.jsonl.gz`,
  `clock.jsonl` and `run.json` (saved every 250 weeks). The session's folder is `/Users/Shared/tf-gov/g1`; its
  transcript is under `home/.claude/projects/`.
- A watchdog that only reads: `while sleep 600; do tail -n 1 runs/g1/clock.jsonl >> runs/g1/watchdog.log; done`.
- **If the Mac restarts or the process dies:** `caffeinate -dimsu node regulate.mjs --resume runs/g1`. Resuming re-runs
  every logged week first (the decision log is the checkpoint; no world snapshot exists yet), checking each week's hash,
  then the same session carries on. Late in a run that replay takes hours. A turn that was in flight at the crash is
  lost and the session is woken at once; the gap is in `clock.jsonl`.
- **Run 2** (elections) adds `--elections 80:0.5` (term in weeks, approval threshold).
- **The neutral-brief arm** (G1n) is the same command with `--brief neutral`, another session root and fewer weeks.

## The pace

The clock is `--pace` seconds a week (4 for run 1). Each week the driver steps the engine, writes the state and waits
out the rest of the week's seconds. When a week takes longer than the pace, the next starts at once and the deficit is
logged in `clock.jsonl` (`behindMs`, `slowWeeks`) and shown on the page; a slow week is never skipped and never made up
by running faster later. So when the engine is slower than the pace, the world runs at engine speed, and a turn costs
the government fewer weeks than at 4 s. See regulator-spec.md section 24 for the measured times.
