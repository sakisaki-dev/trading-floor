# Changelog

All notable changes to the engine are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Versioning rule.** The engine version goes up whenever a change can alter results: any change to `engine.mjs`,
to a preset in `configs/`, or to the files in `data/` that changes a frame for some seed and settings. A change
that only adds measurement (a new frame field that nothing in the world reads) or touches documentation, the page or
tooling does not change the version, as long as every existing frame field is unchanged. Major: a change to the
default results of the Realism preset. Minor: a new setting whose default leaves results unchanged. Patch: a fix that
changes results only where the bug occurred.

Versions before 1.0.0 were not tagged at the time. They are assigned here to the development rounds in
`docs/DEVLOG.md`, with the commit that closed each round.

## [Unreleased]

### Bots decide for themselves (fix/nets, AUDIT.md 5b)

Decisions that code made for neural bots now come from their own networks. Default and Realism results change; the
bot network has six more outputs (47), and a network with the older 41 outputs is widened on load.

- Notes: a neural bot steals when its 'steal notes' output is above 0 and offers a swap when 'share notes' is above 0
  (no 0.5 and 0.4 draws); six new outputs weigh what it sees of each other bot (friend, public flags, weeks in the
  market) to pick the partner or victim; nothing filters candidates by the notes they hold. Every swap is accepted
  through the partner's own decision-maker, AI-offered swaps included (`willing`).
- Contests: neural bots' answers are computed from their notes (research notes now keep the page's rates, totals,
  Career Legacy and family through the same error as the value estimate) and public prices; the price prediction is
  the card network's `sigmoid(buy − sell)`. No coin-flip accuracy curves. Genome bots keep `ruleAnswers`.
- Pass and ticket prices under `priceMap: 'log'` are the last clearing price × exp(output), with no 30 / 15 / 10 /
  5-coin wall. The call auction matches only pairs that can settle, so its price comes from one that did.
- Packs spend the same spare cash (above the cash target) as card bids; the separate `keep × worth × 0.5` brake is
  gone. AI pack orders may name a price.
- Forced sales use one order, the network's (or `forcedOrder: 'price'`), for the bid and auction stages; one-of-a-kind
  cards are ranked by the card network. Lenders are repaid only the margin-call and default share of what forced
  sales raised that week, not all of the borrower's cash.
- A called neural short seller bids its own network's price; `coverGraceWeeks` (3), `coverSettle` (1.1) and `coverBid`
  (1.15, genome and AI borrowers) are settings with page controls.
- The most-traded list is ranked by plain trade count (`hotRank: 'volume'`; `'momentum'` keeps the old tilt); its window
  and sizes are settings (`hotWeeks`, `hotResearch`, `hotOrders`, `hotBook`, `marketRows`), and AI bots can page it
  (`marketPage`).
- `formulaPull` (0.25) replaces the fixed PULL of the 'formula' value model.
- `tests/nets.test.mjs`: one targeted test per fix.

## [1.0.0] - 2026-11-07

Round 5 (commit `1487fd4`), moved to a stand-alone repository (`85ffd9a`). This is the state documented in
`docs/MODEL.md`.

### Changed
- The card network's arithmetic runs about 2.4 times faster (about 1.16 s against 2.8 s for a Realism week with 250
  bots). Every week's full frame hashes the same as before on the checked seeds and settings.
- The Realism preset grows the bots with the full league (`botScale: 'cards'`: 501 bots on seed 31761) and turns on
  all three entry factors (`entryHype`, `entryReturns`, `entryNews` at 1).
- `sim.mjs` runs worlds headless from a preset (`configs/realism.json`) and writes `run.json`.

### Added
- Attention budget (`attention`, `attentionMemory`, `attentionSample`): each neural bot scores only its holdings, its
  watchlist and K sampled cards a week. Off by default and in Realism.
- Newcomers after league news (`entryNews`), and a page control for `entryReturns`.
- `frame.entry`: the entry multiplier, its components and their raw signals (measurement only).
- A snapshot guard (`endSnap`) that throws if a price, quote, royalty or player's news changes during a phase that
  reads them from a snapshot.

