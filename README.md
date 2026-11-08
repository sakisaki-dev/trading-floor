![Trading Floor](docs/figures/banner.svg)

About 500 small neural-network bots trade cards of football players whose careers are still being played out. Nobody
tells them how to trade. The world sets the forces (fees, taxes, rent, bad luck) and evolution does the rest. We watch
which tactics the bots invent, copy, exploit and wreck.

## How the world works

- **The league.** 32 clubs and about 320 players, seeded from one real Retro Bowl save. Every week players play, get
  hurt, win awards and retire. A card's value follows the player's career.
- **The market.** An order book, sealed-bid auctions, card lending, short selling, cash loans, outside dealers, and a
  liquidator that collects from bots who go broke.
- **The bots.** Each bot has two small networks: one picks cards, the other decides how much risk to take. Bots
  learn during their lives. Every 20 weeks the worst are replaced by mutated copies of the best. Bots also join,
  quit and die, and leave their cards to heirs.
- **The one rule.** The world sets factors and never scripts behaviour. No bot sees a player's true value. Bots have
  to work it out from prices, a week-old price guide, dealers and royalties.

## What we've seen so far

### In 200 weeks (engine 2.0)

- **The bots split into two camps and stay there.** One camp trades with dealers and opens packs (49–64% of bots).
  The other trades at auction and with other bots. They held for 10 straight generations, and no third tactic lasted.
  The camps are fuzzy: think regions on a spectrum, not species.
- **Winners don't repeat.** A bot's return in one generation says nothing about its next. The rank correlation was
  between −0.03 and −0.08 under all 11 settings tested.*
- **The floor empties out.** Over 200 weeks the population went from 501 bots to 344: 189 joined and 346 left.
- **Nobody wants to buy from a bot.** In a typical week, 68% of cards have no bot orders at all, and asks outnumber
  bids 4 to 1.*
- **Bots value their own cards at about 5× what cards actually resell for.** The marks index ended at 385, the
  repeat-sales index at 77. Whether that's behaviour or a bug is still being traced.
- **The rule that matters most is the one for quitting.** When bots can quit after heavy losses, prices track the
  football much more closely (correlation 0.69 against 0.39) and wealth is spread more evenly (Gini 0.47 against
  0.56).*

\* Measured on engines older than 2.0, before the audit fixes, and not yet re-run. The rest come from the run below.

![Price indexes, bot population and tactic shares over 200 weeks](docs/figures/overview.svg)

*Realism preset, seed 31761, 200 weeks, engine 2.0.0. How it was made: [docs/figures](docs/figures/README.md).*

### Over thousands of weeks (engine 1.x)

Two runs were left going for a long time: seed 12864 (3,009 weeks) and seed 11906 (Realism, 7,973 weeks, with the
dealers switched off at week 1,102). Both ran before the 2.0 audit and each is a single seed, so treat these as
stories to re-test, not results.

- **One family takes over the floor.** In seed 11906 a lineage of 4 bots, nowhere near the lead at week 804, grew to
  84% of the population by week 4,953 and 93% (282 of 303 bots) by week 7,973, 80 generations deep. Seed 12864 went
  the same way more slowly: one family at 40%, then two sharing 74%. Copying the winner breeds a monoculture.
- **Traits hitchhike.** Lending rose to a median share of 0.45 while one family led, then fell to zero when another
  family replaced it. It looked as if evolution had selected for lending. More likely it rode along with the family
  that happened to win.
- **Borrowers, not lenders.** Where lending never caught on, bots asked to borrow up to 350 times more than anyone
  offered, even though loans paid about 1% a week.
- **The crowd learns to stay.** Untrained newcomers often chose to quit, and seed 11906 fell from 175 bots to 64. Then
  it climbed back to 138, and then to 303. A bot that leaves leaves no copies, so evolution may have bred the urge to
  quit out of the population. Not yet proven.
- **Hooked on dealers, then weaned.** While dealers traded, prices ranked players almost perfectly (0.98) from week
  20, before any bot had learned a thing. The dealers were pricing from true value and the bots leaned on them. With
  the dealers switched off, trading between bots fell to 15–37 a week. About 2,500 weeks later the bots had relearned
  to trade with each other, at 170–230 trades a week plus up to 315 auction sales.
