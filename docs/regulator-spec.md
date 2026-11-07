# Spec: the regulator (a Claude session with the world's dials)

Status: spec only, not built. It comes after the current round: the full league, maximum freedom, the tactic tracker
(merged), then the parallel speed-up, attention, bots scaled with cards and market-driven entry.

## 1. The idea

The bots keep doing what they do: neural networks trading cards, learning and evolving. On top of them, one Claude
session plays the regulator. It watches the whole world as it runs, and its only lever is the world's settings, never
what any bot does. Its brief is to cultivate a healthy economy. It has no guardrails: if the world breaks, it breaks.
It has to spot its own strategies failing and change them.

The owner's terms:

- one session per run;
- on the Claude Code subscription (the local `claude` CLI), not the paid API;
- full league;
- about 7,000 weeks, left running overnight;
- watched live on the page, with its commentary and notebook visible.

What we want to learn:

- what strategies the regulator tries, keeps and drops;
- how the bots adapt to it, for example whether they learn its patterns and trade around them;
- whether the economy ends up healthier than with fixed settings on the same seed.

## 2. Time: the world does not wait

Real regulators decide under time pressure. If the regulator can freeze the world while it thinks, it has unlimited
time to deliberate, and its record says nothing about how a regulator does when it must act in time. So **the world
runs on a clock, and the regulator's thinking time costs weeks.**

### The clock

- **The world runs at a fixed pace.** `weekSeconds` is the wall-clock seconds per simulated week, and it is a setting.
- **The engine computes each week as fast as it can, then waits out the rest of the week's seconds.** So the pace
  stays the same whether the regulator is thinking, asleep or stuck.
- **The regulator works alongside the world, never in its way.** It reads whatever state is current, and it never
  blocks the world.
- **A decision takes effect at the start of the next week after it arrives.** That week is logged as its effective
  week.
- **The lag is part of the result.** Lag = the effective week minus the week whose data it read. The page shows it.

### Choosing the pace

The pace sets how many weeks a typical deliberation costs. A Haiku turn takes about 10–40 seconds of reading,
thinking and writing.

| `weekSeconds` | 7,000 weeks takes | One 20-second decision costs | Comparable real-world rhythm |
|---|---|---|---|
| 2 s | 3.9 h | about 10 weeks | Slower than events; decisions land late |
| 4 s | 7.8 h | about 5 weeks | A monthly policy committee |
| 6 s | 11.7 h | about 3 weeks | Close to the action |

**Recommendation: `weekSeconds` = 4.** It fills a night (about 8 hours for 7,000 weeks). A decision costs about a month
of game time, and a 20-week season gives the regulator room for 2–6 meaningful moves.

The pace only works if the engine keeps up. A full-league week takes about 3.2–4.5 s today, and the number of cards
grows over a run, so the parallel speed-up has to land first. If the engine falls behind the clock, the run reports
how far behind it is and slows down. It never skips weeks.

### How often it decides

The regulator chooses its own cadence. Each turn ends by saying when to wake it:

- "in N weeks" (1–100), or
- "when a condition is met", from a small list of public triggers. Proposed list:
  - the Vault index moves more than x% in a week;
  - the bot population falls below N;
  - the Gini goes above x;
  - bot-to-bot trades fall below N a week;
  - fire sales go above N;
  - a Super Bowl or another league event happens.

Whichever comes first wakes it. Asleep costs nothing. Watching closely costs subscription usage and leaves it less
time to think per look.

## 3. What it can see and change

### It sees

These are public information, the same as a real regulator would see:

- every frame the page shows: prices, the Vault and marks indexes, the health board, the money ledger, trades,
  auctions, the order book summary, the population, wealth groups, credit, the tactic tracker and the league;
- the journal and the news;
- its own past decisions with their outcomes, and its notebook.

**It does not see:** hidden player values (`F`), bots' networks and private notes, or the random seed.

It reads files the driver writes. It is not handed a fixed briefing, so it can dig wherever it chooses:

- `state/now.json` holds the current week's summary, rewritten every week;
- `state/frames/` holds the full frames, a sliding window plus every 10th week;
- `state/health.json` and `state/tactics.json` hold the health board and the tactic tracker.

### It changes

It writes `controls.json`. Any legal value is accepted, with no policy limits: no maximum step and no minimum. The only
check is legality: the right type, a finite number, an option that exists. An illegal value comes back to it as an
error on its next turn, and the world keeps its old value.

**The dials it may change are world factors.** Proposed:

- **money:** allowance, living cost, lifestyle, royalty rate and funding;
- **costs:** fees, holding cost, wealth tax and its threshold;
- **credit:** loan limits, interest, margin call;
- **people:** the entry rate and its sensitivities, the quit chance;
- **supply:** packs released, outside collectors' budget, the liquidator's pace;
- **frictions:** cash shocks, loss rate, estate sale share;
- **market rules:** whether short selling is allowed, price limits.

**It may not touch:**

- the bots' networks, learning or evolution settings: that is the bots' nature, not the world;
- the league's football: that is real data;
- the seed, and settings that only measure or only change the page;
- what any individual bot does.

