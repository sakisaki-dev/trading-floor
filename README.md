![Trading Floor](docs/figures/banner.svg)

About 500 small neural-network bots trade cards of football players whose careers are still being simulated. Nobody
tells them how to trade. The world sets the forces (fees, taxes, rent, bad luck), and we watch which tactics the bots
find, copy and wreck.

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

- **The bots split into two camps and stay there.** One camp trades with dealers and opens packs (49–64% of bots).
  The other trades at auction and with other bots. They held for 10 straight generations, and no third tactic lasted.
  The camps are fuzzy: think regions on a spectrum, not species.
- **Winners don't repeat.** A bot's return in one generation says nothing about its next. The rank correlation was
  between −0.03 and −0.08 under all 11 settings tested.*
- **The floor empties out.** Over 200 weeks the population went from 501 bots to 344: 189 joined and 346 left.
- **Nobody wants to buy from a bot.** In a typical week, 68% of cards have no bot orders at all, and asks outnumber
  bids 4 to 1.*
- **Bots value their own cards at about 5× what cards actually resell for.** The marks index ended at 385, the
  repeat-sales index at 77. It's not yet clear whether that's real behaviour or a bug, and it's being traced.
- **The rule that matters most is the one for quitting.** When bots can quit after heavy losses, prices track the
  football much more closely (correlation 0.69 against 0.39) and wealth is spread more evenly (Gini 0.47 against
  0.56).*

\* Measured on engines older than 2.0, before the audit fixes, and not yet re-run. The rest come from the run below.

![Price indexes, bot population and tactic shares over 200 weeks](docs/figures/overview.svg)

*Realism preset, seed 31761, 200 weeks, engine 2.0.0. How it was made: [docs/figures](docs/figures/README.md).*

## Run it

Node 20 or later. No dependencies, no build step.

```bash
node sim.mjs --preset realism --seed 31761 --weeks 100   # about 4 minutes, writes runs/realism-31761/run.json
node tactics_report.mjs runs/realism-31761/run.json      # tactic timeline, generation by generation
node build_page.mjs                                       # rebuilds docs/trading-floor.html
```

Open `docs/trading-floor.html` to watch the world live, change any setting mid-run, or replay a saved run. The same
seed and settings always give the same run.

## Coming next: an AI government

A Claude session takes office. It sets taxes, fees and spending, keeps the treasury those taxes fill, and posts
whatever it likes on a board the bots read. It runs in real time with no guardrails, and it doesn't know when the run
ends. The question: does it grow the economy that pays it, take what it can, or do something else entirely? Specified
in [docs/regulator-spec.md](docs/regulator-spec.md), not yet built.

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

- This is one league from one save, and most results rest on three seeds or fewer. It says nothing yet about real
  markets.
- League stats were transcribed from a personal Retro Bowl save. Retro Bowl is made by New Star Games. Team names
  follow the NFL. This project is not affiliated with either.
- Cite with [CITATION.cff](CITATION.cff). No license has been chosen yet, so all rights are reserved.
