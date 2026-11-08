# Spec: a simulated league that drives hidden value

For the agent building it in `sandbox/`. Read `docs/DEVLOG.md` and the top of `engine.mjs` first.

## Goal

Hidden value should come from simulated football, so it can spike and crash for real reasons: injuries, hot
streaks, breakout seasons, decline, retirement, awards, the Hall of Fame. Today it is fixed after the last real
season (Y88). With this change, each week every player plays a game, his stats change, and the site's own value
formula reprices him. Bots learn what happened from the news and trade on it.

## Hard rules (from the owner)

1. **Set factors, not behaviors.** Every rate in the simulation (injuries, swings in form, retirement, rookies,
   awards) is **measured from the real save** (`sandbox/data/timeline.json`, Y79–Y88). Nothing is hand-picked to make
   values go up or down. If something can't be measured, it is listed below as an assumption, exposed as a setting, and
   reported to the owner.
2. **Hidden value never reads prices.** No market price, order, trade or bot action may feed into a player's value.
   Value comes only from simulated stats and the site formula. The market reacts to value; value doesn't react to the
   market. (Otherwise price ÷ value measures nothing.)
3. **Switchable.** Add this as a new value model, `valueModel: 'league'`. Keep `'factors'` (values fixed past Y88),
   `'formula'` and `'ovrWalk'` working, so old saves and comparisons still run.
4. **Deterministic.** All randomness goes through `W.rand` / `W.gauss`. The same seed and settings give the same run.
5. **No AI**, no tuning toward expected outcomes, and no changes to the Retro Vault site or `data/y80/`.
6. Don't commit or push unless the owner asks.

## Data you have

| Source | What it gives |
|---|---|
| `sandbox/data/timeline.json` | 10 real season snapshots, Y79–Y88. Per player: `value, ovr, skill, grade, careerLegacy, careerTotals` (career totals: games and position stats, awards). 119 players in Y79, 203 in Y88 |
| `sandbox/data/library.json` | Each player's current stats, per-game rates, team, family, OVR, skill, Career Legacy |
| `sandbox/data/names.json` | Names for new players |
| `data/y80/formula/OVR.md`, `ovr.py` | Official OVR: League Score (production by position + award points), then percentile within position |
| `src/config/stats.ts` | Dominance and Career Legacy (`4·trueTalent + 4·dominance + 2·games`, award points) |
| `src/config/skillGrades.ts` | Skill rating |
| `src/utils/cardMarket.ts` `cardValue()` | Base card value from OVR, skill, Career Legacy, Hall of Fame (≥7,000), tier, pool scarcity |

Season-to-season differences in career totals give each player's real season lines: games played and stats per
season.

**What the data can't give you** (state these as assumptions, each a setting):
- **Weekly stats.** There are only season snapshots. Draw each game's stats around the player's per-game rate with
  count noise (Poisson for TDs, INTs, sacks, tackles, blocks; yards as a sum over attempts or catches), so that season
  totals have the measured season spread. Document the choice.
- **Injury spell lengths.** You only know games missed per season. Assume the missed games come as spells whose
  lengths are drawn from that season's shortfall (the simplest version: one spell starting at a random week).
- **Age.** There is none. Use **seasons played** as the career-stage variable everywhere age would go.

## Phase 0: measure first, then stop and report

Write `sandbox/measure_league.mjs`. It reads `timeline.json` and writes `sandbox/data/league_rates.json` with:

1. **Full season length**: games a full-time player logs in a season; the most common season line by position.
2. **Missed games**: distribution of (full season − games played) for players still active, by position and career
   stage.
3. **Form swings**: season-to-season change in per-game production (log ratio of League Score per game), by position
   and career stage (seasons 1–2, 3–5, 6–8, 9+). Keep the raw empirical draws, not a fitted curve.
4. **Rookies**: new players per season, their position mix, and their first-season production distribution.
5. **Retirement**: chance a player stops playing after a season, by career stage and by last season's production rank
   within his position.
6. **Awards**: how many of each award per season (MVP, OPOY, DPOY, ROTY, SB MVP, rings), and how award winners ranked
   in season production.
7. **Thin cells**: any rate built from fewer than about 20 observations. Merge stages or positions and say so.

**Report the table to the owner before building phases 1–3.** If the data is too thin for something, say so rather
than inventing it.

## Phase 1: the league (`sandbox/league.mjs`)

**State per player:** career totals, this season's totals, per-game rates, status (active / injured until week N /
retired), seasons played, team, rookie season.

**Calendar:** one season = `seasonWeeks` (20) sandbox weeks. Spread the measured full season across them. If the full
season is fewer than 20 games, some weeks are bye weeks, scheduled the same for everyone. Real seasons (Y79–Y88)
still replay as data when `startSeason: 'first'`. The league simulation takes over after the last real season.

