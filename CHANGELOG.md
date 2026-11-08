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

### Audit 5e: undisclosed assumptions (`fix/assume`)
- Every constant in AUDIT.md section 5e is now a named setting in `DEFAULTS` with a doc comment saying it is an
  assumption, at the value the code always used: the print run (`printRunK`, `printRunExp`, `printRunMin`,
  `printRunValueFloor`, `printRunUnit`, one `printRun` helper at all three sites), the concentration and item haircuts
  (`concentrationFree`, `concentrationSlope`, `itemHaircut`, shared by `worth`, `realValue` and `holdingsValue`),
  notes (`notesPerSwap`, `notesPerTheft`, `guardChance`), contest payouts (`gamePaid`), the rule bots' hot list
  (`hotVolWeeks`, `hotRetWeeks`, `hotFloor`), `moodWeeks`, the repeat-sales index (`rsMaxGap`, `rsWindow`, `rsClamp`,
  `rsSmooth`), `outsideSaveWeeks`, `newcomerCashSd`, the league (`lastSeasonMinGames`, `entryAgeFallback`,
  `injuryPoolMin`, `championWeight`, `awardWinner`, `rookieS0Fallback`, `rookieOvr`, `formBlendSeasons`),
  `impliedVolumeWeight` and the network scales (`nnResetScale`, `nnWidenScale`). Existing keys that were assumptions
  (`startCash`, `poolMultiplier`, `packsPerWeek`, `packMix`, `gameNoise`, `lifespan`, `aiLifespanWeeks`,
  `nnResearchError` and the pass and note limits) are labelled as such. `ASSUMPTIONS` lists them all.
- New options, off by default: `championWeight: 'equal'` and `nnResetScale: 'layer'`.
- The pack price's silent 7.36 fallback for the autograph mean multiplier is gone: a world fails at build without it.
- The page's Rules gain an Assumptions group (controls for the main ones and a list of every assumption with its
  running value); the Realism preset (`configs/realism.json` and the page) states the main ones at their values.
- `docs/MODEL.md` has an Assumptions table. Frames are byte-identical to 1.0.0 at defaults and on Realism.
### Fixed: mechanism bugs and walls (audit 5c and 5d, branch `fix/mech`)

Real fixes: default results change (a major version once merged). Tests: `node tests/mech.test.mjs` (one per fix);
`node tests/run_check.mjs` hashes every frame of a Realism run and scans it for NaN or Infinity.
- **Money and cards no longer created, destroyed or forgiven.** Unpaid bills (living costs, holding costs, the wealth
  tax, cash shocks) are owed by cause (`b.arrears`), count against worth, are collected from later cash and forced-sale
  proceeds and paid where the bill was going; only leavers are excused. A default's seized cards carry the lenders'
  unpaid claim and each liquidator sale pays them, the surplus to the borrower; a leaver repays from cash first. Only
  the proceeds of sales a margin call or loan default forced repay lenders (bills first). Dealers' starting stock comes
  from the unminted pool. Card lending fees and short sellers' royalties are paid from cash only (the shortfall is the
  lender's loss and calls the short). The house prize pool is paid from the treasury, capped at its balance. Packs are
  charged only for the copies they held; the pool is checked before a mint is counted. Pending predictions pass to
  heirs; a leaver's stakes are refunded. The wealth tax's forced sale (`wealthTaxForced`) now actually happens.
- **Matching and draws.** `clear()` matches each bid to the cheapest ask it may trade with and that can settle, with no
  shared cursor or swaps, so a bot's own ask or a cash-short buyer no longer removes liquidity. One seeded Fisher-Yates
  shuffle (`W.shuffle`) replaces the biased random-comparator sorts (bot order, duel pairs, imposter options, the rule
  bots' book) and the dealers' order is shuffled weekly. A short seller's lender is drawn by copies offered. Pack draws
  use the live pool and re-roll an exhausted tier with the pack's own odds; pack EV weights the kit premium by the clubs
  that have kits. Trade-arc sampling (display only) has its own random stream.
- **Walls widened or made costs.** Order size reaches `maxOrderQty`; packs reach `maxPacks` per type; research count
  is open (`passesPerWeek × exp(output)`, `maxResearchPerWeek` 60 only a safety bound); pass and ticket prices map
  around the last clearing price, the same way for bids and asks; lending up to all idle cash (`lendShareMax` 1);
  borrowing a share of `maxLTV` capacity; credit offers and requests above the 0.5-coin dust floor; notes forgotten by
  age, not count (`memoryCap` 0); the bid cash check is cumulative; retirement past 40 carries the pooled tail rate;
  AI bots get the neural bots' caps.
- **Settings and disclosure.** New: `wealthTaxThreshold`, `wealthTaxEvery`, `compsSource`, `quitMinWeeks`,
  `lendShareMax`, `coverBid`, `coverSettle`, `coverGraceWeeks`, `passOpen`, `ticketOpen`, `aiCaps` (page controls for
  the first eight and `memoryCap`). One spelling per setting: `priceGuide`, `cashShocks` and `adapt` objects are mapped
  onto the flat keys. Removed: `lenderCycle` (dead code) and `outsideMode: 'band'` (rejected). The value floor is
  0.05 × coinScale everywhere. New frame fields: `predPending`, `arrears`, `bookD.distUnit`; the money ledger adds
  "liquidator to lenders and borrowers".
- **Deferred to the government build:** per-subsystem random streams, per-world module state, `positionLimit` as a
  concentration tax.

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