## 4. Its brief and its memory

### The brief

The system prompt is short and in the owner's words, published with the results:

- "cultivate a healthy economy";
- "you can only change the world's settings";
- "nobody will stop you; if it breaks, it breaks";
- "the world keeps moving while you think".

The definition of "healthy" is the one place this experiment steers results. Keep it to the owner's own words. The
owner may later run a second definition for comparison.

### The notebook

`notebook.md` is the regulator's own file, which it reads and rewrites as it goes. The prompt suggests it record, for
each move, what it changed, why, what it expects to see and by when, and later whether that happened. Nothing checks
how it uses the notebook. Its contents are part of the results.

### Commentary

Each turn returns one short public note, a line or two on what it sees and does. That is the commentary stream on the
page. The notebook is the longer private record.

### One session

The driver starts one Claude Code session, then resumes it (`claude -p --resume <id>`) each time the regulator wakes:

- model Haiku 5.5;
- tools limited to reading the state folder and writing `controls.json`, `notebook.md` and the wake-up line;
- no network and no shell.

Context grows over about 350–1,500 turns, and Claude Code's automatic compaction summarises it. The notebook carries
what matters across compactions. The exact CLI flags (resume, allowed tools, model) are checked against the installed
CLI when built.

### Subscription limits

If a usage window runs out, the regulator simply cannot act until it resets, and the world keeps running on the clock
with the last settings. That is part of "if it breaks, it breaks". The page shows "regulator unavailable until hh:mm".

## 5. The driver

`sandbox/regulate.mjs` (new), built on `run.mjs`, which already streams a run to the page with `--serve`:

1. Create the world: Realism, full league, seed, scaled bots.
2. Loop over the weeks:
   - step the engine;
   - write the state files;
   - apply any `controls.json` that arrived (log it with its arrival and effective weeks);
   - wake the regulator if its time or trigger has come and it is not already working;
   - wait out the rest of the week's seconds.
3. Run the regulator as a separate process, so a slow or failed turn never stalls the world.
4. Write the decisions to a log, `decisions.jsonl`: week read, week effective, settings changed (old and new), wake
   rule, commentary, notebook diff, turn duration, errors.
5. Save the run as today: frames plus the decision log. The page replays it exactly, with no model, by applying each
   decision at its logged effective week.

Determinism: a live run with a regulator can't be repeated live. Turn timing and the model's answers vary. It is
repeatable from its log, and the same seed with fixed settings is the comparison.

## 6. Watching it live: page changes

The page follows a regulated run through the existing `--serve` feed, plus a regulator feed. New pieces, designed with
the page redesign:

- **A regulator panel** at the top of the page:
  - its status (watching, thinking for N s, asleep until week W or trigger T, or unavailable);
  - the current week and pace;
  - how far the engine is behind the clock;
  - decisions so far, and the median lag in weeks.
- **A commentary stream:** each turn's public note, newest first, with the week it read, the week it took effect, and
  the settings it changed, shown as old → new.
- **The notebook,** shown live as rendered markdown, with what changed since the last turn highlighted.
- **A dials timeline:** every setting it has touched, plotted over the weeks, with a marker at each decision. The
  health board and the main price charts carry the same markers, so cause and effect line up by eye.
- **Strategy eras,** marked on the timeline: stretches where it held one approach. Recognising them from its notebook
  is an open question, so the first version shows only the decisions.
- **Replay** shows all of this in step with the frames.

## 7. What gets reported

For each regulated run against the same seed with fixed settings:

- the health board over time: prices against the football, Gini, population, bot-to-bot trades, bubbles, fire sales
  and money;
- the regulator's moves: how many, which dials, sizes, its lag, its strategy eras, the notebook's own account;
- **failures and recoveries:** where the world broke or nearly broke, and what it did next;
- **the bots' side:** tactics before and after its moves, and whether any tactic tracks the regulator's actions, for
  example buying ahead of an allowance rise;
- **cost:** turns, subscription windows used, and any time it was unavailable.

## 8. Build order

1. The parallel speed-up, so the engine keeps a 4-second pace with the full league.
2. The driver: clock, state files, controls, decision log, replay.
3. The regulator session: prompt, tools, wake rules, notebook.
4. The page: regulator panel, commentary, notebook, dials timeline, markers.
5. A short test run (200 weeks, `weekSeconds` 2) to check the plumbing and how a turn costs.
6. The overnight run.

## 9. Open choices for the owner

1. **The pace:** 4 seconds a week recommended.
2. **The brief's exact wording,** especially what "healthy" means.
3. **The dial list in section 3:** add or remove any. In particular, can it switch whole mechanisms on and off (short
   selling, credit), or only turn amounts?
4. **The wake-up triggers:** the proposed list, or "in N weeks" only.
5. **Model:** Haiku 5.5 to start. Later runs could compare Sonnet 5.5 or Opus 5.5 on the same seed.
6. **Comparison runs:** the same seed with fixed settings for every regulated run. A rule-based thermostat as a third
   arm?