## [0.4.0] - 2026-11-07

Round 4 (commit `4dfe307`).

### Added
- A full-size league (`leagueFill: 'full'`, `rosterSize`, `dormantAfter`): every club carries a 10-man roster of
  generated veterans built from measured data, ranked against the save's own players. Money and pack supply scale with
  the copies in circulation (`W.fillK`).
- Log-scale price and rate mappings (`priceMap: 'log'`, `rateMap: 'log'`) with only numerical safety bounds.
- `frame.limits`: how often network outputs sit at a wall or a weekly count (measurement only).
- The tactic tracker (`tactics`, `tacticMatch`, `tacticWindow`, `tacticKMax`; `frame.gen.tactics`;
  `tactics_report.mjs`).

### Changed
- The Realism preset switches on the full league and the widened limits: cash target up to 100% of worth, 40 buy
  orders, 10 listings, 30 short sales and 8 packs a week.

## [0.3.0] - 2026-11-07

Round 3 (commit `4dfe307`, shared with round 4).

### Fixed
- Marks: asks only pull a mark down and bids only push it up; a mark between the bid and ask levels holds
  (`bookMark`). The earlier fade let marks compound with no orders behind them.
- Vault index: auction sales pair only with auction sales and order-book trades with trades (`noteTrade`). Mixing
  the two made the index rise on flat prices.

### Changed
- Fire sales: an auction sale below `fireShare` (30%) of the card's mark the week before (`ord.aucFree`); the old
  count is kept as `ord.aucFreeOld`.
- The money ledger splits liquidator sales, the Vault store and outside sellers.

### Added
- Generation diagnostics in `frame.gen`: carry-over, descent from the top 10%, lineages, network and response
  distance, strategy clusters, learning follow-up, the quit output, exits by cause, age and worth.
- `frame.bookD`: the bots' own order book after the cross.
- Settings, all off by default: `entrants: 'offspring'`, `fitnessSharing`, `sharingRadius`, `populationFloor`,
  `practiceWorlds`, `adaptBar`, `entryReturns`.

## [0.2.0] - 2026-11-06

The simulated league and the Realism preset (commits `85a0bb2` to `4ea34d6`).

### Added
- A simulated league after the save's last real season (`valueModel: 'league'`), with rates measured from the save
  (`measure_league.mjs`) and age effects from real NFL rosters (`measure_nfl_age.mjs`).
- Comparable-sales marks and a repeat-sales Vault index.
- Weekly royalties from each game; outside value dealers; practice generations.
- Real-world frictions as settings: book marks and a marks index, holding costs, forced wealth tax, estate sales,
  cash shocks, a money ledger, fitness at selling value (`fitnessValue: 'bid'`).
- The health board (page only).
- A public price guide (`priceGuide`) with two card-network inputs and one output.
- Learning within a lifetime (`adapt`), card loss (`lossRate`), newcomers after rallies (`entryHype`).
- The Realism preset.

### Changed
- Six market mechanisms replace rules that scripted prices (`4c0270e`): value from data and supply, price = last
  trade, outside buyers with a budget, liquidator and forced sales at no-minimum auction, a uniform-price pack
  auction. The old rules remain as switches.
- Auction sales count as trades. A lone bidder pays its own bid.
- Trade fee 1% (was 4%); fitness over 6 generations (was 3).

## [0.1.0] - 2026-11-05

The prototype (commits `316e8cd` to `e640c34`).

### Added
- The rule-bot prototype; then a shared engine with research passes, notes, contests, sealed auctions and an LLM-bot
  runner.
- Living costs and bot-to-bot credit; strategy genomes; mortality with inheritance; fitness by return on capital.
- Neural bots (a card network and a bot network) as the default population.
- The site's real designs, finishes, kits, parallels and autographs at the site's pack odds; 16 card markets per
  player.
- Short selling and card lending.
