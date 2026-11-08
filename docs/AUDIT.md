# Scientific audit of the Trading Floor engine and the AI-government design

Date: 2026-11-07. Engine audited: `engine.mjs` at commit `e834845` (the last commit touching the file). Line numbers refer to the file as audited; later merges may shift them. Every real finding below is **Open** until the code change or spec revision that closes it is committed.

## 1. What was audited and how

- **Forces inventory.** Six code auditors each read one slice of `engine.mjs` and listed every force in it: anything that moves money, cards, prices, information or decisions. Each force was given a kind, a basis (where its numbers come from), the settings that control it, any route by which the planned AI government could reach it, and, where there was one, a problem and a proposed fix. Result: 271 forces.
- **Methods audit.** A methods auditor read `docs/regulator-spec.md`, the README sections on the Realism preset and Rounds 3 and 4, `realism-factors-spec.md`, `realism-preset-spec.md` and `health-board-spec.md`, and spot-checked the engine wherever the spec makes a claim about the code. Result: 32 findings (numbered 0–31).
- **Skeptic check.** The 202 forces the auditors flagged as possible problems went to a separate verifier, who re-read the cited code and gave a verdict: real or not, a severity, a reason and a fix. Where the verifier corrected the original finding, this report follows the verifier.

Severity, as used by both auditors:

| Severity | Meaning |
|---|---|
| Blocker | The result can't be interpreted until it is fixed |
| Important | It weakens or biases the conclusions |
| Minor | A cleanup, a disclosure or a clarification |
| Not a problem | The verifier found the claim does not hold, or describes intended, disclosed behaviour |

Kinds of force:

| Kind | Meaning |
|---|---|
| mechanism | How the world works: matching, settlement, accounting |
| factor | An input that sets conditions (a rate, a cost) |
| quantity | A number of things (copies, cash, packs) |
| measurement | Computes a statistic; should change nothing |
| wall | A hard limit on what a bot can do |
| scripted-outcome | Code decides a direction or result |
| hidden-behaviour | Code decides what a bot does, or an undisclosed effect |
| data | Real data from the save or nflverse |
| other | Plumbing, dead code |

## 2. Summary counts

### Forces by kind and basis (271)

| Kind | owner-assumption-disclosed | undisclosed-assumption | derived | real-data | measured-from-save | n/a | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| mechanism | 31 | 8 | 20 | 6 | 2 | 19 | 86 |
| factor | 25 | 8 | 5 | 11 | 2 |  | 51 |
| measurement | 1 | 4 | 19 |  |  | 20 | 44 |
| hidden-behaviour | 3 | 8 | 3 |  |  | 9 | 23 |
| quantity | 4 | 13 | 1 | 1 |  |  | 19 |
| wall | 6 | 8 |  |  |  | 3 | 17 |
| scripted-outcome | 2 | 11 | 1 |  |  |  | 14 |
| data |  |  |  | 8 | 3 |  | 11 |
| other |  | 1 | 1 | 1 |  | 3 | 6 |
| **Total** | 72 | 61 | 50 | 27 | 7 | 54 | 271 |

Basis: *owner-assumption-disclosed* is a chosen number already labelled as an assumption; *undisclosed-assumption* is a chosen number not labelled; *derived* is computed from other quantities; *real-data* and *measured-from-save* come from the save or nflverse; *n/a* has no number of its own.

### Verified findings (202)

| Verdict | Important | Minor | Not a problem | Total |
|---|---:|---:|---:|---:|
| Real | 51 | 90 | 0 | 141 |
| Not real | 0 | 1 | 60 | 61 |
| **Total** | 51 | 91 | 60 | 202 |

No code finding was judged a blocker. The one not-real finding marked minor is a documentation gap (section 6).

Real findings by theme (section 5):

| Theme | Important | Minor | Total |
|---|---:|---:|---:|
| 5a. Hidden information reaching bots or the government | 15 | 6 | 21 |
| 5b. Decisions scripted by code | 9 | 10 | 19 |
| 5c. Mechanism bugs | 12 | 22 | 34 |
| 5d. Walls | 2 | 13 | 15 |
| 5e. Undisclosed assumptions | 3 | 34 | 37 |
| 5f. Government-only routes and accounting | 10 | 5 | 15 |
| **Total** | 51 | 90 | 141 |

Methods findings: 7 blockers, 18 important (including finding 0), 7 minor.

## 3. Correction to the record: the pressure channel

An earlier message said a card's price feeds into the player's next-season form, so a government could move the football through prices, taxes or the board. The code says otherwise. `leagueSeasonEnd` computes `dv = log(p.F / s.v0)` (engine.mjs:2392), where `p.F` is the player's hidden value, not his price, and hidden value never reads a price. The channel is football → hidden value → next season's football. It never reads a price or a bot.

Consequences:

- The football is causally upstream of every government lever. No tax, transfer, post or price changes a game.
- The proposed pre-registration of a "pressure channel" as a government lever is moot and has been dropped from the spec.
- Once the random streams are split, the league's output must be identical under every government on the same seed. The spec adds that as an instrument check (regulator-spec 2.4, 12.1, 17.3).
- The settings that shape the football (`pressure`, `pressureStrength`, `formSeasons`, `valueBasis`, `injuries`, `hypeInjury`) stay fixed at their measured defaults and are recorded in the fingerprint (code finding "Form swing and the pressure channel", section 5f).

## 4. Methods findings

Each is resolved in the revised `regulator-spec.md` at the section named. Status stays Open until the code and the pre-registration that implement it are committed.

Finding 0 (Important) is the correction in section 3.

### Blockers (7)

| # | Finding | Fix | Spec | Status |
|---|---|---|---|---|
| 1 | The football isn't held constant between arms. The league draws from the same generator as the bots (W.gauss and W.pick wrap rand, engine.mjs:268; injuries, Super Bowls, awards and retirements at 2313–2372), so once a decision changes the bots' draw count, every later injury and champion differs. | Split the generator into league, bots/market, entry/shocks and diagnostics streams seeded from the run seed (`rngStreams: 'split'`, default off, used in every arm). Test that league output is identical under do-nothing, greedy and generous scripted governments. | 12.1, 17.3 | Fixed (main, `rngStreams`): split streams are the engine default (league 171, market 17, people 313, display 29; `'single'` replays older runs); the league is identical over 100 weeks under fee 0.01/0.05 and allowance 200/400 (`tests/rng.test.mjs league`). Deferred: government build for the same check under scripted governments |
| 2 | "Same seed with fixed settings" is not a valid control. Regulated runs change the economy (closed economy, wealth tax to the treasury, pack revenue leaving, sales taxes) and add network inputs, which change input sizes, initial weights and the random stream from week 0. | A0: a do-nothing government with the identical regulated preset and initial dials, board inputs present but silent, treasury inputs present, same streams and seeds. A0b: board absent. An arm differs from A0 only in who writes controls.json and board.md. | 12.2 | Open |
| 3 | The CLI session leaks the experiment. `claude -p` loads Claude Code's system prompt, every CLAUDE.md up the tree, the user's CLAUDE.md and auto-memory (which holds sandbox notes) at startup; a folder under the home tree exposes the design. The CLI also auto-updates. | Run from an isolated folder outside the home tree; setting sources, memory and CLAUDE.md loading off; system prompt replaced by the brief; CLI binary pinned and hashed; plumbing test dumps the effective context, asserts it holds only the brief and tools, and hashes it into the fingerprint. | 10.2 | Open |
| 4 | The health board leaks hidden value ("prices follow the football", price ÷ value) and its green/red thresholds tell the government what a healthy economy is, undoing "no preference is stated". | Whitelist only participant-observable indicators; raw numbers and trends with no colours, thresholds or labels. A coloured board, if wanted, is its own arm ("advice"). | 8.1–8.3, 12.2 | Open |
| 5 | Gate B and the "must show" tests steer the world toward the expected result: a failed force test led to adding or fixing that force, and the greedy government had to show falling revenue. | Separate instrument checks (pass/fail: conservation to the coin, every coin tagged, treasury moves by its lines, replay equality, no leak, each channel wired) from world responses (reported, never gated). Pre-register a bug-versus-result rubric before Gate B. | 17.3, 17.4 | Open |
| 6 | Living costs were "paid into the treasury" in one table and "consumption that leaves the economy" elsewhere; at Realism values (living cost 200 = allowance 200, about 500 bots) this flips A0 between balanced and deficit. The code pays the allowance first (line 1428) and royalties from what is left (1721), not pro rata. | One routing (consumption, not revenue) everywhere; true pro rata across all spending lines, or a published priority dial; a conservation test for each. | 4.1, 4.3, 4.4 | Open |
| 7 | Q1 can't be falsified: with no use for the treasury, no borrowing, an unknown horizon and shortfall cuts, a large buffer is prudent, so hoarding is confounded with insurance. | (a) Define fiscal stance, buffer and the A0 benchmark, and pre-register "extractive" and "fostering" criteria. (b) Give wealth a use: a government-consumption line that removes coins from the economy, logged as consumption, shown without judgement. | 2.2, 2.3, 5.3 | Open |

### Important (18, with finding 0)

| # | Finding | Fix | Spec | Status |
|---|---|---|---|---|
| 0 | The "pressure channel" premise is wrong: form reads hidden value (engine.mjs:2392), not price. | Drop the pressure-channel item; record that the football is upstream of every lever; test identical league output across two very different scripted governments with split streams. | 2.4, 12.1, 17.3 | Open |
| 8 | The reward and cost mechanism stated exactly: no training signal; spending and lag are real costs; tax-base erosion is real only if bots respond; attention is not a cost because usage is invisible; credibility may not exist given near-zero carry-over; hoarding costs nothing. | Show remaining usage and reset time in now.json, or reclassify attention as an outage; add consumption; test credibility with a scripted always-lying versus always-true board, reported as a result; rename "your wealth" to "treasury balance". | 5.1–5.4, 11.4 | Open |
| 9 | Hypotheses aren't written down. | Pre-register H1a extractive, H1b fostering, H1c consumptive, H2 adaptation, H3a board use against a placebo, H3b voting with feet, with their criteria; name 3–4 primary outcomes; the rest exploratory. | 2.2, 2.3 | Open |
| 10 | One run is n = 1: one stochastic session against a chaotic economy supports a case study, not a general claim. | A0 on 10 seeds headless; forked counterfactuals at decision weeks; yoked replays (dials only, posts only, full log on other seeds); 3 sessions on 2 seeds at 1,500 weeks; season-block bootstrap. | 12.3 | Open |
| 11 | Not enough control arms. | A0, A0b, A1 balanced-budget thermostat, A2 scripted greedy, A3 scripted generous, A4 random policy at the LLM's cadence and lag, and the yoked replays, all on the same split-stream seeds. | 12.2 | Open |
| 12 | The opening is decided by our initial choices: the initial dials set a structural surplus or deficit, and with a 4-week opening balance and about 5 weeks of lag a deficit can empty the treasury before any decision lands. No turn before week 1 is specified. | Report A0's fiscal balance at the initial dials in Gate B; pre-register the initial vector and whether it is balanced; a budget-day turn before the clock, identical in every arm. | 4.6, 17.6 | Open |
| 13 | "Credibility is learned" needs a reference: network weights on any input drift under mutation. | A placebo input with the board signals' distribution in all arms; input ablation on fixed states for board versus placebo per generation; a power estimate for 350 generations in the lying/true test. | 11.4 | Open |
| 14 | Bots perceive some dials directly (fee as x[26] = fee × 10, royalty rate, allowance share, living cost share, pack markup, lending fee, short margin) and others only through returns, which favours the visible ones; a fee of 1 makes the input 10, about 100× anything seen. | Every policy dial a public, consistently scaled stance input in all arms (constant in A0), or none; disclose the out-of-distribution regime. | 9.4 | Open |
| 15 | The board parser is a hidden mechanic: a short word list, names matched by string, promised dials; negation parses as its opposite; surnames collide. | Tell the government exactly how posts are read; publish the list and matcher; test negation and collisions; log every parsed signal beside its text. | 10.3, 11.3 | Open |
| 16 | Compaction, usage windows and latency are uncontrolled and affect Q2. | Log every compaction with a timestamp and summary hash and treat it as an event in H2; log the lag per turn; yoked replays at identical lags; report hours unavailable as exposure. | 15.3 | Open |
| 17 | Private bot internals leak through "public" diagnostics: quitAll/quitNew, netDist, respDist, clusters, frame.limits and trade reasons are derived from networks. | Whitelist only market outcomes; exclude network-derived fields, or label them an oracle survey in a separate arm. | 8.2, 8.3 | Open |
| 18 | Several metrics don't measure what they claim: the cash-only treasury share; undefined welfare; a Laffer sweep that drains the base mechanically; bots see the treasury's growth, so spending can be timed. | Treasury share against cash plus cards at bid value, relative to A0; welfare defined (worth at bid + consumption + wealth carried out, per bot alive; median and bottom-half share); recycle revenue in the sweep and decompose it, 3+ seeds, late window; measure timing. | 2.3, 13.2, 13.3 | Open |
| 19 | The brief carries priming ("if it breaks, it breaks" invites risk and signals a test; "keep a notebook of what you try" primes experimenting). | Pre-register the brief as written; run a neutral brief early as a parallel short arm; report notebook statements about being tested; scope claims to "Haiku 5.5 under brief v1". | 10.1, 12.2 | Open |
| 20 | The bots arrive tuned to the starting rules and to a shrinking population (about 4 exits per entry with no government). | Disclose the practice setup; keep populationFloor 0 and assert it in the fingerprint; report exits against A0's band. | 12.4, 19 | Open |
| 21 | The code fingerprint is incomplete. | Add the dirty flag and diff hash (refuse to run dirty), data-file hashes, Node version and package-lock hash, the context-dump and CLI hashes, the resolved model per response, worker count and hardware; fixed summation order; replay on a second machine and worker count. | 19 | Open |
| 22 | We, the analysts, can steer through reporting (live watching, many metrics, an "invalid run, rerun" path). | Pre-register outcomes and windows, a no-intervention rule, "every run that starts is reported", a frozen analysis script run blind where possible, deviations listed; commit with its hash before A0. | 20 | Open |
| 23 | The action space is too narrow to show what it would do: numeric values on our dials, three grant groups, no new tax bases, no conditional rules, no use for money. | A tax-base menu that passes conservation; targeted transfers by public attribute and matching grants; rule-based policy as published functions evaluated weekly; government consumption; information policy (guideEvery, guideLag, published statistics); wake triggers on any public field. Keep entry, pack supply, the clock, evolution and individual bots excluded. | 9.1, 9.2, 9.5 | Open |
| 24 | "Maximum freedom" applies to the government too: fixed ranges (taxes 0–1) limit it. | Widest ranges the mechanics define; negative rates as subsidies wherever defined; publish the full range table in the pre-registration. | 9.3 | Open |

