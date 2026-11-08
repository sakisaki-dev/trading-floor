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

### Hidden information and money accounting (fix/info; AUDIT.md 5a and 5f)

Real fixes: default results change. Tests: `node tests/info.test.mjs`.

- **Hidden value no longer reaches bots or prices except through disclosed channels.** Cards with no price yet
  (rookies at their first valuation, generated veterans at the open, save players entering a replayed season) open at
  comparable sales (new setting `openPrice`: 'comps' default, 'position', or 'value' for the old opening at `F`).
  Research pages carry the risk rating only under `valueModel: 'ovrWalk'`. Game results report won and net, no score.
  Vault store asks come from the guide or last week's public value (`storeAsk`; new setting `storeCopies`, 3). Cost
  bases never fall back to `F` (sellLot, settleEstate, addAiBot and the opening deal use prices). An AI bot's
  `otherBots` lists only bots it has dealt with, by name. The royalty channel is documented as a disclosed carrier of
  `F`. Researcher-only frame fields are listed in METRICS.md 8a.
- **Lots follow copies.** Estate-sale leftovers, lent-out and listed copies keep their cost through a death; a
  defaulter keeps the cost of copies it lent out; a lender paid in cash for a copy drops its lot; open auction listings
  pass to the heir, or to the liquidator when a bot leaves or defaults (before, the proceeds went to a bot no longer in
  the market).
- **Fitness booking (owner decision 2026-11-07).** One helper, `transfer()`, moves cash, the ledger and `b.exo`
  together. New setting `fitnessExo`: 'lumpSums' (default: allowance, wealth tax paid back, flat living cost, cash
  shocks are taken out of fitness; lifestyle, holding costs, wealth tax and fees count) or 'legacy'. A newcomer's
  opening cash is its starting capital (before, a newcomer's first-generation return ignored its trading).
- **A complete money ledger.** Every movement of the bots' money (cash plus short collateral) is tagged once at its
  source, so `money.other` is zero (it was about 2.6 million coins over 60 weeks on seed 31761). New tags: lifestyle,
  dealers buying and selling, game stakes and pots, card loans settled with leavers. Fixed double or missing bookings
  for liquidator auctions, refused transfers, order-book trades with the liquidator, store or outside buyers, royalties
  paid from the treasury, and leavers' collateral. The treasury keeps its own line ledger (`money.treasury`), including
  the weekly wipe outside a closed economy.
- **No debit below zero.** A card-loan settlement, the card-lending fee and a short seller's royalty pay at most the
  borrower's cash; the rest is the lender's loss. When the lender has left, the settlement leaves the economy (tag
  `loanLeavers`) instead of going to the treasury. Living costs no longer reset a negative balance to zero. Bids of a
  bot that died earlier in the same generation end no longer buy estate copies.
- Deferred to the government build: the state writer and field whitelist, pack revenue to a publisher sink, network
  inputs x25 and x27, living costs as a fixed sink, dealer count, the pressure channel, fillK and the entry channel.

Week 60, Realism, seed 31761, practiceGens 0 (reported, not tuned):

| | Base (`847bf14`) | fix/info |
|---|---|---|
| Bots | 311 | 287 |
| Trades a week (mean of weeks 51–60) | 653 | 623 |
| Vault index | 85.0 | 61.2 |
| Marks index | 89.4 | 197.7 |
| Gini | 0.410 | 0.429 |
| Ledger "other", weeks 1–60, absolute sum | 2,630,385 | 0 |

Generated veterans now open at comparable save players' prices: hidden value ÷ opening price has a median of 0.81
(10th–90th percentile 0.49–3.24), so most open above their hidden value and the most valuable far below it. Both
indexes are measured against the openings.

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
