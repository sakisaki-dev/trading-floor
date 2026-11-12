![Trading Floor](docs/figures/banner.svg)

[![tests](https://github.com/sakisaki-dev/trading-floor/actions/workflows/test.yml/badge.svg)](https://github.com/sakisaki-dev/trading-floor/actions/workflows/test.yml)
[![engine](https://img.shields.io/badge/engine-2.1.0-58a6ff)](CHANGELOG.md)
[![live demo](https://img.shields.io/badge/demo-run%20it%20in%20your%20browser-3fd49a)](https://sakisaki-dev.github.io/trading-floor/)
[![node](https://img.shields.io/badge/node-%E2%89%A520-9ea7b3)](.nvmrc)

Trading Floor is an agent-based simulation of a trading-card market. About 500 bots, each run by two small neural
networks, buy and sell cards of football players while a simulated league plays on week by week. The bots get no
trading rules and never see what a card is worth. They learn during their lives, and every 20 weeks the worst
performers are replaced by mutated copies of the best. The question is which tactics appear and which survive.

The [live demo](https://sakisaki-dev.github.io/trading-floor/) runs the whole world in the browser. Any rule can be
changed while it runs.

## The world

- The league has 32 clubs and about 320 players, seeded from one real Retro Bowl save. Players play, get hurt, win
  awards and retire every week, and each card's hidden value follows the player's career.
- The market has an order book, sealed-bid auctions, card lending, short selling, cash loans, outside dealers, and a
  liquidator that sells off the cards of bots that go broke.
- Each bot has one network that picks cards and another that sets how much risk to take. Bots also join, quit, die
  and leave their cards to heirs.
- The rules set quantities (fees, taxes, rent, the chance of a cash shock) and never tell bots what to do. Bots
  estimate value from prices, a week-old price guide, dealers and royalties.

## Findings

### First 200 weeks (engine 2.0)

- The bots split into two groups that lasted 10 generations. One group (49–64% of bots) trades with dealers and buys
  packs; the other trades at auction and with other bots. No other tactic held on, and the boundary between the two
  is blurry.
- A bot's return in one generation does not predict its return in the next. The rank correlation was between −0.03
  and −0.08 under all 11 settings tested.*
- The population fell from 501 to 344: 189 bots arrived and 346 left.
- In a typical week 68% of cards have no bot orders, and asks outnumber bids 4 to 1.*
- The marks index ends near 385 and the repeat-sales index near 77, but bots do not mark cards at 5× what they
  resell for. For cards that trade, the median mark equals the card's own last sale (1.00×). About three quarters of
  the gap comes from how the two indexes are built:
  - the marks index is an arithmetic, value-weighted average, while repeat sales is geometric and per pair;
  - only about a quarter of the marks basket traded in the last half year;
  - repeat sales counts each card's opening price as a first sale, and first sales came in about a third below it.

  About a fifth is real: cards that don't trade keep marks that auction and dealer prices hold up. A small part was a
  dating bug in repeat sales, fixed in 2.0.1 ([DEVLOG](docs/DEVLOG.md)).
- The quitting rule had the largest effect of any setting. When bots can quit after heavy losses, the correlation
  between prices and player performance rises from 0.39 to 0.69, and the Gini of wealth falls from 0.56 to 0.47.*

\* Measured on engines before 2.0 and not yet re-run.

![Price indexes, bot population and tactic shares over 200 weeks](docs/figures/overview.svg)

*Realism preset, seed 31761, 200 weeks, engine 2.0.0. How it was made: [docs/figures](docs/figures/README.md).*

### Long runs (engine 1.x)

Two runs went much longer: seed 12864 for 3,009 weeks, and seed 11906 (Realism) for 7,973 weeks, with the dealers
switched off at week 1,102. Both ran before the 2.0 audit and each is a single seed, so these need re-testing. The
population, family, trading, lending, cash and price figures can be checked in
[results/long-runs](results/long-runs/README.md); the others are in [round3-spec.md](docs/round3-spec.md) and the
[DEVLOG](docs/DEVLOG.md).

![Long run, seed 11906: population and the largest family, sales per week, prices against value](docs/figures/long-run.svg)

- One lineage came to dominate. In seed 11906 a family of 4 bots, second at week 804, made up 84% of the population
  by week 4,953 and 93% (282 of 303 bots) by week 7,973, 80 generations deep. In seed 12864 one family reached 47% by
  week 782, and by week 3,009 two families held 74% between them.
- Lending rose and fell with one family. The median share of idle cash offered for loans reached 0.62 at week 700
  while that family led, and fell to zero after another family replaced it. The likely explanation is that lending
  was carried along by a successful lineage; we have no evidence that lending itself paid.
- In runs where lending never spread, bots asked to borrow far more than other bots offered, although loans paid
  about 1% a week.
- New bots often chose to quit, and seed 11906 shrank from 176 bots to 52. It then grew back to 303. Bots that leave
  have no offspring, so selection may have reduced quitting over time. We have not tested this yet.
- With dealers in the market, prices ranked players by true value almost perfectly (0.98) by week 20, before the bots
  had learned anything, because the dealers priced from true value. After the dealers were switched off, trades
  between bots fell to 13–37 a week. About 2,400 weeks later they were back to 170–230 trades and up to about 400
  auction sales a week.
- Without dealers, prices still ranked players well (0.92–0.98) but sat at about 0.35–0.4× true value, and the
  correlation between 20-week price changes and 20-week value changes was only 0.1–0.5.
- In seed 12864 packs sold for nothing for 200 weeks, and bots that bid on packs did well. When the supply ran out,
  the same bids pushed pack prices up 2.65× a week to 56,905 coins and the pack bidders went broke. Pack prices then
  alternated between cheap and expensive every other week for about 2,000 weeks.
- When bots were scored on marked prices, they learned to pay slightly over the mark for cards they already held,
  which raised the mark on all their copies. Scoring on what a card could be sold for (`fitnessValue: 'bid'`) removes
  that incentive.
- By week 7,973 the 10% of bots with the most cash held 85% of all coins, and the poorer half held under 1%.

### Real-world parallels

None of these patterns were programmed. Each one emerged and turned out to match something economists or biologists
have documented. [docs/PARALLELS.md](docs/PARALLELS.md) gives the numbers, the source and where each analogy breaks.

| In the sandbox | In the real world |
|---|---|
| Sealed-bid auctions clear at 1.8–2.2× the mark, and the cards lose 22–30% on resale | The winner's curse in oil lease auctions (Capen, Clapp and Campbell, 1971) |
| Bots scored on marked value learned to overpay for cards they already held, raising the mark on every copy | Mutual funds buying their own holdings at the quarter's close (Carhart et al., 2002) |
| Cards that don't trade keep marks that occasional auction and dealer prices hold up | Stale marks on illiquid assets |
| When the dealers left, trading between bots collapsed and took about 2,400 weeks to recover | Auction-rate securities in 2008, when the dealers stopped bidding |
| A tactic built on heavy borrowing appeared 5 times and was wiped out each time within a generation | LTCM, Archegos, the leverage cycle |
| Last generation's best bots do no better than average in the next | Mutual fund performance doesn't persist (Carhart, 1997) |
| Wealth concentrates when one heir takes the estate and levels off when two share it | Primogeniture against partible inheritance |
| One family grows to 93% of the population | Neutral drift and founder effects (Kimura) |

### Corrections

- A few players' marks rose 4–9% a week for hundreds of weeks with no sales, until one card was marked at 2 × 10²⁸
  coins while all bots together held 1.24 million. This was a pricing bug: an old rule moved a mark toward asks placed
  above it, and the asks were set relative to the mark, so both kept rising. It was fixed in round 3
  ([DEVLOG](docs/DEVLOG.md)).
- An earlier boom and crash in the same run came from the same bug, on a few rare cards, two of them unowned. No coins
  changed hands.
- The repeat-sales index paired auction sales with order-book trades, which clear at different prices. In seed 12864
  it rose tenfold while the marks index fell. Fixed in round 3.
- We first read the close match between prices and value as the bots learning. It came from the dealers.

## Run it

Node 20 or later. The simulation needs no packages and no build step (the Anthropic SDK in `package.json` is only for
runs with Claude-driven bots).

```bash
node sim.mjs --preset realism --seed 31761 --weeks 100   # about 4 minutes, writes runs/realism-31761/run.json
node tools/tactics_report.mjs runs/realism-31761/run.json   # tactic timeline, generation by generation
node tools/build_page.mjs                                   # rebuilds docs/trading-floor.html
npm test                                                    # engine tests, including a determinism check
```

Open `docs/trading-floor.html` or the [live demo](https://sakisaki-dev.github.io/trading-floor/) to watch a run,
change settings during it, or replay a saved run. The same seed and settings always give the same run; CI checks this
on every push.

### What's where

| | |
|---|---|
| `engine.mjs` | The simulation: league, market, bots, evolution and measurement |
| `sim.mjs` · `run.mjs` | Headless runs; runs with Claude-driven bots |
| `regulate.mjs` · `gov/` | Runs with a government: the driver, its state files, the brief and the Claude session |
| `configs/` · `data/` | Presets; the league data |
| `page/` · `docs/trading-floor.html` | The browser page and its built, self-contained copy |
| `tools/` · `scripts/` | Reports, the page build, figures, run summaries |
| `tests/` | Mechanism, network, information and determinism tests |
| `results/` | Small summaries of the runs the findings cite, checked into git |
| `data-build/` | How `data/` was built from the Retro Bowl save (provenance) |

## Coming next

- Head-to-head tests of the open questions above, on the same seeds with one setting changed at a time: whether
  copying winners is why returns don't persist, whether selection reduces quitting, and whether a more varied
  population learns value without dealers ([docs/round3-spec.md](docs/round3-spec.md)).
- An AI government: a Claude session that sets taxes, fees and spending, keeps the treasury, and posts messages the
  bots can read. It runs in real time without limits on what it posts and does not know when the run ends. The study
  is whether it grows the economy that funds it or extracts from it ([docs/regulator-spec.md](docs/regulator-spec.md)).
  The harness is built and tested with a scripted government; run 1 waits for the plumbing test and the
  pre-registration ([docs/GOVERNMENT.md](docs/GOVERNMENT.md)).

## Documentation

| | |
|---|---|
| [MODEL.md](docs/MODEL.md) | The full model, in the standard ODD format, with every assumption listed |
| [PARALLELS.md](docs/PARALLELS.md) | Real-world parallels for each finding, with sources and where each one breaks |
| [METRICS.md](docs/METRICS.md) · [TACTICS.md](docs/TACTICS.md) | What gets measured, and how tactics are detected |
| [GOVERNMENT.md](docs/GOVERNMENT.md) | How to run the AI government, with and without a model |
| [AUDIT.md](docs/AUDIT.md) | A full audit of the engine: 141 findings, 116 fixed in 2.0.0, 24 more by the government build, 1 open |
| [DEVLOG.md](docs/DEVLOG.md) | Every experiment so far, in order |
| [DATA.md](docs/DATA.md) | Where the league data came from |
| [CHANGELOG.md](CHANGELOG.md) | Engine versions; cite the version with any result |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to propose an experiment or report an engine bug |

## Fine print

- All results come from one league built from one save. Most rest on three seeds or fewer, and the long runs on one
  seed each. The parallels show that the sandbox can produce these patterns, not that real markets produce them for
  the same reasons.
- League stats were transcribed from a personal Retro Bowl save. Retro Bowl is made by New Star Games. Team names
  follow the NFL. This project is not affiliated with either.
- Cite with [CITATION.cff](CITATION.cff). No license has been chosen yet, so all rights are reserved.