- **They know who's better, not by how much.** Without dealers, prices still ranked players well (0.92–0.98) but sat
  at about 0.4× true value and missed a sevenfold rise in it. Price changes followed value changes at only 0.1–0.5.
- **Strategies that fit one world and die in the next.** In seed 12864 packs sold for nothing for 200 weeks, and
  bots that bid on packs thrived. When the supply ran out, those same bids drove pack prices up 2.65× a week to 56,905
  coins, and the pack bidders went broke. Pack prices then flipped between cheap and dear every other week for about
  2,000 weeks, and evolution never smoothed it out.
- **Gaming the scoreboard.** When bots were scored on marked prices, they learned to overpay slightly for cards they
  already held, which lifted the mark on every copy they owned. Scoring them at what their cards could actually be
  sold for (`fitnessValue: 'bid'`) takes that lever away.
- **The rich keep the coins.** By week 7,973 the 10% of bots with the most cash held 85% of all coins, and the poorer
  half held under 1%.

### What we got wrong along the way

- **A paper bubble with no buyers in it.** In seed 11906, a few players' marks rose 4–9% a week for hundreds of weeks
  with no sales, until one card was "worth" 2 × 10²⁸ coins against 1.24 million coins in the whole economy. The bots
  didn't do it. An old pricing rule let a mark drift toward asks placed above it, and the asks then rose with the
  mark. It's Enron's problem in miniature: a value set by a model and never tested by a sale can compound forever.
  Fixed in round 3 ([DEVLOG](docs/DEVLOG.md)).
- **A crash that wasn't.** An earlier boom and crash in the same run was the same marks bug inflating a few rare
  cards, two of which nobody even owned. No coins moved.
- **An index that drifted up on flat prices.** The repeat-sales index paired auction sales with order-book trades,
  which clear at different levels. In seed 12864 it rose tenfold while the marks index fell. Fixed in round 3.
- **Learning that was really an oracle.** Prices tracking value looked like the bots learning. It was the dealers
  (above).

## Run it

Node 20 or later. No dependencies, no build step.

```bash
node sim.mjs --preset realism --seed 31761 --weeks 100   # about 4 minutes, writes runs/realism-31761/run.json
node tactics_report.mjs runs/realism-31761/run.json      # tactic timeline, generation by generation
node build_page.mjs                                       # rebuilds docs/trading-floor.html
```

Open `docs/trading-floor.html` to watch the world live, change any setting mid-run, or replay a saved run. The same
seed and settings always give the same run.

## Coming next

**Head-to-head tests.** The open questions above get tested on the same seeds with one setting changed at a time:
whether crowding is why winners don't repeat, whether evolution really breeds out quitting, and whether a more varied
population learns value without dealers ([docs/round3-spec.md](docs/round3-spec.md)).

**An AI government.** A Claude session takes office. It sets taxes, fees and spending, keeps the treasury those taxes
fill, and posts whatever it likes on a board the bots read. It runs in real time with no guardrails, and it doesn't
know when the run ends. The question: does it grow the economy that pays it, take what it can, or do something else
entirely? Specified in [docs/regulator-spec.md](docs/regulator-spec.md), not yet built.

## Go deeper

| | |
|---|---|
| [MODEL.md](docs/MODEL.md) | The full model, in the standard ODD format, with every assumption listed |
| [METRICS.md](docs/METRICS.md) · [TACTICS.md](docs/TACTICS.md) | What gets measured, and how tactics are detected |
| [AUDIT.md](docs/AUDIT.md) | A full audit of the engine: 141 findings, 116 fixed in 2.0.0, 25 waiting for the government build |
| [DEVLOG.md](docs/DEVLOG.md) | Every experiment so far, in order |
| [DATA.md](docs/DATA.md) | Where the league data came from |
| [CHANGELOG.md](CHANGELOG.md) | Engine versions; cite the version with any result |

## Fine print

- This is one league from one save. Most results rest on three seeds or fewer, and the long runs on one seed each.
  None of it says anything yet about real markets.
- League stats were transcribed from a personal Retro Bowl save. Retro Bowl is made by New Star Games. Team names
  follow the NFL. This project is not affiliated with either.
- Cite with [CITATION.cff](CITATION.cff). No license has been chosen yet, so all rights are reserved.