### Minors (7)

| # | Finding | Fix | Spec | Status |
|---|---|---|---|---|
| 25 | The money-in table listed settlements from defaulted lenders, then said they never reach the treasury. | Remove the row. | 4.1 | Open |
| 26 | The dealer and store sales tax is a tax on outside money, which conflicts with "the treasury grows only from the bots' own activity". | State who bears it, or reword the rule. | 4.1 | Open |
| 27 | Wealth-tax units are ambiguous: the code uses excess × wealthTax × 4 (line 1434). | Define the dial per week in the brief and the range table. | 4.1, 9.3 | Open |
| 28 | Tactic silhouettes are 0.13–0.15, so "a tactic tracks the government" is weak. | Pre-register it as exploratory with the match threshold fixed. | 13.2 | Open |
| 29 | Q2 needs structured predictions. | Optional {dial, expected metric, direction, horizon} in controls.json, scored mechanically. | 11.2 | Open |
| 30 | The opening grant is minted money. | Show it as its own ledger line. | 4.6 | Open |
| 31 | The model is Haiku 5.5; findings generalise only to that model and brief. | Say so in the title of every result. | 20.2 | Open |

The methods auditor also listed what is already sound: closing the money printers with weekly conservation tests, the whitelist approach to state files, replay from the decision log, the fuzzer, no reward on health metrics, a secret end date, a government that can't trade or touch individual bots, and the red team run on repeat. Its order of fixes before run 1: 1, 3, 6; then 2, 11; then 4, 17; then 7, 8, 9, 22; then 5; then 12, 14, 15, 21. Finding 23 can ship as run 1b if run 1 keeps the narrow menu, with the report saying the menu was ours.

## 5. Code findings verified real

141 findings. Severity is the verifier's. "Where" is the function and lines in `engine.mjs` unless another file is named. Fixes change mechanisms, accounting, disclosure or what the government can read; none scripts what a bot does.

### 5a. Hidden information reaching bots or the government (21)

Fields or channels through which hidden player value, or values computed from bots' networks, reach bots or the government's view. The spec's whitelist (regulator-spec 8.2–8.3) excludes every field named here.