**Each week**, for every active, healthy player:
1. Play one game: draw stats from his current per-game rates (see the assumption above) and add them to his season
   and career totals.
2. Injury roll, at the measured missed-games rate for his position and career stage. If injured, he is out for a
   spell drawn as described above.

**At season's end:**
1. **Form:** each player's per-game rates change by one draw from the measured swings for his position and career
   stage. This is the source of breakouts and declines.
2. **Awards:** given to that season's leaders, in the measured counts and ranks. Rings go to the Super Bowl winner's
   players. Pick the champion club weighted by the summed season production of its players (an assumption; a
   setting).
3. **Retirement:** at the measured rates. A retired player's totals freeze. His cards keep trading, and his value keeps
   moving only as the OVR percentile shifts around him (it's relative).
4. **Rookies:** the measured number arrive with drawn first-season rates, new names, a team, and **new card markets
   with print runs**. Reuse the existing rookie path in `nextSeason`: the `c.on === false` branch, pool size and
   `resetMarkets`. This is real new supply.
5. **Hall of Fame:** the site rule (Career Legacy ≥ 7,500 to induct; the value formula's 7,000 premium is unchanged).

## Phase 2: hidden value from the simulated stats

Recompute every player's value **weekly**, using the site's own formulas in a JS port (match `ovr.py`, `stats.ts`
and `cardValue` exactly; add a test that reproduces Y88's real values from Y88's real totals):

- League Score → OVR percentile within position, over the current active and retired pool.
- Skill, Dominance, Career Legacy → `cardValue()` → × each card market's rarity premium (as now).

**Owner decision D1 (value basis), implement both behind `valueBasis`:**
- `'career'`: OVR from **career** League Score, exactly as the site does. Values change smoothly: active careers
  accumulate and climb, retirees slowly fade as others pass them, awards and Hall of Fame give jumps. Injuries and
  slumps only slow the climb; they don't cause crashes.
- `'form'`: OVR from League Score over the last `formSeasons` seasons (default 2, counting this season to date),
  Career Legacy still career-long. This gives real spikes and crashes: a breakout season lifts OVR fast, an injury
  or slump drops it, a retiree's OVR falls away as his window empties.

Recommend `'form'` as the default (the owner asked for spikes and crashes). Keep `'career'` so the two can be compared.

`scarcity` (the copies-out supply factor) defaults to **0** with this model: supply affects **prices**, not value.

## Phase 3: news to the bots

Bots never see hidden value directly; research still gives a noisy estimate, as now. They see the public news:

- **Card network inputs** (new, appended to `CARD_IN`): weeks he is out injured (0 if healthy), this season's
  per-game production ÷ his career per-game production (form), won an award this season (0/1), retired (0/1),
  rookie (0/1).
- **Feed and log:** journal entries for injuries, returns, awards, retirements, rookies, Hall of Fame inductions and
  big games, so the page and saved runs show them. Add a weekly per-player line to the frames, compact, only for
  players who played.
- **Research notes** still read the true hidden value through the research error.

## Out of scope (owner decision)

No favorite teams for bots and no team changes: bots are never given a club, there is no "on my club" input,
outside collectors are not weighted by fans, and players keep their teams. (Phases 4 and 5 of the first draft are dropped.)

## Settings (all in the Rules panel, with "i" text, saved in exports)

`valueModel: 'league'`, `valueBasis: 'form' | 'career'`, `formSeasons: 2`, `injuries: true`, `rookies: true`,
`retirement: true`, `awards: true`, plus each data-gap assumption above.
Every rate is read from `league_rates.json`; there are no sliders for measured rates.

## Acceptance checks (headless, `sandbox/run.mjs` or a small script)

1. **Formula port:** Y88 real totals → values within 1 coin of the timeline's Y88 values for every player.
2. **No price feedback:** grep the value code: no reads of `.P`, orders, trades or bot state.
3. **Rates reproduce the data:** over 20 simulated seasons, the simulated distributions of missed games, form swings,
   rookies per season and retirements per season fall inside the measured ranges. This verifies the measurement,
   not an outcome to tune.
4. **Value moves both ways:** the share of player-seasons where value fell, and the largest one-season rises and
   drops, are reported (not tuned).
5. **Determinism:** two runs with the same seed give identical frames.
6. **Old models:** a `'factors'` run and the saved runs in `sandbox/runs/saves/` still load and run.
7. **Speed:** report seconds per week headless before and after. Weekly value recomputation must not make the page
   unusable.

## Report back to the owner

The phase 0 rate table (with thin cells flagged), the assumptions you made and their settings, and checks 1–7 with
numbers. Update `docs/DEVLOG.md` with the new model.