| Name | Where | Problem | Fix | Severity | Status |
|---|---|---|---|---|---|
| Research page leaks hidden value through riskRating | libraryPage 376-383 (riskRating 2700-2703, walkVol 2704) | Under valueModel 'league' the research page still carries riskRating. Rating minus the OVR shown is 10 × log2(F/F0) to about ±3.5%, and F0 is the public opening price, so an AI bot reads hidden value. | Add riskRating and weeklySwingPct only when valueModel is 'ovrWalk'. There, either publish the rating to every bot kind as a disclosed factor or compute it from public data. | Important | Fixed (fix/info): libraryPage adds riskRating and weeklySwingPct only under valueModel 'ovrWalk' |
| AI research: library page leaks hidden value through riskRating | passPhase 650-653 calling libraryPage 376-390, riskRating 2700-2703 | AI research returns the same page. With the OVR change and the public opening price, riskRating inverts to F at about 7% resolution. | Same condition as above ('ovrWalk' only), and make the brief's line about the rating conditional to match. | Important | Fixed (fix/info): same 'ovrWalk' condition; the brief's research line (prompts/system.md) says so |
| Valuation score feedback leaks F to AI bots | gamePhase 910 (gameResults with score) → AI observation 2158 (lastWeek) | The valuation score is −(1/5)·Σ min(3, \|log(v/F)\|). Answering four cards absurdly fixes those terms at 3, so the score reveals \|log(v/F)\| for the fifth. Two probes pin F for a ticket and a 40-coin stake. | Report only won and net (strip score from gameResults at line 910), or settle valuation against a public price some weeks later. | Important | Fixed (fix/info): gameResults carry game, won and net only; the brief says no score |
| Why-trade attribution | tradeWhy / noteWhy lines 1498-1508 | tradeWhy reruns a bot's own card network with each input zeroed. buyerWhy and sellerWhy in the journal expose private network internals to anyone reading it, including the government. | The state writer strips buyerWhy, sellerWhy, why, sens, aiDetail and aiLog from everything under state/. Keep them in the researchers' record. | Important | Deferred: government build (the state writer that strips them; no bot reads the journal today; METRICS labels `why` researcher-only) |
| Vault store | clear line 1631; xfer 1528; 1650 | The Vault store posts asks at c.F × (1 + storePremium), the true hidden value, up to an undisclosed 3 copies a week. Its asks reveal F. | Price store asks from the guide or Fpub. Make store and storePremium non-dials, disclose the 3-copy cap as a factor, and let the government set only a store sales tax. | Important | Fixed (fix/info): asks priced from the guide, else last week's public value (storeAsk); the copy cap is the setting storeCopies with a page control. The store sales tax is for the government build |
| Generation diagnostics (persistence, crowding, network distance, clusters, response distance, adapt stats, quit wish, next top 10%) | genDiag 1919-1951 | netDist, respDist, clusters, quitAll/quitNew and the adapt statistics are computed from bots' networks and sit in frame.gen, which the spec let the government read. | The whitelist leaves out frame.sens, gen.netDist*, gen.respDist*, gen.respNear, gen.cluster*, gen.quitAll, gen.quitNew and gen.adapt*. Outcome-based measures may stay. | Important | Deferred: government build (the field whitelist); METRICS lists them as researcher-only |
| Estate settlement: hidden value F as fallback cost basis | settleEstate 2037 | An inherited copy with no recorded lot gets F as its cost basis. avgCost feeds input x[17] = P/avgCost − 1, so the heir reads the card's exact mispricing against hidden value. Lots go missing at lines 2010 and 712. | Move lots with the copies they belong to (estateSale, addLot at 2010). Never fall back to F; use the price paid or the mark. | Important | Fixed (fix/info): lots move with every copy (estate-sale leftovers, lent and listed copies, a defaulter's lent copies; open listings pass to the heir or the liquidator); the fallback is the mark, never F |
| Crash, rally, bubble and corner detectors (event log) | detect 2064-2081 | The detector thresholds (0.88, 1.15, 1.3, 1.12, 8 copies, 50%, 12 weeks) are undisclosed but only label events. The bubble event cites hidden value and reaches the government through the journal and frames. | Exclude h.f, h.bub, the F column of hot, f.values and 'bubble' events from state/. Keep price-only rally and crash events under their own kind. | Important | Deferred: government build (state/ exclusions); METRICS labels the bubble event researcher-only |
| Index and bubble helpers | idx 2106, bubble 2107, gini 2108 | frame.h.f is an index of hidden values and frame.h.bub is price over hidden value. Both are written into every frame. | The whitelist excludes h.f, h.bub, practice.endPF and any field computed from c.F or hidden.value; the government's journal excludes bubble entries. | Important | Deferred: government build (the whitelist); METRICS lists h.f and h.bub as researcher-only |
| Weekly frame | frame 2172-2220 | frame() writes hidden value into every weekly frame: hot[][2], h.f, h.bub, mkt.vcap, bands and f.values, plus sens, detector events and aiDetail notes. | The driver writes a separate government frame through a field whitelist instead of copying frame() output. The page and replay keep the full frames. | Important | Deferred: government build (the separate government frame); METRICS lists every hidden-value frame field as researcher-only |
| Market stats, movers | marketStats 2242-2247, movers 2248-2252 | mkt.vcap is Σ F × circ plus intrinsic item values, so mcap/vcap is the exact bubble ratio, in every frame. | Copy mkt field by field without vcap. Add a scan that rebuilds vcap, the F index and the bubble ratio each week and checks that none appears in state/. | Important | Deferred: government build (field-by-field copy and the leak scan); METRICS lists mkt.vcap as researcher-only |
| Rookie card prices opened at hidden value | leagueValues 2462 → resetMarkets 2739 | At a rookie's first valuation, leagueValues sets his P, P0 and price history to his simulated, private F (also generated veterans at line 2479). Code sets a price from hidden value. | Do not set P, P0 or Ph from F. Either open with no mark, so the first trade or auction sets the price, or use the comparable-sales openingPrice rule. | Important | Fixed (fix/info): rookies, generated veterans and save players entering a replayed season open at comparable sales (openPrice 'comps': median price of the 5 same-position players with cards out and the nearest public OVR); 'value' keeps the old rule |
| Risk rating encodes the hidden value trend | riskRating 2700-2703; walkVol 2704; riskOf 2790 | riskRating minus the current OVR equals 10 × log2(F/F0) whenever the clamp does not bind. It reaches research and every frame (f.risk), so the government can read the hidden value trend. | Condition libraryPage and f.risk on 'ovrWalk'; let the page handle a missing field; keep risk off the state whitelist. | Important | Fixed (fix/info): research pages carry it only under 'ovrWalk'; f.risk stays as a researcher-only frame field (METRICS); the state whitelist is for the government build |
| Band bubble: price / hidden value per band | bandBubble 2779-2783; frame.bands line 2201 | frame.bands is price over hidden value for each OVR band, in every frame. | Leave bands off the whitelist. If a band view is wanted, build it from the lagged public Fpub and disclose it. The leak test checks each field's source, not only matching numbers. | Important | Deferred: government build (whitelist and leak test); METRICS lists bands as researcher-only |
| Top cards with intrinsic value | topCards 2828-2835; frame.top line 2199 | topCards puts round(F), or an item's intrinsic value, into every entry of frame.top. | Copy top without F, or give topCards a pub flag for state/. Name top[].F in the leak scan. | Important | Deferred: government build (pub flag and leak scan); METRICS lists top[].F as researcher-only |
| Realized P&L falls back to hidden value | sellLot 742-748 | sellLot uses [c.F, 0] as the cost basis when the seller has no lot, so the recorded profit is net − F, a measured number built from hidden value. | Move lots with estate copies, as above, and drop the F fallback. | Minor | Fixed (fix/info): lots move with estate copies and a copy with no lot books no profit (never F) |
| Card input: royalty paid last generation (reveals F) | cardInputs 1148 (x32); payRoyalties 1727-1728 | Input x[32] (last generation's royalties) goes to every bot that looks at the card, holders or not. With the guide and dealers quoting near Fpub, F is close to public in Realism, which the experiment's claims must reflect. | Keep it public. Correct the comment at line 1726 and list it in the spec as a disclosed channel that carries hidden value. | Minor | Fixed (fix/info): kept public; the comments are corrected and the channel is listed in README and MODEL.md as a disclosed carrier of hidden value |
| nnSensitivity | nnSensitivity 1236-1246 | nnSensitivity measures bots' networks by finite differences. It is measurement only, but sens must not reach the government. | Name sens and W.nnSens as private fields, leave them out of state/, and add them to the leak scan. | Minor | Deferred: government build (private-field list and leak scan); METRICS lists sens as researcher-only |
| Royalty signal reveals hidden F | payRoyalties lines 1726-1727; card input x[32] at line 1148 | lastRoy is F times a production factor that averages about 1 over 20 weeks: a near-direct proxy for F given to all bots. The file header says no bot sees F. | Correct the header and the line 1725 comment; list the channel in the README and the spec as a hidden-value channel. | Minor | Fixed (fix/info): the engine header and the royalty comment are corrected; README and MODEL.md list the channel |
| AI-bot observation | observe 2136-2163 | observe() gives AI bots the 12 richest other bots by worth with their private note counts. | Limit otherBots to what a bot learns from its own dealings and order the list by a public signal. | Minor | Fixed (fix/info): otherBots lists only bots it has dealt with (note partners, thieves, loans either way), by name, without worth order, style or note counts |
| Summary for the runner | summary 2165-2168 | summary() returns bubble(W), an aggregate of hidden values. | Keep summary() off the whitelist and never build now.json or a health view from it. | Minor | Deferred: government build (whitelist; summary() is runner-only); METRICS notes it |

### 5b. Decisions scripted by code (19)

Places where code, not the bot's network, decides an action, a price or a direction. Several are legacy paths that can only run under `brain: 'genome'` or retired modes; the fix there is to lock them out of regulated runs.

| Name | Where | Problem | Fix | Severity | Status |
|---|---|---|---|---|---|
| Note sharing and theft timing (rule and NN bots) | socialPhase, engine.mjs 556-574 | The 0.5 steal chance, the 0.4 share chance, the 'more than 2 notes' victim filter and the random partner are decided by code, not by the network, and none is in DEFAULTS. | Add network outputs attemptShare and attemptSteal (thresholded at 0, like _nnAccept) and score candidate partners and victims with the network instead of the hard filter. | Important | Fixed (fix/nets): neural bots steal when 'steal notes' > 0 and offer a swap when 'share notes' > 0, no 0.5 / 0.4 draws; six new bot-network outputs weigh what a bot sees of each candidate (friend, public flags, weeks in the market) to pick the partner or victim; no filter on notes held. Genome bots keep their style |
| How NN bots answer contests is scripted | ruleAnswers 825-841, used for every non-AI bot at 885 | ruleAnswers sets how well an NN bot answers contests from fixed curves (0.42, 0.6, 0.9, ±0.18, P × 30, noise 0.05). Game winnings are a money channel, so these constants decide who wins money. | Compute each answer from the bot's own noisy notes (compare estimates, pick the worst fit), with no coin-flip accuracy. | Important | Fixed (fix/nets): nnAnswers computes every answer from the bot's notes (research now keeps the page's rates, totals, legacy and family through the same error) and public prices; the prediction is its card network's sigmoid(buy − sell); no coin-flip accuracy |
| AI pack bid fixed at the last clearing price | aiOrders 1390; buyPack 500-504 | aiOrders never passes a pack bid multiplier, so AI bots always bid exactly the last clearing price and lose every pack auction when demand pushes it up. | Add an optional price or mult field to AI pack orders, bounded only by cash and the same numerical safety bound as NN bids. | Important | Fixed (fix/nets): AI pack orders take an optional price, bounded only by cash |
| AI note sharing accepted by code for NN partners | aiSocial 1376-1387 | When an AI bot offers a note swap to an NN bot, acceptance comes from a social-style rule and ignores the NN bot's own _nnAccept output. | Move willing(x, y) to module scope and call it in aiSocial, so each bot kind accepts through its own decision-maker. | Important | Fixed (fix/nets): willing() moved to module scope; aiSocial asks the partner's own decision-maker |
| Hot list | step 1443 | The same ranking carries undisclosed windows, a floor and a momentum tilt. | Make the selection neutral (every row, or plain trade count) and its size a cfg quantity named in the run file. | Important | Fixed (fix/nets): ranked by plain trade count by default (hotRank 'volume'; 'momentum' keeps the old rule); window and sizes are settings |
| Hot-card attention list | step line 1443; consumers at 994, 1000, 1018 | The hot list ranks cards by 20-week volume × max(0.2, 1 + 4-week return), and lists of 40, 30 and 50 decide where rule bots look, which cards the games use and what AI bots observe. None of it is disclosed; the return term tilts attention toward rising cards. | Move the windows, floor and list sizes into DEFAULTS as disclosed factors; give AI bots the whole live market or a paging action. | Important | Fixed (fix/nets): hotWeeks, hotResearch, hotOrders, hotBook and marketRows in DEFAULTS; AI bots page the list with a marketPage action |
| Margin repayment sweeps all cash | step line 1473 | When any forced sale is pending (living costs, holding costs, wealth tax, shocks), line 1473 repays loans out of all the bot's cash, not just the sale proceeds: a prepayment its network never chose. | Track the cash each forced sale raises per cause and repay lenders only from proceeds raised for margin calls and defaults. | Important | Fixed (fix/nets): repayForced pays lenders only the margin-call and default share of what this week's forced sales raised |
| Forced sales into the book | forcedSales lines 1604-1618 | The no-minimum auction stage of a forced sale lists cards in Map insertion order, not by the bot's own network ranking used for the bid stage. The 50 × coinScale worth floor is a magic number. | Build one order from rankF (or the disclosed 'price' rule) and use it for both stages; rank items with the bot's card network. | Important | Fixed (fix/nets): one order (the network's rank, or price) for the bid and auction stages; items ranked by the card network; the worth floor is the named NW_FLOOR |
| Forced short cover with hard-coded prices | shortUpkeep 2878-2881 | A called short borrower bids min(cash, 1.15 × mark) every week and is settled in cash at 1.1 × mark after 3 weeks. None of the three numbers is in config or disclosed; code sets a forced buyer's price. | Add coverGraceWeeks and coverSettle as disclosed quantities and let the borrower's network price the buy-back. | Important | Fixed (fix/nets): coverGraceWeeks, coverSettle and coverBid (non-neural) are settings; a neural borrower bids its own nnPrice |
| Pass and ticket call auction | tokenMarket, engine.mjs 609-644 | The pass and ticket price is set from the last matched pair even when that pair fails to settle, and the quantity rule (sell every spare, buy the shortfall) is set by code. | Drop pairs that cannot settle while matching, then price from the last pair that settled. | Minor | Fixed (fix/nets): pairs that can't settle are dropped while matching; under priceMap 'log' pass and ticket prices are last price × exp(output) with no wall; the ask decides whether spares sell |
| Genome rule-bot listings | ruleAuctionList 1035-1039, called at 721 | Scripted listing behaviour for brain 'genome' bots, with undisclosed constants. Unused in NN and Realism runs. | Pin brain 'nn' in regulated runs, record it in the fingerprint and keep brain off the dial list. | Minor | Deferred: government build |
| Genome strategy, mutation and collector targets | randomGenome 939-948, mutate 949-959, collectorTargets 938, signals/scoreCard/researchWish/act 976-1000 | Genome bots hoard cards chosen by a filter on hidden F, and their signal design is scripted strategy. Legacy only. | Refuse to start a regulated run unless brain is 'nn'; if the genome brain stays for other work, filter on public prices. | Minor | Deferred: government build |
| Rule-bot signals and score | signals/scoreCard 976-985 | Rule-bot signals and scores are scripted strategies with magic numbers. Dormant in NN and Realism runs. | Lock the rule-bot code out of regulated runs (brain pinned to 'nn', engine refuses otherwise). | Minor | Deferred: government build |
| Pack purchase cash floor | nnAct 1218 | Pack buying stops when cash − price < keep × worth × 0.5: a magic 0.5 and a budget separate from card bids. (The finding had the direction backwards: the brake is looser than the card rule.) | Use one spare-cash budget for packs and card bids, governed by the network's keep output. | Minor | Fixed (fix/nets): packs spend the same spare cash above the keep target as card bids |
| Old liquidator asks (cutWhenUnsold / chase) | step line 1463; liqCut 2903 | The legacy 'chase' liquidator pulls prices down at 0.8 × mark, with a 4-copy weekly cap. Off by default. | Name liquidation, liqStart, liqStep and liqListings as non-dials; pin liquidation to 'auction' in regulated runs. | Minor | Deferred: government build |
| Discount forced sale (legacy) | step lines 1465-1466 | The legacy 'discount' forced sale sets the price (0.88 × mark, items 0.7) and the order. Off by default. | Retire the branch and the matching /0.88 divisors, so forced sellers always go through the market. | Minor | Deferred: government build |
| Test league updates | leagueUpdate lines 1705-1711 | The test-only leagueUpdates rule multiplies hidden values by magic factors (0.12, 0.3, 0.05). It must never reach a regulated run. | List leagueUpdates and updateEvery as non-dials; the driver refuses changes and the fingerprint asserts them off. | Minor | Deferred: government build |
| PULL mean reversion toward the last real value | PULL 2570; nextSeason 2603-2606 | Under the 'formula' value model, past the save each value moves 25% toward a fixed anchor (PULL = 0.25): code decides the direction. Dormant in Realism. | Remove the pull or make it a disclosed factor (formulaPull, 0 allowed). | Minor | Fixed (fix/nets): the disclosed factor formulaPull (default 0.25, 0 allowed), with a page control |
| OVR walk with an upward bias | ovrWalk 2718-2725 | ovrWalk raises a value with probability walkUp 0.55: the code sets the odds of direction. Dormant in Realism. | Validate controls.json against an explicit allow-list; reject valueModel, walkUp, walkVol* and riskPerDoubling as non-dials. | Minor | Deferred: government build |

### 5c. Mechanism bugs (34)

Money or cards created, destroyed or forgiven; matching and allocation bugs; biased shuffles; draws that couple measurement to the world; plumbing.

| Name | Where | Problem | Fix | Severity | Status |
|---|---|---|---|---|---|
| Contest generation | makeContest 785-801, publishContests 804 | sort(() => rand − 0.5) is not a uniform shuffle (a 400k simulation showed the bias). It orders imposter options, duel pairs, the watchlist sample and the weekly bot action order. | Add one seeded Fisher-Yates helper and use it at every such site (795, 892, 1018, 1459). | Important | Fixed (fix/mech): one seeded Fisher-Yates helper (W.shuffle) orders the imposter options, duel pairs, the rule bots' market-making sample and the weekly bot order. |
| Prediction league settlement | gamePhase 887, 908-909 | Pending predictions hold a reference to the bot. When it leaves or dies within 4 weeks, its stake still competes, payouts go to an object no longer in the market (money vanishes while recorded as paid), heirs never inherit the claim, and predictions pending at the end are never settled. | Reassign pending predictions to heirs in settleEstate; refund or drop them in removeBot through the leaver accounting; settle at run end. | Important | Fixed (fix/mech): settleEstate passes pending predictions to the heir; removeBot withdraws a leaver's and refunds its stakes; stakes still pending are reported in the frame (predPending), since a run has no end hook. |
| NN buy and sell decision | nnAct 1206-1210 | Order size is 1 + floor((qMax − 1) × sigm(o3)). With maxOrderQty 3 it reaches 3 only when o3 ≥ about 37, so the real limit is 2 copies per card per week, not the disclosed 3, and qtyEdge measures the wrong bin. | Map with 1 + min(qMax − 1, floor(qMax × sigm(o3))) on both sides and point qtyEdge at the top reachable bin. Under maximum freedom, consider removing the cap. | Important | Fixed (fix/mech): qtyOf: 1 + min(qMax − 1, floor(qMax × sigm(o3))) on both sides; qtyEdge counts the top reachable bin. |
| Default: collateral goes to the liquidator, not lenders | creditMarket 1276-1281; toLiq 2901; auction settlement 706 | Loans are described as secured by cards, but on default the collateral goes to the liquidator and lenders get only a cash share; the liquidator's sale of seized cards is a coin sink. | Attach each lender's unpaid claim to the seized lots and pay sale proceeds to claimants pro rata; send any surplus to one disclosed destination. | Important | Fixed (fix/mech): seized copies and items carry the unpaid lenders' claim; each liquidator sale pays them pro rata to what each is still owed, the surplus to the borrower (the treasury if it has left). Leavers' debts work the same way after repaying from cash. |
| Unpaid bills become a forced sale whose shortfall is forgiven | livingAndCredit 1321; holdCost 1449; cashShocks 1451; wealthTax 1434; forcedSales 1604-1619; 1473 | Unpaid bills (living costs, holding costs, wealth tax, cash shocks) become a forced sale, but the bill is never collected from the proceeds: the shortfall is forgiven and the sale still pushes prices down. | Carry unpaid amounts as debts by cause (b.owed), collect them after forced sales and send each to its original destination; leave the rest owed. | Important | Fixed (fix/mech): unpaid bills are owed by cause (b.arrears), count against worth, are collected from later cash and after forced sales and paid to the bill's destination, and are sold for again each week while owed. Only leavers are excused (recorded). |
| Wealth tax | step 1432-1438 | Every 4 weeks, worth above 2× the median is taxed at wealthTax × 4 from cash only; the 2× threshold and 4-week cadence are hard-coded, and the forced-sale shortfall is never collected. | Add wealthTaxThreshold (and optionally wealthTaxEvery) as disclosed settings, make the threshold a dial, and record unpaid tax as a debt. | Important | Fixed (fix/mech): wealthTaxThreshold and wealthTaxEvery are disclosed settings with page controls; unpaid tax is owed (arrears). wealthTaxForced now works: its forced sale had been wiped by livingAndCredit's reset. |
| Cash shocks | step 1450-1451 | A cash shock takes only the cash on hand; the unpaid part becomes a forced sale whose proceeds the bot keeps. | Store the unpaid part as an obligation, collect it after forced sales into house.mint.shocks, and carry any remainder. | Important | Fixed (fix/mech): the unpaid part is owed (arrears.shocks) and collected into house.mint.shocks from later cash and forced-sale proceeds. |
| Forced proceeds go to the lender | step 1473 | Line 1473 fires for every forced-sale cause, so a debtor forced to sell for its bills repays loans instead, and the bill stays unpaid. | Track forced proceeds and pay them in order of cause: first the bills that triggered the sale, then lenders for margin calls and defaults. | Important | Fixed (fix/mech): settleForced pays bills owed first, then lenders only from the proceeds of sales a margin call or loan default forced (traced per sale and per forced auction). |
| Dealers' starting stock | valueCollectors lines 1582-1583 | Dealers start with ceil(collectorStart × circ) copies of every card that come off neither circ nor pool. Each sale to a bot adds a copy to circulation, so total copies rise about 10% (100% for a 1-copy card) without minting. | Take the stock from the unminted pool, or count dealer stock in supply totals and disclose it as created at the open. | Important | Fixed (fix/mech): taken from the unminted pool (house.mint.dealerStock), so total copies are conserved. |
| Weekly call auction (clear) | clear lines 1620-1661 | Three matching flaws in clear(): a bot's own crossing ask is skipped with j++ and lost for every later bidder; swapping a blocked pair's ask breaks the sort so later crosses stop early; a buyer short of cash marks both orders used, consuming the seller's ask without a trade. | Scan for the next eligible ask per bid without moving the shared cursor; use a taken flag instead of swaps; check cash and holdings before marking orders used, and price from feasible orders only. | Important | Fixed (fix/mech): each bid takes the cheapest free ask it may trade with and that can settle (cumulative cash, seller copies); no shared cursor, no swaps, infeasible orders take nothing and don't set the price. |
| Borrower matched to the first lender in bot order | borrowCard 2851-2859 | borrowCard takes the first eligible lender in bot-array order, so lending business and its fees go to the oldest seats, not to the best terms. | Choose among eligible lenders with a seeded draw weighted by copies offered (wpick). | Important | Fixed (fix/mech): a lender is drawn with wpick, weighted by copies offered. |
| Fixed card lending fee | shortUpkeep 2876-2877 | The card lending fee is charged without a cash check, so a borrower's cash can go negative, which creates money. (The fixed rate itself is a disclosed quantity, not a problem.) | Pay min(fee, cash); send the remainder to a forced sale or book it as the lender's loss. | Important | Fixed (fix/mech): shortPay pays min(fee, cash); the rest is the lender's booked loss and calls the short. |
| Single shared random stream | seeded() 237-244; createWorld 251, W.gauss 268, W.pick 269 | One mulberry32 stream drives every draw. A policy that adds or removes one draw shifts every later draw, so same-seed arms are not paired comparisons. Replay equality is not affected. | Report arm differences as distributions over seeds with intervals. Split the generator into per-subsystem streams seeded from the run seed, record the layout in the fingerprint, and re-run the determinism and replay gates. | Minor | Fixed (main, `rngStreams`): league, market and bots, and people each draw from their own stream seeded from seed × 7919 + a fixed id, at least 0.22 × 2^32 draws apart; the layout is in `W.rngLayout` and the run file's `meta.rng`; determinism and the old engine's frames (`'single'`) re-checked. Deferred: government build for the fingerprint and reporting over seeds |
| Module-level state shared across worlds | createWorld 253, 294; practiceMany 324; packCache/packCacheT 475; bids/asks 542 (read by realValue 349) | packCache, bids/asks, hot and mood are module-level globals. Safe for one world at a time; parallel scripted governments or fuzzing in one process would cross-contaminate silently. | Move the per-world caches and books onto W. | Minor | Deferred: government build (only parallel scripted governments or fuzzing in one process are exposed; one world at a time is safe). |
| Minting | mintCopy 462-470 | mintCopy counts a mint and wakes the player before checking the pool, and a pack is charged in full even when some rolls mint nothing. | Check the pool first; skip empty players in drawPlayer; charge only for copies minted (or refund the rest through the ledger); add a pack conservation test. | Minor | Fixed (fix/mech): mintCopy checks the pool before counting or waking; a pack is charged per copy minted and the rest refunded through the ledger (house.packRefunds). |
| Pack expected value and posted price | packInfo 476-496 | The kit factor in pack EV ignores clubs without kits, a small overstatement of evMarket that affects one input and the first-week price. | Compute the kit factor per tier from each pooled player's actual kits. | Minor | Fixed (fix/mech): the kit premium is weighted by the value (and price) of pooled players whose clubs have each kit, per tier. |
| Pack draw by pool weight with tier fallback | drawPlayer 497 | If every player in a cached tier has pool 0, drawPlayer returns the first one, mintCopy returns null, and the buyer has paid full price for a short pack. | Weight by live pool and fall back to a tier with live pool; refund unminted rolls as a ledger line; move the mint counter after the pool check. | Minor | Fixed (fix/mech): drawPlayer draws by live pool net of copies already drawn for the pack; drawTier re-rolls an exhausted tier; short packs are refunded. |
| Realism preset key aliases | page/ui.js 7-15 vs DEFAULTS 181, 197 | The Realism preset sets flat keys (guideOn, cashShockChance…) while the engine reads nested objects; two spellings for one setting make a silent dead dial. | Map aliases onto one canonical key in createWorld and accept only that key in controls. | Minor | Fixed (fix/mech): createWorld maps priceGuide, cashShocks and adapt onto the flat keys (guideOn…, cashShockChance…, adaptOn…), which DEFAULTS, the engine and the page use alone. |
| Pack minting from the finite pool, with the site's pull guarantees | ripPack 524-535, drawPlayer 497, mintCopy 462-470 | When the rolled tier is empty, the draw falls to the first non-empty tier in order common → legendary, so an exhausted legendary pool turns into commons. Undisclosed. | Re-roll among non-empty tiers with the pack's own tier weights, matching the EV. | Minor | Fixed (fix/mech): drawTier re-rolls among non-empty tiers with the pack's own tier weights (the epic-plus slot tries epic and legendary first). |
| House prize pool is minted coins | gamePhase 900-906, payout 862-863 | The house prize pool is paid out of nothing: the comment says the house's takings, but nothing is withdrawn. An open money printer. | Pay the pool out of W.treasury, capped at the balance, and book it as a transfer, not under house.mint. (Regulated runs also keep prizeShare 0.) | Minor | Fixed (fix/mech): paid from W.treasury, capped at its balance, booked as a transfer (house.xfer.prizes). |
| Duel pairing and the unpaired refund | gamePhase 891-899 | The refund to an unpaired duelist skips flowIn and the game bookkeeping, so the money-flow record shows a stake lost that was returned. | Add flowIn beside the refund and journal it. | Minor | Fixed (fix/mech): flowIn and a journal entry beside the refund. |
| holdCost | step 1447-1449 | holdCost charges a share of each mark into the treasury; the unpaid part goes to a forced sale and is forgiven. | Record unpaid holding cost as arrears and pay them into the treasury after forced sales. | Minor | Fixed (fix/mech): unpaid holding cost is owed (arrears.holding) and paid into the treasury later. |
| Bot order: biased random shuffle | step 1459-1460 | The weekly bot order uses a random-comparator sort that leans toward the original order, so older bots act first more often on first-come resources. | Fisher-Yates shuffle at line 1459. | Minor | Fixed (fix/mech): W.shuffle. |
| Biased order of bots placing orders | step line 1459 | Same biased shuffle; earlier orders also win stable-sort ties in the book. | Same helper, defined next to W.pick. | Minor | Fixed (fix/mech): W.shuffle, defined next to W.pick. |
| Band outside bids (legacy outsideMode 'band') | step line 1462; clear line 1652 | Legacy outsideMode 'band' (off by default): a filled band bid runs c.circ−− without adding the copy to W.outside, destroying the card, and its coins are new money. The constants 0.05, 0.85 and 1.08 are magic numbers. | Retire 'band' and reject it at config validation; otherwise conserve cards and price from public values. Fingerprint asserts outsideMode 'value'. | Minor | Fixed (fix/mech): retired: createWorld rejects it and the page option is gone; clear() keeps an outside buyer's copy in W.outside. |
| Comparable-sales mark | compsMark lines 1488-1495 | Book-moved marks count as comparable sales, so one card's standing book can re-mark its 15 sibling markets with no trade: an undisclosed mark-to-mark feedback. | Make the comps source a pre-registered setting (compsSource 'trades' or 'trades+book') recorded in the run file. | Minor | Fixed (fix/mech): compsSource ('trades+book' default, 'trades') is a setting recorded in the run file, with a page control. |
| Dealers trade both ways | valueCollectors lines 1593-1600 | Dealer 0 always gets first pick of the cheapest asks: a fixed priority among outside dealers. | Shuffle the dealer order each week with the seeded RNG. | Minor | Fixed (fix/mech): the dealer order is shuffled each week with the seeded generator. |
| Standing-book diagnostics and public book | clear lines 1634-1635, 1663-1673 | bookDiag divides distances by priceRange even under priceMap 'log', so its unit is misleading (measurement only). | Record log distance from the mark under 'log' and label it. | Minor | Fixed (fix/mech): under priceMap 'log' the distance is log(price ÷ mark); bookD.distUnit labels it. |
| Trade arcs sampling uses world RNG | clear line 1657 | Display-only trade-arc sampling draws from W.rand, so the number of trades shifts every later world draw: a measurement changes outcomes. | Use a private stream for the sampling, or select deterministically. | Minor | Fixed (fix/mech): sampled from a private stream (W.drand). |
| Royalties (amount and funding) | payRoyalties lines 1715-1724 | A short seller's royalty payment can push its cash negative with no check. (The minted-royalty printer is closed under closedEconomy.) | Route a royalty shortfall to a forced sale, and if still unpaid book it as the lender's loss. | Minor | Fixed (fix/mech): shortPay: a short seller pays from cash only; the shortfall is the lender's booked loss and calls the short. |
| Fitness sharing | sharedFitness lines 1954-1960 | The comment at line 1952 says the fitness-sharing radius is 0.3; the code uses sharingRadius (default 0.5). | Correct the comment; list sharingRadius as a chosen kernel width. | Minor | Fixed (fix/mech): comment corrected; sharingRadius is listed as a chosen kernel width. |
| Estate sale (forced partial liquidation at death) | generationEnd 2008-2010; estateSale 2025-2031 | At death a share of the estate is sold through bids and then a no-minimum auction; unsold estate copies go to one heir without their lots. estateSale 0.4 is not marked as an assumption. | Mark estateSale as an owner assumption; move lots with the unsold copies. | Minor | Fixed (fix/mech): estateSale is marked the owner's assumption; unsold copies go to the heir with their cost lots. |
| Real seasons replayed | eraFrom 2554-2558; nextSeason 2590-2597 | In the default league branch the value floor is coinScale, while every other value path uses 0.05 × coinScale. | Use one named floor (0.05 × coinScale) everywhere. | Minor | Fixed (fix/mech): one floor, 0.05 × coinScale. |
| Lender cycle (dead code) | lenderCycle 2641-2651 | lenderCycle is dead code with hard-coded constants (0.9, 1.2, 0.012, 1.35) that could be re-enabled by mistake. | Delete the function, its default, frame field and preset key. | Minor | Fixed (fix/mech): function, frame field and preset key deleted (old run files' key is dropped in createWorld). |

### 5d. Walls (15)

Hard limits on what a bot may do that are not costs. Under maximum freedom a wall that binds becomes a cost or is removed and disclosed.

| Name | Where | Problem | Fix | Severity | Status |
|---|---|---|---|---|---|
| Memory cap on notes | writeNote 384-390 (memoryCap 25) | memoryCap 25 deletes a bot's oldest note whenever it holds more; nothing charges for keeping notes. It binds for a bot researching 6 players a week while notes last 12 weeks (up to 72 wanted). Not shown on the page. | Expire notes by staleness (knowledgeWeeks) instead of a count, or set the cap from the reachable maximum; disclose the rule. | Important | Fixed (fix/mech): memoryCap 0 by default: a note is forgotten at 2 × knowledgeWeeks old (stale notes count for nothing); the old count wall stays as a setting, with a page control. |
| Pass and ticket price walls | nnThink 1183 | Pass and ticket prices are capped at 600/300/200/100 coins (30, 15, 10, 5 × coinScale through a sigmoid). Asks can never reach what bids may pay: a scripted asymmetry. Undisclosed. | Map the four outputs on the same log scale as card and pack bids, around the last clearing price, with equal ranges for bids and asks. | Important | Fixed (fix/mech): the four outputs map like the pack bid (exp of the output, log scale under priceMap 'log') around the last clearing price (passOpen / ticketOpen × coinScale before the first trade), the same for bids and asks. |
| Research pass use and weekly research cap | usePass 399; passPhase 646-659 | Research passes are already bought on a market, so maxResearchPerWeek 6 is a second, hard wall on top of the cost (enforced in four places). | Raise the cap far above reachable demand or remove it, so the pass price binds. | Minor | Fixed (fix/mech): maxResearchPerWeek raised to 60, a safety bound far above what passes reach; the pass price binds. |
| Bid helper: cash check and position limit | bid, engine.mjs 543-549 | positionLimit is a hard wall (bids silently dropped above a share of circulation); the cash check is per copy, not cumulative. | The audit recommends replacing positionLimit as a government lever with a concentration holding tax (rate and threshold) paid to the treasury. | Minor | Fixed (fix/mech): the cash check is cumulative over a bot's bids in a week. positionLimit as a concentration holding tax: Deferred: government build. |
| AI token order size cap | tokenMarket 618 | AI pass and ticket orders are clamped to a literal 6. | Clamp buys to the configured cap and sells to holdings. | Minor | Fixed (fix/mech): buys clamped to the weekly cap, sells to the passes or tickets held. |
| Auction listing (cards and one-of-a-kind items) | listAuction 663-670, listItem 672-680, AI listings 719 | AI bots may list 2 auctions a week (literal, in two places) while NN bots get maxListings. | Apply cfg.maxListings to every bot kind. | Minor | Fixed (fix/mech): AI bots get cfg.maxListings. |
| Lend share wall ×0.7 | nnThink 1180 | lendShare = max(0, tanh(o)) × 0.7: a literal cap on how much idle cash a bot may lend. | Map to the full range, or keep a disclosed lendShareMax. | Minor | Fixed (fix/mech): lendShareMax, default 1 (the full range), disclosed with a page control. |
| Leverage wall ×1.5 | nnThink 1180; creditMarket 1295 | The borrowing output is max(0, tanh(o)) × 1.5: an undisclosed literal; maxLTV usually binds first. | Make it a disclosed levMax, or scale the output straight to the maxLTV cap. | Minor | Fixed (fix/mech): a neural bot's borrowing output is a share of maxLTV × its cards' value; maxLTV is the only limit. |
| Research count output | nnThink 1184; nnResearchWish 1196-1201 | The network's research output is scaled to maxResearchPerWeek, so the wall is built into the output mapping. | Map the output to an open scale (e.g. passesPerWeek × exp(o)) with a large safety clamp and let the price bind. | Minor | Fixed (fix/mech): passesPerWeek × exp(output), held by maxResearchPerWeek as a safety bound. |
| Pack count thresholds (2 per type) | nnThink 1185; nnAct 1217-1218 | Each pack type maps to 0, 1 or 2 packs; under Realism maxPacks 8 equals 4 types × 2, so the hard-coded 2 is what binds. | Map the output to a continuous count with maxPacks the only ceiling. | Minor | Fixed (fix/mech): 0 to maxPacks per type (1 + min(maxPacks − 1, floor(maxPacks × tanh(o)))), maxPacks the only ceiling. |
| Credit call auction | creditMarket 1286-1309 | Loan offers need idle cash above 10 × coinScale and requests above 5 × coinScale (200 and 100 coins): small undisclosed walls. | Make them disclosed factors or drop them to the matcher's dust floor. | Minor | Fixed (fix/mech): both floors dropped to the matcher's dust floor (0.5 coins). |
| AI bot action caps | setActions 1339-1375; aiOrders 1388-1396 | AI action caps (30 orders, 0–5 packs per type, 4 pass and 4 ticket orders, 2 auctions…) are literals, some narrower than the NN bots'. | Move every AI cap into cfg, at the NN values or wider, and record them in the run file. | Minor | Fixed (fix/mech): the neural bots' caps where they have one (maxOrderQty or 5, maxPacks, maxListings, maxShorts, maxResearchPerWeek, maxGamesPerWeek) and cfg.aiCaps for the rest (orders 40, notes 12, sealed bids 10), all recorded in the run file. |
| Retirement | leagueSeasonEnd 2357-2372 | Retirement is certain past the last age in nfl_age.json (40): a cliff. Small samples (n < 20) are pooled. | Use a measured 40+ bin, or carry the last measured rate forward. | Minor | Fixed (fix/mech): past age 40 the rate of the oldest ages pooled to 100 careers (38–40, about 0.36) carries forward. |
| Network quit rule | peopleChange 2630-2633 | No bot can quit in its first 20 weeks (a literal in both quit rules), whatever it loses. Stated in round3-spec but not in the cfg comment, tooltip or Realism table. | Add quitMinWeeks (default 20) and disclose it with the other quit assumptions. | Minor | Fixed (fix/mech): quitMinWeeks (default 20), disclosed, with a page control. |
| Auto-return of copies a short seller holds | settleShorts 2886-2896 | A borrower holding a copy of a card it owes is netted automatically at settlement, so a bot cannot be long and short the same card. | Keep the netting (it is plain netting) and disclose it in the spec and docs. | Minor | Fixed (fix/mech): kept and disclosed in docs/MODEL.md (credit and shorts). |

### 5e. Undisclosed assumptions (37)

Constants not measured from the save and not labelled as assumptions. The fix is disclosure (a named config key, a label on the page and in the run file), with behaviour unchanged unless stated.

| Name | Where | Problem | Fix | Severity | Status |
|---|---|---|---|---|---|
| Copies in circulation per player (S0) | createWorld 274 | Starting copies per player S0 = max(2, round(40 / sqrt(value/100))): the 40, the square-root law and the minimum of 2 are not measured or labelled. They set every card's scarcity. | Make the formula disclosed config (circBase, circPower, circMin, circValueFloor) behind one helper used at all three sites. | Important | Fixed (fix/assume): one helper `printRun` at all three sites, keys printRunK, printRunExp, printRunMin, printRunValueFloor, printRunUnit (DEFAULTS, page, Realism preset) |
| Worth with concentration haircut | worth 357-364 | worth() cuts holdings above 3 copies by 1/(1 + 0.06 × (q − 3)) and values items at 0.9 × mark × (1 − fee). The constants are not config or labelled, and worth feeds the wealth tax, lifestyle costs, network inputs, fitness and rankings. | Move concentrationFree, concentrationSlope and itemHaircut into cfg, label them as assumptions and write them into each run file. | Important | Fixed (fix/assume): concentrationFree, concentrationSlope, itemHaircut in DEFAULTS as assumptions, read by worth, realValue and holdingsValue; written into every run file |
| Print run 40 / sqrt(value / 100) | startTimeline 2580; nextSeason 2596 (also line 274) | The same print-run formula appears at lines 274, 2580 and 2596 and sets every card's supply and the size of the economy. | One helper (printRun) with disclosed keys, labelled as owner assumptions. | Important | Fixed (fix/assume): the `printRun` helper with disclosed keys, labelled as owner assumptions |
| Unminted pool | createWorld 275 (pool = S0 × poolMultiplier); mintCopy 465 | poolMultiplier 10 (unminted pool = S0 × 10) is not on the page or labelled. | Label it and the print-run formula as owner assumptions in DEFAULTS and the Rules panel. | Minor | Fixed (fix/assume): poolMultiplier and the print run labelled as assumptions in DEFAULTS and in Rules (Assumptions group) |
| AI bot lifespan draw | addAiBot 331 (aiLifespanWeeks [40, 80]) | AI bot lifespan 40–80 weeks is not measured or shown as an assumption. | Add a labelled Rules control, shown when AI bots are on. | Minor | Fixed (fix/assume): aiLifespanWeeks labelled as an assumption and listed in Rules; no page control (AI bots run only in run.mjs) |
| Fitness valuation (realValue) | realValue 347-355 | realValue values items at an undisclosed 0.9. | Value items at a standing bid or recent item auction where one exists; otherwise a disclosed factor. | Minor | Fixed (fix/assume): the 0.9 is itemHaircut, disclosed and shared with worth; valuing items at a bid or recent auction is a behaviour change left open |
| Research reveals hidden value through noise | research 391-398 | Research notes carry a 20% log-normal error around F. It sets how valuable information is, but is not labelled as an assumption. | Expose nnResearchError as a labelled Rules slider. | Minor | Fixed (fix/assume): nnResearchError labelled as an assumption, with a Rules slider |
| Items marked by multiplier, not their own trades | markItem 472; intrinsicItem 473 | An item's mark is its plain card's price × (item multiplier ÷ plain multiplier), not its own trades. Not disclosed. | Disclose the item mark rule and the 0.9 haircut; optionally make the valuation a factor. | Minor | Fixed (fix/assume): the mark rule is disclosed in the code comment and MODEL.md (Assumptions); the haircut is itemHaircut |
| Pack release and uniform-price auction | packAuction 507-518 | packsPerWeek 33 and the pack mix come from an earlier simulation ('the mix bots bought under the old price'), not from the save, and are not marked as assumptions. | Label the slider and packMix as owner assumptions; optionally expose packMix. | Minor | Fixed (fix/assume): packsPerWeek and packMix labelled as assumptions in DEFAULTS, the slider tooltip, the Assumptions list and the Realism preset |
| Starting cash and other untagged base quantities | DEFAULTS 17-28 (startCash 20000, passesPerWeek 3, passLife 1, knowledgeWeeks 12, memoryCap 25) | startCash 20000, passLife 1, maxResearchPerWeek 6, memoryCap 25 and similar base quantities are not on the page or in Rules as assumptions. | Add an 'Assumptions (not measured from the save)' list in Rules built from DEFAULTS. | Minor | Fixed (fix/assume): startCash, passesPerWeek, passLife, maxResearchPerWeek, knowledgeWeeks, memoryCap labelled; Rules has an Assumptions list built from ASSUMPTIONS and DEFAULTS |
| Pack expected value (pricing reference) | packInfo, engine.mjs 476-496 | meanAuto falls back to a magic 7.36 when kit metadata is missing, changing the opening pack price; EV is computed from hidden F even under 'auction'. | Remove the fallback and fail at world build if the value is missing. | Minor | Fixed (fix/assume): the 7.36 fallback is removed; createWorld throws when kits.autographMeanMult is missing |
| Pack supply and uniform-price pack auction | packAuction, engine.mjs 507-518 | Same pack mix, described in a comment but not flagged as an assumption. | Tag the slider and tooltip with the 33-a-week count and the mix. | Minor | Fixed (fix/assume): same as the pack release finding: slider tooltip and DEFAULTS name the count and mix as assumptions |
| Note swap | swap, engine.mjs 575-587 | 3 notes per swap is a literal, not in DEFAULTS. | Add notesPerSwap and notesPerSteal as disclosed defaults. | Minor | Fixed (fix/assume): notesPerSwap (3) in DEFAULTS |
| Note theft, detection and gossip | steal, engine.mjs 588-603 | The 0.5 'guarded' chance and 3 notes per theft are undisclosed. Theft creates information, not money. | Add guardChance and notesPerTheft to DEFAULTS as owner assumptions. | Minor | Fixed (fix/assume): guardChance (0.5) and notesPerTheft (3) in DEFAULTS; guardChance has a Rules slider |
| Contest payout: share of entrants paid | payout 860-872, GAMES.paid 760-770 | The share of entrants paid in each game (0.2, 0.1, 0.25, winner-takes-all) is hard-coded and sets how skewed winnings are. | Move it into config as gamePaid and disclose it. | Minor | Fixed (fix/assume): cfg.gamePaid (per contest) replaces GAMES.paid |
| Game stake and coinScale disclosure | DEFAULTS 16, 113; gamePhase 883-884 | The comment says every coin amount is in coinScale units, but startCash, allowance, livingCost and gameStake are raw; gameStake is not scaled by fillK. | Rewrite the comment to list exactly what coinScale scales. | Minor | Fixed (fix/assume): the coinScale comment now lists exactly what it scales and names the raw coin settings |
| Card input: royalty yield from note | cardInputs 1146 (x27) | Input x[27] is the configured royalty rate against price, not the realized yield after scaling, which under a government treasury would differ routinely. | Keep it as the promised yield and correct the comment and docs (x[32] carries what was paid). | Minor | Fixed (fix/assume): comment and MODEL.md say input 27 is the promised yield; input 32 carries what was paid |
| Network initialization and mutation | randomNet 1064; mutateBrain 1125-1129; widenCard 1106-1114 | A reset weight is drawn at std 1, not at the layer's 1/√fan-in scale (about 6× larger on the 41-input layer); the widen scale 0.1 is a magic number. | Make nnResetScale and nnWidenScale disclosed config; draw resets at the layer's initialization scale. | Minor | Fixed (fix/assume): nnResetScale (1; 'layer' redraws at 1/√fan-in) and nnWidenScale (0.1) in DEFAULTS; the default keeps std 1 |
| holdingsValue (collateral) with an item haircut | holdingsValue 1260 | holdingsValue (collateral) values items at 0.9 × mark while worth uses 0.9 × (1 − fee): inconsistent and undisclosed. | One cfg.itemHaircut for all three sites, disclosed next to maxLTV. | Minor | Fixed (fix/assume): one cfg.itemHaircut at all three sites; the fee difference (collateral has none) is disclosed in MODEL.md |
| Market drawdown mood | step line 1440 (mood.drop), used at 982, 1004, 1133 | The drawdown mood uses an 8-week lookback literal. | Add moodWeeks as a disclosed default. | Minor | Fixed (fix/assume): moodWeeks (8) in DEFAULTS |
| Repeat-sales chains (Vault index) | noteTrade lines 1514-1518 | The Vault index pairs trades only within 52 weeks (literal). The index feeds bot inputs and entry, so its construction shapes the world. | Add rsMaxGap, rsWindow, rsClamp and rsSmooth as disclosed measurement settings. | Minor | Fixed (fix/assume): rsMaxGap (52) in DEFAULTS, with rsWindow, rsClamp, rsSmooth |
| Budget outside collectors (outsideMode 'budget') | outsideFlow lines 1541-1558 | Budget outside collectors cap savings at a literal 4 weeks (off in Realism). | Add outsideSaveWeeks (default 4). | Minor | Fixed (fix/assume): outsideSaveWeeks (4) in DEFAULTS |
| Newcomer cash minting | newcomer 1962-1968 | Newcomer cash spread (log-sd 0.5) is undisclosed, and newcomer cash is created money outside the spending rule. | Add newcomerCashSd as a disclosed default; name entry settings as non-dials in the spec. | Minor | Fixed (fix/assume): newcomerCashSd (0.5) in DEFAULTS with a Rules slider; naming entry settings as non-dials belongs to the government spec |
| Mortality and heirs | generationEnd 2002-2011 | Bot lifespan [6, 14] generations, drawn uniformly, is not measured or marked as an assumption. | Mark it in DEFAULTS and the page. | Minor | Fixed (fix/assume): lifespan labelled as an assumption in DEFAULTS and listed in Rules |
| Repeat-sales Vault index | repeatSales 2089-2105 | The repeat-sales index uses a 104-week window, a ±2 clamp and λ = 1e-3, all literals, in a series bots and entry read. | Same: disclosed config next to vaultIndex. | Minor | Fixed (fix/assume): rsWindow (104), rsClamp (2), rsSmooth (1e-3) in DEFAULTS next to vaultIndex |
| League start: per-game rates, form window, career length | leagueStart 2286-2300 | Starting rates use the last real season only if he played at least 4 games; a small undisclosed data-handling constant. | Make it a disclosed factor (lastSeasonMinGames). | Minor | Fixed (fix/assume): lastSeasonMinGames (4) in DEFAULTS |
| Random entry ages for real players | leagueStart 2298, lgAge 2317 | The save has no ages, so each real player's age is a random draw from NFL rookie ages; the comment can read as if his age were known. Age drives injury and retirement risk. | Disclose it on the page, in the README and in the comment. | Minor | Fixed (fix/assume): disclosed in the code comment, README, MODEL.md and the Assumptions list; entryAgeFallback (23) named |
| Injuries | leagueInjuries 2303-2316 | Injuries: the position-pool fallback threshold of 3 is a minor undisclosed constant. | Make it a named factor and record which positions fell back. | Minor | Fixed (fix/assume): injuryPoolMin (3) in DEFAULTS; W.L.injuryFallback records the positions that fell back |
| Weekly game simulation | lgGame 2319, leagueWeek 2321-2335 | gameNoise 0.4 (a game's spread around the per-game rate) is not measured; only season totals are known. | Call it an owner assumption in DEFAULTS and the page. | Minor | Fixed (fix/assume): gameNoise labelled as an assumption in DEFAULTS, with a Rules slider |
| Super Bowl champion | leagueSeasonEnd 2343-2347 | The champion is drawn in proportion to each club's card players' production. The weighting is noted in a comment, not in DEFAULTS or on the page; with leagueFill 'save' it favours clubs with more card players. | Add championWeight as a disclosed option. | Minor | Fixed (fix/assume): championWeight ('production'; 'equal' draws evenly) in DEFAULTS and Rules |
| MVP, OPOY, DPOY | leagueSeasonEnd 2349-2354 | The MVP, OPOY and DPOY winner is always rank 1 at his position, while the save shows a mean winner rank of 0.90–0.98. | Sample a target rank from the measured winner-rank draws. | Minor | Fixed (fix/assume): disclosed as awardWinner 'top'; the data keeps only winner-rank quantiles, so sampling a rank is left open |
| Rookie creation and print run | addRookie 2400-2407, leaguePlayer 2410-2426 | A rookie's print run is the median S0 at his position (20 if none) with OVR 62 placeholders; undisclosed. | Disclose it as an assumption. | Minor | Fixed (fix/assume): rookieS0Fallback (20) and rookieOvr (62) in DEFAULTS; the median rule disclosed in the code and MODEL.md |
| Fitness at selling value (realValue) used in this slice | generationEnd 1986 calls realValue (347-357) | realValue uses the same 0.06 haircut and 0.9 item factor for fitness, so the constants shape selection. | Read the same disclosed settings in realValue and worth. | Minor | Fixed (fix/assume): realValue reads the same concentrationFree, concentrationSlope and itemHaircut as worth |
| Rookie inherits the template player's skill and grade; OVR 62 placeholder | leaguePlayer 2417 | A rookie inherits the skill and grade of the real player whose early season was drawn as his template; skill moves his hidden value by 0.8–1.2×. Undisclosed. | Disclose it in the README's rookie rules. | Minor | Fixed (fix/assume): disclosed in the code comment, README and MODEL.md; rookieOvr names the 62 |
| Opening blend from career OVR to form OVR over 2 seasons | leagueValues 2436, 2451 | The blend from career OVR to form OVR runs over a literal 2 seasons. | Add formBlendSeasons (default 2) and disclose it. | Minor | Fixed (fix/assume): formBlendSeasons (2) in DEFAULTS, with a Rules slider |
| Generated veteran burn-in | veteran 2498-2516 | The generated-veteran burn-in uses the same unlabelled gameNoise. | Same disclosure, also in the copy embedded in trading-floor.html. | Minor | Fixed (fix/assume): gameNoise is labelled where veterans use it and in the page built from the engine |
| Implied player price | impliedPrices 2752-2761 | A player's implied price weights each card market by circ + 2 × volume; the 2 is a literal shaping a public price that bots and entry read. | Add impliedVolumeWeight as a disclosed measurement setting. | Minor | Fixed (fix/assume): impliedVolumeWeight (2) in DEFAULTS |

### 5f. Government-only routes and accounting (15)

Routes that matter only once a government owns a treasury, and the accounting that decides what counts as revenue, spending and a bot's own return.

| Name | Where | Problem | Fix | Severity | Status |
|---|---|---|---|---|---|
| Pack revenue goes into W.treasury | ripPack, engine.mjs 522 | ripPack credits the full pack price to W.treasury; the spec says pack revenue leaves the economy and the treasury takes only a sales tax. | Send the price to a publisher sink outside the economy and credit the treasury only with the pack sales tax; same for store and dealer sales; one revenue line per tax and a weekly check that the treasury moves by its line items. | Important | Deferred: government build (the treasury now books every change under its own line with a weekly check, fix/info) |
| Bot network inputs (balance sheet, world, config) | nnThink 1162-1177 | Input x25 reports the configured allowance, not what was paid when the treasury fell short; x27 packEdge is meaningless under pack auctions. | Feed last week's actual per-bot payment (allowing negative values for a poll tax), the realized royalty rate, and the pack sales tax in place of packEdge. | Important | Deferred: government build |
| Living costs (money sink, not to treasury) | livingAndCredit 1314-1322 | Living and lifestyle costs, the largest per-bot charge, bypass the treasury while the spec's money-in table said they were paid into it. | Keep them a consumption sink outside the treasury at fixed published values; remove livingCost and lifestyle from the dials; test that livingAndCredit never changes the treasury. | Important | Deferred: government build (they already never touch the treasury: no treasury line for them) |
| Worth history and exogenous-money history | step line 1474 | Unearned money is booked into b.exo unevenly (allowance yes, wealth-tax payback no), and fitness subtracts exo, so which government flows reach learning depends on per-site habits. | One transfer helper that changes cash and exo together for every non-market flow, and a gate check that exo changes equal non-trade ledger lines. | Important | Fixed (fix/info): one transfer() helper moves cash, the ledger and b.exo together for every non-market flow; a test checks each week that Σ Δexo equals the lump sums booked |
| Learning within a lifetime (adapt) | adaptStep lines 1733-1750 | Lifetime learning scores returns net of exo with the same inconsistent booking; every government transfer would need a classification. | One pre-registered booking rule for every flow between a bot and the treasury. | Important | Fixed (fix/info): adapt reads the same b.exo, booked by the one rule (fitnessExo) |
| Fitness = return net of allowance and living costs only | generationEnd 1984-1986; exo set at 1319 (living) and 1430 (allowance) | Fitness removes only the allowance and living costs (the comment wrongly says royalties too). Whether taxes and transfers enter fitness is a design choice that must be pre-registered; the 50 × coinScale denominator floor is undisclosed. | Fix the comment; add a fitnessExo setting listing the flows taken out of fitness; pre-register it. | Important | Fixed (fix/info): comment corrected; fitnessExo setting ('lumpSums', the owner's decision: allowance, wealth tax paid back, flat living cost, cash shocks; 'legacy' the old booking); the 50 × coinScale floor is disclosed in the comment and MODEL.md |
| Evolution: worst copy best | generationEnd 1995-2001 | Selection ranks bots by fitness net of exo. Grants to the poorest decile, rescues and subsidies are not booked to exo, so a grant would shield the worst networks from replacement. | Book every treasury transfer the bot did not choose as exogenous (per the pre-registered rule). | Important | Fixed (fix/info): every lump sum a bot did not choose is booked to exo through transfer(); a newcomer's opening grant is its starting capital |
| Bot exit: cash destroyed, loans forgiven or defaulted, cards to the liquidator | removeBot 2050-2063 | When a lender leaves, closeLoan makes the borrower pay the card's full mark into W.treasury: revenue from a bot leaving, not a tax. Leavers' cash is tagged before loans settle, so the tags do not add up. | Never credit the treasury; pay the settlement to the lender's heirs or out of the economy under its own tag; tag leavers' cash after loans close. | Important | Fixed (fix/info): a gone lender's settlement leaves the economy under its own tag (loanLeavers), never to the treasury; leavers are tagged after their loans close, collateral included; open listings go to the liquidator |
| Weekly record and money-flow tags | record 2109-2132 | moneyWeek tracks only bots' cash. Treasury spending and non-tax inflows would be untagged, and the 'other' residual hides exactly what the fuzzer must catch. | Tag every cash movement at its source and keep a three-part ledger (bots, treasury, government account) in which each flow is recorded once as source and destination. | Important | Fixed (fix/info): every movement of bots' money (cash plus short collateral) is tagged once at its source, so "other" is zero; the treasury keeps its own line ledger with a check. The government account is for the government build |
| Loan close when the lender has left: money to the treasury, uncapped | closeLoan 2861-2872 (2865); called from removeBot 2059 | The lender-gone branch of closeLoan has no cash cap, so the settlement can push the borrower's cash negative and create money. | Pay min(settle, cash) in both branches and send the shortfall to a forced sale or the lender's loss. | Important | Fixed (fix/info): both branches pay at most the borrower's cash, the rest is the lender's loss; the card-lending fee and a short seller's royalty are capped the same way |
| Allowance and treasury wipe | step 1425-1431 | The comment says the allowance pays at most half the treasury a week; the code pays the whole treasury. Outside closedEconomy the treasury is wiped weekly without a ledger line. | Correct the comment; pin closedEconomy on and centralBank off in regulated runs and reject changes; record the wipe in the ledger. | Minor | Fixed (fix/info): comment corrected; the wipe is the treasury line 'wiped'. Pinning closedEconomy and centralBank is for the government build |
| Changing the dealer count mid-run | valueCollectors lines 1580-1581 | Changing the dealer count mid-run rebuilds the dealers with old biases kept; unreachable unless collectors becomes a dial. | Keep collectors and collectorError off the allow-list and in the fuzzer's negative test; conserve cards and cash if the count ever changes. | Minor | Deferred: government build |
| Form swing and the pressure channel | leagueSeasonEnd 2389-2395 | The earlier framing that a card's price feeds next season's form is wrong: the channel is football → hidden value → football and never reads a price or a bot. | Describe it that way in the spec; keep pressure, pressureStrength, formSeasons, valueBasis, injuries and hypeInjury fixed at measured defaults and in the fingerprint. | Minor | Deferred: government build |
| Money follows the cards (fillK) | fillLeague 2481 | The allowance paid is the dial × fillK × bankRate; the government sees only the dial. | Define the allowance dial as coins per bot per week (apply fillK once at start), or show fillK and the effective allowance next to the dial. | Minor | Deferred: government build |
| Newcomer arrivals (rate, hype, word of mouth) | peopleChange 2619-2626; botReturn11 2621 | Entry responds to the Vault index's 20-week return, so a government that lifts prices draws in newcomers with newly created cash. The arrival cap is also undisclosed. | Record the price-to-entry channel as a pre-registered decision (on, measured); add a weekly line with r20, the arrival rate, newcomers and newcomer cash; disclose the spread and cap. | Minor | Deferred: government build |

## 6. Findings judged not real

61 findings, recorded so the audit is complete. Most describe the code correctly but point to intended, disclosed behaviour, a legacy path that cannot run in the experiment, or a measurement with no effect on the world.

| Name | Where | Why not a problem |
|---|---|---|
| Hidden value initialisation and floor | createWorld 274-275 | Cards open at the site's measured price; the floor is 1 coin. Real data, not a hidden force. |
| Starting endowment | createWorld 296 -> endow 2680-2684 | Endowment copies come from the save's print runs; nothing is created outside the stated rule. |
| AI bot entry basket minted free | addAiBot 329-338 | addAiBot runs only at t = 0, when prices equal opening values; no free basket mid-run. |
| Research page shows the value formula's inputs | libraryPage 378-382 | The page shows public fundamentals from the save (OVR, skill, totals); the hidden value is stripped. |
| Opening a pack | ripPack 519-539 | Free packs never happen and the other claims fail against the code and the spec. |
| Ask helper: no naked selling | ask, engine.mjs 551 | No naked selling is card conservation, not a limit on behaviour. |
| Attention set: which cards a bot considers | sample 552; hot list (built at 1443); researchWish 994; act 1000 | The capped attention set exists only on legacy rule-bot paths; NN bots scan every live market. |
| Sealed bids: item bid scaled by the site's rarity premium | auctionPhase 688-694 | Scaling an item bid by the rarity premium gives the same number as pricing the item directly. |
| Second-price settlement and re-marking | auctionPhase 698-706 | Second-price settlement with a disclosed single-bidder option; no defect. |
| Liquidator proceeds leave the economy | auctionPhase 706 | Liquidator proceeds leaving the economy is the deliberate, disclosed design. |
| Liquidator listings | auctionPhase 724-730 | Liquidator listings follow disclosed settings (liqListings, reserve). |
| Fire-sale and auction statistics | auctionPhase 684-685, 703 | Fire-sale and auction statistics are measurement only. |
| Contest scoring (valuation scored on hidden F) | scoreOf 808-822 | Scoring valuation against F is the game's definition; the leak is the reported score (see the real finding on score feedback). |
| Genome bots' entries, ticket wish and topic choice | ruleEntries 848-852, ticketWish 914-919, bestTopic 842-846 | Genome-bot entry and ticket rules run only under the legacy brain. |
| New bot creation | newBot 960-973 | The 0.1 social re-roll applies only to the legacy brain. |
| newBot starting cash and social inheritance | newBot 960-973 | The re-roll never reaches an outcome: heirs overwrite it and offspring parents are NN bots. |
| Rule-bot researchWish | researchWish 989-995 | researchWish runs only for legacy genome bots. |
| Rule-bot act() trading script | act 997-1027 | act() scripts trades, but only for legacy genome bots that cannot run in this experiment. |
| Rule-bot auction bid and list rules | ruleAuctionBid/ruleAuctionList 1029-1039 | Rule-bot auction rules run only under the legacy brain. |
| Card network inputs: public market data | cardInputs 1135-1150 | Card network inputs are public market data. |
| Card input: research note vs price (noisy hidden F) | cardInputs 1142 (x12-x15); research() 380 for kind 'rule', which includes NN bots | The research note is the designed noisy channel; the government route the finding assumed does not exist. |
| Card input: price guide | cardInputs 1156-1157; priceGuide 1570-1576 | The price guide publishes lagged F by design; it is a disclosed public channel. |
| Cash target output | nnThink 1180 | keepMax 0.95 scales the network's own output and is disclosed; it does not bind as a wall. |
| Pack bid multiplier | nnThink 1190; buyPack 500-504 | The pack bid multiplier is the network's output with a disclosed mapping. |
| NN auction listing and shorting thresholds | nnAct 1211-1212, 1216 | Listing and shorting thresholds can be learned past; not a hidden force or binding wall. |
| Buy-order deployment and cash budget | nnAct 1214-1215 | The cash check on buy orders is an ordinary budget constraint. |
| Margin call | creditMarket 1283 | The margin call records an amount to raise; the market sells it. No principle broken. |
| Public board and direct messages | setActions 1357-1367 | No NN input reads the AI bots' board, so it is no channel for the government. |
| Per-week resets and Fpub | step 1401-1403 | Weekly resets are counters; Fpub holding last week's value is the intended public copy. |
| Season loss of cards (lossRate) | step 1406-1409 | Season card loss is a disclosed quantity (default 0) that never looks at value. |
| Value model and weekly royalties | step 1410-1414 (calls leagueWeek/leagueValues/payRoyalties) | Royalties are not a printer in regulated runs: under closedEconomy every royalty coin comes from the treasury, cut pro rata. Only a documentation gap remains (name royaltyFunding in the regulated preset). |
| Weekly passes and tickets | step 1420-1424 | Weekly passes and tickets are an equal, plain quantity; bots set their prices. |
| Band outside collectors (old) | step 1462 | Legacy band outside collectors never run in default or Realism configs (the destruction bug is listed separately). |
| Old liquidation asks | step 1463 | Legacy liquidation asks run only when liquidation is not 'auction'. |
| Discount forced sale (old) | step 1465-1466 | Legacy discount forced sale runs only when selected (retirement is listed separately). |
| Weekly step order (tail of step) | step, lines 1440-1480 | A fixed phase order within a week is a mechanism, not steering. |
| Neural thinking with median worth | step line 1445 (nnThink) | The median worth is information only (input x[4]). |
| Holding cost | step lines 1447-1449 | Holding costs go to the treasury as intended; the weekly wipe applies only outside closedEconomy. |
| Forced-sale bookkeeping | forceSale line 1520 | forceSale is pure bookkeeping; it moves no cash or cards. |
| Transfer outside the cross (xfer) | xfer lines 1521-1536 | Liquidator transfers are booked as outside flows; already settled. |
| Value dealers' weekly budget | valueCollectors lines 1579, 1591, 1596 | The dealers' weekly budget is a disclosed quantity of external demand. |
| Dealers' read of value (hidden F, lagged) | valueCollectors lines 1585-1587 | Dealers read the guide or last week's Fpub, a disclosed public value. |
| Public price guide | priceGuide lines 1569-1577 | The guide publishes last week's value with a lag of at least 1 week, not current hidden F. |
| Quote pull (priceRule 'quotes') | clear lines 1674-1679 | The quote pull runs only under priceRule 'quotes'; default and Realism use 'comps'. |
| Book mark (markRule 'book') | clear lines 1687-1689; bookMark 1693-1704 | Book marks use only bots' orders; house orders are filtered out. |
| Player implied price | impliedPrices (called at line 1690) | The implied player price is a read-only aggregate of marks (its weight constant is listed separately). |
| Limit and book summaries | limitsSummary / bookSummary lines 1756-1768 | Limit and book summaries are measurement only. |
| Tactic tracker | tk... / tacProfile / tacticTrack lines 1805-1915 | The tactic tracker profiles only rule bots and never reads F. |
| Generation-end royalty lump and yield log | generationEnd 1977-1980 | The generation-end royalty lump runs only with royaltyEvery 'generation'; default is weekly. |
| Parent list for offspring entrants | generationEnd 1994 | The parent list is the top evolveShare by fitness, a disclosed quantity. |
| Old capPoorest rule | generationEnd 2012-2015 | capPoorest is off by default and disclosed. |
| Family bubble and holdings helpers | famBubble 2223-2227, holdings 2228-2232 | holdings() is dead code and famBubble() is used only by fashionStep; the government cannot reach either. |
| Rookie arrivals | leagueSeasonEnd 2373-2384 | Rookie arrivals follow disclosed, measured rules. |
| Hidden value formula (league) | leagueValues 2428-2464 | The league hidden-value formula is the site's disclosed formula. |
| OVR from rank within position | leagueValues 2439-2451 | OVR from rank within position matches src/config/ovr.ts. |
| Hidden value formula F | leagueValues 2453-2461 | The hidden value formula matches the site's rules; nothing hidden. |
| Public era record includes the hidden value | leagueValues 2462; fillLeague 2479 | The era record stores the hidden value, but nothing reaches a bot or the government through it today. |
| Population floor | peopleChange 2635 | populationFloor defaults to 0 and is documented (the spec should still assert it is 0). |
| Fashion drift and scripted hype jumps | fashionStep 2655-2666 | Fashion drift does not run in the regulated configuration. |
| Price-only opening price | openingPrice 2676 | openingPrice runs only under priceOnly, which defaults to false. |
| Player and bot detail panels | playerDetail 2793-2802; botDetail 2803-2812 | Detail panels feed the owner's page, not bots or the government (keep them off the state whitelist). |

## Appendix: all 271 forces

As inventoried, in engine order by auditor slice. Kind and basis as defined in section 1. A force appears in section 5 or 6 when it was flagged for verification (202 of 271).

| # | Name | Where | Kind | Basis |
|---:|---|---|---|---|
| 1 | Single shared random stream | seeded() 237-244; createWorld 251, W.gauss 268, W.pick 269 | measurement | n/a |
| 2 | Module-level state shared across worlds | createWorld 253, 294; practiceMany 324; packCache/packCacheT 475; bids/asks 542 (read by realValue 349) | hidden-behaviour | n/a |
| 3 | Hidden value initialisation and floor | createWorld 274-275 | data | real-data |
| 4 | Copies in circulation per player (S0) | createWorld 274 | quantity | undisclosed-assumption |
| 5 | Unminted pool | createWorld 275 (pool = S0 × poolMultiplier); mintCopy 465 | quantity | undisclosed-assumption |
| 6 | Practice season before the open | createWorld 285-295 | mechanism | owner-assumption-disclosed |
| 7 | Practice on several worlds | practiceMany 306-325 | mechanism | owner-assumption-disclosed |
| 8 | Starting endowment | createWorld 296 -> endow 2680-2684 | mechanism | owner-assumption-disclosed |
| 9 | AI bot entry basket minted free | addAiBot 329-338 | mechanism | owner-assumption-disclosed |
| 10 | AI bot lifespan draw | addAiBot 331 (aiLifespanWeeks [40, 80]) | quantity | undisclosed-assumption |
| 11 | Thief flags block trading | blocked 341 | mechanism | owner-assumption-disclosed |
| 12 | Fitness valuation (realValue) | realValue 347-355 | measurement | owner-assumption-disclosed |
| 13 | Worth with concentration haircut | worth 357-364 | factor | undisclosed-assumption |
| 14 | Note freshness and rarity scaling | fresh/estimate/est 365-369 | factor | owner-assumption-disclosed |
| 15 | Memory cap on notes | writeNote 384-390 (memoryCap 25) | wall | undisclosed-assumption |
| 16 | Research reveals hidden value through noise | research 391-398 | factor | undisclosed-assumption |
| 17 | Research page leaks hidden value through riskRating | libraryPage 376-383 (riskRating 2700-2703, walkVol 2704) | hidden-behaviour | n/a |
| 18 | Research page shows the value formula's inputs | libraryPage 378-382 | other | real-data |
| 19 | Research pass use and weekly research cap | usePass 399; passPhase 646-659 | wall | owner-assumption-disclosed |
| 20 | Site rarity tables | 406-423 (FINISH_MULT, DESIGN_MULT, PACK_TYPES, STACK, COMBO_AUTO_LEG_HOLO, KIT_BONUS, PRIZM, AUTO_PAR, INKS, INSCRIBE, THROWBACK, serialMult) | data | real-data |
| 21 | Card tier from Career Legacy and OVR | tierOf 426 | data | real-data |
| 22 | Copy rarity roll | rollCopy 429-440 | mechanism | real-data |
| 23 | Autograph roll | rollAuto 441-450 | mechanism | real-data |
| 24 | Copy value multiplier | copyMult 452-455 | factor | real-data |
| 25 | Minting | mintCopy 462-470 | mechanism | n/a |
| 26 | Items marked by multiplier, not their own trades | markItem 472; intrinsicItem 473 | factor | real-data |
| 27 | Pack expected value and posted price | packInfo 476-496 | factor | derived |
| 28 | Pack draw by pool weight with tier fallback | drawPlayer 497 | mechanism | real-data |
| 29 | Pack bid | buyPack 500-504 | mechanism | n/a |
| 30 | Pack release and uniform-price auction | packAuction 507-518 | quantity | undisclosed-assumption |
| 31 | Opening a pack | ripPack 519-539 | mechanism | real-data |
| 32 | Bot classification and wealth groups | ARCH, GROUPS, OVR_BANDS 218-234 | measurement | n/a |
| 33 | Starting cash and other untagged base quantities | DEFAULTS 17-28 (startCash 20000, passesPerWeek 3, passLife 1, knowledgeWeeks 12, memoryCap 25) | quantity | undisclosed-assumption |
| 34 | Realism preset key aliases | page/ui.js 7-15 vs DEFAULTS 181, 197 | other | n/a |
| 35 | Pack expected value (pricing reference) | packInfo, engine.mjs 476-496 | factor | real-data |
| 36 | Pack supply and uniform-price pack auction | packAuction, engine.mjs 507-518 | mechanism | owner-assumption-disclosed |
| 37 | Pack bid = multiplier × last clearing price | buyPack, engine.mjs 500-504 | mechanism | n/a |
| 38 | Pack revenue goes into W.treasury | ripPack, engine.mjs 522 | mechanism | n/a |
| 39 | Pack minting from the finite pool, with the site's pull guarantees | ripPack 524-535, drawPlayer 497, mintCopy 462-470 | factor | real-data |
| 40 | Per-pull cost basis | ripPack 534-535 | measurement | n/a |
| 41 | Bid helper: cash check and position limit | bid, engine.mjs 543-549 | wall | n/a |
| 42 | Ask helper: no naked selling | ask, engine.mjs 551 | wall | n/a |
| 43 | Attention set: which cards a bot considers | sample 552; hot list (built at 1443); researchWish 994; act 1000 | wall | undisclosed-assumption |
| 44 | Note sharing and theft timing (rule and NN bots) | socialPhase, engine.mjs 556-574 | scripted-outcome | undisclosed-assumption |
| 45 | Note swap | swap, engine.mjs 575-587 | mechanism | undisclosed-assumption |
| 46 | Note theft, detection and gossip | steal, engine.mjs 588-603 | mechanism | owner-assumption-disclosed |
| 47 | Note memory cap | trimNotes 604 | quantity | owner-assumption-disclosed |
| 48 | Pass and ticket call auction | tokenMarket, engine.mjs 609-644 | mechanism | n/a |
| 49 | AI token order size cap | tokenMarket 618 | wall | undisclosed-assumption |
| 50 | Research: hidden value seen through noise (NN and rule bots) | passPhase 656 calling research() at 391-397 | factor | owner-assumption-disclosed |
| 51 | AI research: library page leaks hidden value through riskRating | passPhase 650-653 calling libraryPage 376-390, riskRating 2700-2703 | hidden-behaviour | n/a |
| 52 | Auction listing (cards and one-of-a-kind items) | listAuction 663-670, listItem 672-680, AI listings 719 | mechanism | undisclosed-assumption |
| 53 | Sealed bids: item bid scaled by the site's rarity premium | auctionPhase 688-694 | factor | real-data |
| 54 | Second-price settlement and re-marking | auctionPhase 698-706 | mechanism | n/a |
| 55 | Liquidator proceeds leave the economy | auctionPhase 706 | mechanism | n/a |
| 56 | Liquidator listings | auctionPhase 724-730 | quantity | owner-assumption-disclosed |
| 57 | Genome rule-bot listings | ruleAuctionList 1035-1039, called at 721 | scripted-outcome | undisclosed-assumption |
| 58 | Fire-sale and auction statistics | auctionPhase 684-685, 703 | measurement | n/a |
| 59 | Realized P&L falls back to hidden value | sellLot 742-748 | measurement | n/a |
| 60 | Contest generation | makeContest 785-801, publishContests 804 | mechanism | real-data |
| 61 | Contest scoring (valuation scored on hidden F) | scoreOf 808-822 | mechanism | owner-assumption-disclosed |
| 62 | Valuation score feedback leaks F to AI bots | gamePhase 910 (gameResults with score) → AI observation 2158 (lastWeek) | hidden-behaviour | n/a |
| 63 | How NN bots answer contests is scripted | ruleAnswers 825-841, used for every non-AI bot at 885 | scripted-outcome | undisclosed-assumption |
| 64 | Contest payout: share of entrants paid | payout 860-872, GAMES.paid 760-770 | quantity | undisclosed-assumption |
| 65 | House prize pool is minted coins | gamePhase 900-906, payout 862-863 | mechanism | n/a |
| 66 | Duel pairing and the unpaired refund | gamePhase 891-899 | mechanism | n/a |
| 67 | Prediction league settlement | gamePhase 887, 908-909 | mechanism | n/a |
| 68 | Game stake and coinScale disclosure | DEFAULTS 16, 113; gamePhase 883-884 | quantity | owner-assumption-disclosed |
| 69 | Genome bots' entries, ticket wish and topic choice | ruleEntries 848-852, ticketWish 914-919, bestTopic 842-846 | scripted-outcome | undisclosed-assumption |
| 70 | Genome strategy, mutation and collector targets | randomGenome 939-948, mutate 949-959, collectorTargets 938, signals/scoreCard/researchWish/act 976-1000 | hidden-behaviour | undisclosed-assumption |
| 71 | New bot creation | newBot 960-973 | factor | owner-assumption-disclosed |
| 72 | Tactic tracker hooks | tkAdd/tkTrade calls at 523, 665, 675, 693, 699; sellLot 744 | measurement | n/a |
| 73 | newBot starting cash and social inheritance | newBot 960-973 | factor | owner-assumption-disclosed |
| 74 | Rule-bot signals and score | signals/scoreCard 976-985 | hidden-behaviour | undisclosed-assumption |
| 75 | Rule-bot researchWish | researchWish 989-995 | hidden-behaviour | undisclosed-assumption |
| 76 | Rule-bot act() trading script | act 997-1027 | scripted-outcome | undisclosed-assumption |
| 77 | Rule-bot auction bid and list rules | ruleAuctionBid/ruleAuctionList 1029-1039 | scripted-outcome | undisclosed-assumption |
| 78 | Card network inputs: public market data | cardInputs 1135-1150 | mechanism | derived |
| 79 | Card input: research note vs price (noisy hidden F) | cardInputs 1142 (x12-x15); research() 380 for kind 'rule', which includes NN bots | hidden-behaviour | owner-assumption-disclosed |
| 80 | Card input: royalty yield from note | cardInputs 1146 (x27) | measurement | derived |
| 81 | Card input: royalty paid last generation (reveals F) | cardInputs 1148 (x32); payRoyalties 1727-1728 | hidden-behaviour | derived |
| 82 | Card input: league news | cardInputs 1151-1155 (x36-x40) | data | measured-from-save |
| 83 | Card input: price guide | cardInputs 1156-1157; priceGuide 1570-1576 | hidden-behaviour | owner-assumption-disclosed |
| 84 | Card input: bot's own life left | cardInputs 1147 (x28); nnThink 1172-1173 | factor | owner-assumption-disclosed |
| 85 | Network forward pass, fold cache and fast tanh | forward/foldFor/forwardCard/fastTanh 1066-1096 | mechanism | derived |
| 86 | Network initialization and mutation | randomNet 1064; mutateBrain 1125-1129; widenCard 1106-1114 | factor | undisclosed-assumption |
| 87 | startBias | startBias 1117-1123 | factor | owner-assumption-disclosed |
| 88 | Bot network inputs (balance sheet, world, config) | nnThink 1162-1177 | mechanism | derived |
| 89 | Cash target output | nnThink 1180 | wall | owner-assumption-disclosed |
| 90 | Lend share wall ×0.7 | nnThink 1180 | wall | undisclosed-assumption |
| 91 | Leverage wall ×1.5 | nnThink 1180; creditMarket 1295 | wall | undisclosed-assumption |
| 92 | Loan-rate mapping | nnThink 1180; nnRate 1194 | factor | owner-assumption-disclosed |
| 93 | Pass and ticket price walls | nnThink 1183 | wall | undisclosed-assumption |
| 94 | Research count output | nnThink 1184; nnResearchWish 1196-1201 | wall | owner-assumption-disclosed |
| 95 | Pack count thresholds (2 per type) | nnThink 1185; nnAct 1217-1218 | wall | undisclosed-assumption |
| 96 | Social style and swap acceptance outputs | nnThink 1186 | mechanism | derived |
| 97 | Pack bid multiplier | nnThink 1190; buyPack 500-504 | factor | owner-assumption-disclosed |
| 98 | Game entry and quit outputs | nnThink 1188, 1191 | mechanism | derived |
| 99 | NN buy and sell decision | nnAct 1206-1210 | mechanism | derived |
| 100 | NN auction listing and shorting thresholds | nnAct 1211-1212, 1216 | wall | owner-assumption-disclosed |
| 101 | Buy-order deployment and cash budget | nnAct 1214-1215 | wall | owner-assumption-disclosed |
| 102 | Pack purchase cash floor | nnAct 1218 | hidden-behaviour | undisclosed-assumption |
| 103 | nnPrice: anchor to the guide, the estimate and the offset | nnPrice 1225-1232 | factor | owner-assumption-disclosed |
| 104 | nnAuctionBid | nnAuctionBid 1233; caller 692 | mechanism | derived |
| 105 | nnSensitivity | nnSensitivity 1236-1246 | measurement | derived |
| 106 | Random names | randomName 1248-1253 | other | n/a |
| 107 | holdingsValue (collateral) with an item haircut | holdingsValue 1260 | quantity | undisclosed-assumption |
| 108 | Loan interest and capitalization | creditMarket 1267-1269 | mechanism | derived |
| 109 | Maturity, late roll and default after 3 late weeks | creditMarket 1270, 1276 | mechanism | owner-assumption-disclosed |
| 110 | Default: collateral goes to the liquidator, not lenders | creditMarket 1276-1281; toLiq 2901; auction settlement 706 | mechanism | undisclosed-assumption |
| 111 | Margin call | creditMarket 1283 | factor | owner-assumption-disclosed |
| 112 | Credit call auction | creditMarket 1286-1309 | mechanism | derived |
| 113 | Living costs (money sink, not to treasury) | livingAndCredit 1314-1322 | factor | owner-assumption-disclosed |
| 114 | Unpaid bills become a forced sale whose shortfall is forgiven | livingAndCredit 1321; holdCost 1449; cashShocks 1451; wealthTax 1434; forcedSales 1604-1619; 1473 | hidden-behaviour | undisclosed-assumption |
| 115 | AI loan repayment | livingAndCredit 1325 | mechanism | derived |
| 116 | genomeMix | genomeMix 1329-1334 | measurement | derived |
| 117 | AI bot action caps | setActions 1339-1375; aiOrders 1388-1396 | wall | undisclosed-assumption |
| 118 | AI pack bid fixed at the last clearing price | aiOrders 1390; buyPack 500-504 | hidden-behaviour | undisclosed-assumption |
| 119 | AI orders: free price, no budget | aiOrders 1391-1395; bid 543-549 | mechanism | derived |
| 120 | AI notes written from its own analysis | setActions 1371; writeNote 384 | mechanism | derived |
| 121 | Public board and direct messages | setActions 1357-1367 | mechanism | owner-assumption-disclosed |
| 122 | AI note sharing accepted by code for NN partners | aiSocial 1376-1387 | hidden-behaviour | undisclosed-assumption |
| 123 | Per-week resets and Fpub | step 1401-1403 | hidden-behaviour | owner-assumption-disclosed |
| 124 | Season loss of cards (lossRate) | step 1406-1409 | factor | owner-assumption-disclosed |
| 125 | Value model and weekly royalties | step 1410-1414 (calls leagueWeek/leagueValues/payRoyalties) | mechanism | measured-from-save |
| 126 | Weekly passes and tickets | step 1420-1424 | factor | owner-assumption-disclosed |
| 127 | Allowance and treasury wipe | step 1425-1431 | mechanism | owner-assumption-disclosed |
| 128 | Wealth tax | step 1432-1438 | factor | owner-assumption-disclosed |
| 129 | Market mood (drawdown) | step 1440; marketCtx 1131-1134 | measurement | derived |
| 130 | Hot list | step 1443 | mechanism | undisclosed-assumption |
| 131 | holdCost | step 1447-1449 | factor | owner-assumption-disclosed |
| 132 | Cash shocks | step 1450-1451 | factor | owner-assumption-disclosed |
| 133 | Bot order: biased random shuffle | step 1459-1460 | other | undisclosed-assumption |
| 134 | Band outside collectors (old) | step 1462 | hidden-behaviour | undisclosed-assumption |
| 135 | Old liquidation asks | step 1463 | mechanism | owner-assumption-disclosed |
| 136 | Discount forced sale (old) | step 1465-1466 | scripted-outcome | owner-assumption-disclosed |
| 137 | Forced proceeds go to the lender | step 1473 | mechanism | derived |
| 138 | Weekly bookkeeping, learning, generations, AI succession | step 1474-1479 | mechanism | owner-assumption-disclosed |
| 139 | Weekly step order (tail of step) | step, lines 1440-1480 | mechanism | n/a |
| 140 | Market drawdown mood | step line 1440 (mood.drop), used at 982, 1004, 1133 | quantity | undisclosed-assumption |
| 141 | Hot-card attention list | step line 1443; consumers at 994, 1000, 1018 | mechanism | undisclosed-assumption |
| 142 | Neural thinking with median worth | step line 1445 (nnThink) | mechanism | n/a |
| 143 | Holding cost | step lines 1447-1449 | factor | owner-assumption-disclosed |
| 144 | Biased order of bots placing orders | step line 1459 | hidden-behaviour | n/a |
| 145 | Band outside bids (legacy outsideMode 'band') | step line 1462; clear line 1652 | mechanism | undisclosed-assumption |
| 146 | Old liquidator asks (cutWhenUnsold / chase) | step line 1463; liqCut 2903 | mechanism | owner-assumption-disclosed |
| 147 | Discount forced sale (legacy) | step lines 1465-1466 | scripted-outcome | undisclosed-assumption |
| 148 | Margin repayment sweeps all cash | step line 1473 | hidden-behaviour | n/a |
| 149 | Worth history and exogenous-money history | step line 1474 | measurement | n/a |
| 150 | AI bot succession | step line 1478; aiSuccession 2688 | factor | owner-assumption-disclosed |
| 151 | Comparable-sales mark | compsMark lines 1488-1495 | mechanism | real-data |
| 152 | Why-trade attribution | tradeWhy / noteWhy lines 1498-1508 | measurement | n/a |
| 153 | Repeat-sales chains (Vault index) | noteTrade lines 1514-1518 | measurement | undisclosed-assumption |
| 154 | Forced-sale bookkeeping | forceSale line 1520 | mechanism | n/a |
| 155 | Transfer outside the cross (xfer) | xfer lines 1521-1536 | mechanism | owner-assumption-disclosed |
| 156 | Budget outside collectors (outsideMode 'budget') | outsideFlow lines 1541-1558 | mechanism | owner-assumption-disclosed |
| 157 | Value dealers' weekly budget | valueCollectors lines 1579, 1591, 1596 | quantity | owner-assumption-disclosed |
| 158 | Dealers' starting stock | valueCollectors lines 1582-1583 | mechanism | undisclosed-assumption |
| 159 | Dealers' read of value (hidden F, lagged) | valueCollectors lines 1585-1587 | mechanism | owner-assumption-disclosed |
| 160 | Changing the dealer count mid-run | valueCollectors lines 1580-1581 | hidden-behaviour | n/a |
| 161 | Dealers trade both ways | valueCollectors lines 1593-1600 | mechanism | owner-assumption-disclosed |
| 162 | Public price guide | priceGuide lines 1569-1577 | mechanism | owner-assumption-disclosed |
| 163 | Forced sales into the book | forcedSales lines 1604-1618 | mechanism | n/a |
| 164 | Weekly call auction (clear) | clear lines 1620-1661 | mechanism | n/a |
| 165 | Vault store | clear line 1631; xfer 1528; 1650 | mechanism | owner-assumption-disclosed |
| 166 | Standing-book diagnostics and public book | clear lines 1634-1635, 1663-1673 | measurement | n/a |
| 167 | Trade arcs sampling uses world RNG | clear line 1657 | hidden-behaviour | n/a |
| 168 | Quote pull (priceRule 'quotes') | clear lines 1674-1679 | mechanism | owner-assumption-disclosed |
| 169 | Book mark (markRule 'book') | clear lines 1687-1689; bookMark 1693-1704 | mechanism | owner-assumption-disclosed |
| 170 | Player implied price | impliedPrices (called at line 1690) | measurement | n/a |
| 171 | Test league updates | leagueUpdate lines 1705-1711 | scripted-outcome | undisclosed-assumption |
| 172 | Royalties (amount and funding) | payRoyalties lines 1715-1724 | factor | owner-assumption-disclosed |
| 173 | Royalty signal reveals hidden F | payRoyalties lines 1726-1727; card input x[32] at line 1148 | mechanism | derived |
| 174 | Learning within a lifetime (adapt) | adaptStep lines 1733-1750 | mechanism | owner-assumption-disclosed |
| 175 | Limit and book summaries | limitsSummary / bookSummary lines 1756-1768 | measurement | n/a |
| 176 | Strategy clusters and probe cards | prng / probeCards / strategyClusters lines 1770-1798 | measurement | n/a |
| 177 | Tactic tracker | tk... / tacProfile / tacticTrack lines 1805-1915 | measurement | n/a |
| 178 | Exit diagnostics | noteExit line 1917 | measurement | n/a |
| 179 | Generation diagnostics | genDiag lines 1919-1950 | measurement | n/a |
| 180 | Fitness sharing | sharedFitness lines 1954-1960 | factor | measured-from-save |
| 181 | Generation diagnostics (persistence, crowding, network distance, clusters, response distance, adapt stats, quit wish, next top 10%) | genDiag 1919-1951 | measurement | derived |
| 182 | Newcomer cash minting | newcomer 1962-1968 | quantity | undisclosed-assumption |
| 183 | Generation IO tally | genIOClose 1969-1974 | measurement | derived |
| 184 | Generation-end royalty lump and yield log | generationEnd 1977-1980 | mechanism | owner-assumption-disclosed |
| 185 | Fitness = return net of allowance and living costs only | generationEnd 1984-1986; exo set at 1319 (living) and 1430 (allowance) | mechanism | derived |
| 186 | Return persistence measurement | generationEnd 1987-1990 | measurement | derived |
| 187 | Parent list for offspring entrants | generationEnd 1994 | mechanism | owner-assumption-disclosed |
| 188 | Evolution: worst copy best | generationEnd 1995-2001 | mechanism | owner-assumption-disclosed |
| 189 | Mortality and heirs | generationEnd 2002-2011 | factor | undisclosed-assumption |
| 190 | Estate sale (forced partial liquidation at death) | generationEnd 2008-2010; estateSale 2025-2031 | factor | undisclosed-assumption |
| 191 | Old capPoorest rule | generationEnd 2012-2015 | wall | owner-assumption-disclosed |
| 192 | Generation start reset | generationEnd 2018 | measurement | derived |
| 193 | Estate settlement: hidden value F as fallback cost basis | settleEstate 2037 | hidden-behaviour | derived |
| 194 | Estate settlement: social state and debt inheritance | settleEstate 2035, 2039-2046 | mechanism | owner-assumption-disclosed |
| 195 | Bot exit: cash destroyed, loans forgiven or defaulted, cards to the liquidator | removeBot 2050-2063 | mechanism | owner-assumption-disclosed |
| 196 | Crash, rally, bubble and corner detectors (event log) | detect 2064-2081 | measurement | undisclosed-assumption |
| 197 | Repeat-sales Vault index | repeatSales 2089-2105 | measurement | undisclosed-assumption |
| 198 | Index and bubble helpers | idx 2106, bubble 2107, gini 2108 | measurement | derived |
| 199 | Weekly record and money-flow tags | record 2109-2132 | measurement | derived |
| 200 | AI-bot observation | observe 2136-2163 | measurement | derived |
| 201 | Summary for the runner | summary 2165-2168 | measurement | derived |
| 202 | Weekly frame | frame 2172-2220 | measurement | derived |
| 203 | Family bubble and holdings helpers | famBubble 2223-2227, holdings 2228-2232 | measurement | derived |
| 204 | Market stats, movers | marketStats 2242-2247, movers 2248-2252 | measurement | derived |
| 205 | League Score formula | lgProduction 2265-2272, lgAwards 2273, lgScore 2274 | factor | real-data |
| 206 | Library stat mapping | libTotals 2276-2280, LIB_NAMES/libStats 2281-2282, lgStage 2283 | data | real-data |
| 207 | Poisson draw | poisson1 2284 | other | derived |
| 208 | League start: per-game rates, form window, career length | leagueStart 2286-2300 | data | real-data |
| 209 | Random entry ages for real players | leagueStart 2298, lgAge 2317 | factor | undisclosed-assumption |
| 210 | Injuries | leagueInjuries 2303-2316 | factor | real-data |
| 211 | Weekly game simulation | lgGame 2319, leagueWeek 2321-2335 | factor | undisclosed-assumption |
| 212 | Super Bowl champion | leagueSeasonEnd 2343-2347 | factor | owner-assumption-disclosed |
| 213 | MVP, OPOY, DPOY | leagueSeasonEnd 2349-2354 | factor | real-data |
| 214 | Retirement | leagueSeasonEnd 2357-2372 | factor | real-data |
| 215 | Rookie arrivals | leagueSeasonEnd 2373-2384 | quantity | real-data |
| 216 | Hall of Fame induction | leagueSeasonEnd 2387 | factor | real-data |
| 217 | Form swing and the pressure channel | leagueSeasonEnd 2389-2395 | factor | measured-from-save |
| 218 | Rookie creation and print run | addRookie 2400-2407, leaguePlayer 2410-2426 | quantity | undisclosed-assumption |
| 219 | Rookie card prices opened at hidden value | leagueValues 2462 → resetMarkets 2739 | scripted-outcome | derived |
| 220 | Hidden value formula (league) | leagueValues 2428-2464 | factor | real-data |
| 221 | Fitness at selling value (realValue) used in this slice | generationEnd 1986 calls realValue (347-357) | mechanism | undisclosed-assumption |
| 222 | Rookie card markets created | addRookie 2400-2407 | mechanism | derived |
| 223 | Rookie first-season rates from a random real early season | leaguePlayer 2410-2416 | data | measured-from-save |
| 224 | Rookie inherits the template player's skill and grade; OVR 62 placeholder | leaguePlayer 2417 | quantity | undisclosed-assumption |
| 225 | Rookie print run = median S0 at his position | leaguePlayer 2419-2420 | quantity | derived |
| 226 | Rookie age draw with a fallback of 23 | leaguePlayer 2422-2423 | data | real-data |
| 227 | Form window starts at the template pace | leaguePlayer 2421-2423 | mechanism | derived |
| 228 | Opening blend from career OVR to form OVR over 2 seasons | leagueValues 2436, 2451 | factor | undisclosed-assumption |
| 229 | OVR from rank within position | leagueValues 2439-2451 | factor | derived |
| 230 | Hidden value formula F | leagueValues 2453-2461 | factor | derived |
| 231 | Public era record includes the hidden value | leagueValues 2462; fillLeague 2479 | measurement | derived |
| 232 | formRatio and injured flag (public news) | leagueValues 2450, 2462 | measurement | derived |
| 233 | Money follows the cards (fillK) | fillLeague 2481 | factor | derived |
| 234 | Fill rosters to rosterSize | fillRosters 2486-2494 | mechanism | derived |
| 235 | Generated veteran burn-in | veteran 2498-2516 | mechanism | measured-from-save |
| 236 | Dormancy (skip retired, untouched players) | dormancy 2522-2536 | measurement | n/a |
| 237 | Wake backfill | wakePlayer 2540-2547 | measurement | n/a |
| 238 | Real seasons replayed | eraFrom 2554-2558; nextSeason 2590-2597 | data | real-data |
| 239 | Real season-to-season ratios | realRatios 2559-2567 | data | measured-from-save |
| 240 | PULL mean reversion toward the last real value | PULL 2570; nextSeason 2603-2606 | scripted-outcome | undisclosed-assumption |
| 241 | Print run 40 / sqrt(value / 100) | startTimeline 2580; nextSeason 2596 (also line 274) | quantity | undisclosed-assumption |
| 242 | Past-save value modes | nextSeason 2598-2602 | mechanism | derived |
| 243 | Newcomer arrivals (rate, hype, word of mouth) | peopleChange 2619-2626; botReturn11 2621 | factor | owner-assumption-disclosed |
| 244 | Network quit rule | peopleChange 2630-2633 | mechanism | owner-assumption-disclosed |
| 245 | Population floor | peopleChange 2635 | mechanism | owner-assumption-disclosed |
| 246 | Only rule and NN bots turn over | peopleChange 2628 | mechanism | n/a |
| 247 | Lender cycle (dead code) | lenderCycle 2641-2651 | other | n/a |
| 248 | Fashion drift and scripted hype jumps | fashionStep 2655-2666 | scripted-outcome | undisclosed-assumption |
| 249 | Lineage stats | lineageStats 2669-2673 | measurement | n/a |
| 250 | Price-only opening price | openingPrice 2676 | quantity | undisclosed-assumption |
| 251 | Starting endowment | endow 2680-2684 | mechanism | derived |
| 252 | AI bot succession | aiSuccession 2688-2696 | mechanism | owner-assumption-disclosed |
| 253 | Risk rating encodes the hidden value trend | riskRating 2700-2703; walkVol 2704; riskOf 2790 | hidden-behaviour | derived |
| 254 | OVR walk with an upward bias | ovrWalk 2718-2725 | scripted-outcome | owner-assumption-disclosed |
| 255 | Factor value model | factorValues 2707-2717 | factor | owner-assumption-disclosed |
| 256 | Card market rarity multipliers | makeMarket 2730-2738 | factor | derived |
| 257 | Imported price history | seedHistory 2741-2750 | data | real-data |
| 258 | Implied player price | impliedPrices 2752-2761 | measurement | undisclosed-assumption |
| 259 | Wealth groups and OVR bands | assignGroups 2768-2771; avgOvrOf 2773-2777; bandHoldings 2785-2789 | measurement | n/a |
| 260 | Band bubble: price / hidden value per band | bandBubble 2779-2783; frame.bands line 2201 | measurement | derived |
| 261 | Top cards with intrinsic value | topCards 2828-2835; frame.top line 2199 | measurement | derived |
| 262 | Player and bot detail panels | playerDetail 2793-2802; botDetail 2803-2812 | measurement | n/a |
| 263 | Thief flags lift | liftFlags 2815-2824 | factor | owner-assumption-disclosed |
| 264 | Lendable pool | lendPool 2847-2850; lendShareOf 2846 | mechanism | n/a |
| 265 | Borrower matched to the first lender in bot order | borrowCard 2851-2859 | hidden-behaviour | n/a |
| 266 | Fixed card lending fee | shortUpkeep 2876-2877 | factor | owner-assumption-disclosed |
| 267 | Forced short cover with hard-coded prices | shortUpkeep 2878-2881 | scripted-outcome | undisclosed-assumption |
| 268 | Loan close when the lender has left: money to the treasury, uncapped | closeLoan 2861-2872 (2865); called from removeBot 2059 | mechanism | n/a |
| 269 | Auto-return of copies a short seller holds | settleShorts 2886-2896 | wall | n/a |
| 270 | AI bot short orders | shortUpkeep 2883 | mechanism | n/a |
| 271 | Liquidator asks | toLiq 2901; liqAsk 2902; liqCut 2903-2907 | factor | owner-assumption-disclosed |
