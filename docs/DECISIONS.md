# Design decisions

The principles the model follows and the decisions that shaped it, with dates. Dates come from the commit history and
`docs/DEVLOG.md`; commit hashes refer to this repository. Where an earlier rule was replaced, it usually remains as a
setting so old runs stay reproducible.

## Principles

These four govern every change. They are stated in regulator-spec section 1.

| Principle | Meaning | Adopted |
|---|---|---|
| **Factors, not behaviours** | The world sets inputs and quantities: costs, rates, supply, real player data, who may trade. It never decides which way or how far a price or value moves, or what a bot does. A rule that scripts an outcome is replaced by a market mechanism plus a quantity. | 2026-11-06 (`4c0270e`); first applied on 2026-11-05 as "laws, not plot" (`1ec3f41`) |
| **Observe, don't steer** | Outcomes are results. Bugs (code doing something other than the rule it states) are fixed. Behaviour is never tuned toward an expected result; a rule change is offered as an experiment variable, compared on the same seeds. | 2026-11-06 |
| **Maximum freedom** | A limit on what a bot can do is a wall. Limits should be as wide as the mechanics allow. A wall that binds often is replaced by a cost, not kept. | 2026-11-07 (round 4, `4dfe307`) |
| **The result is the tactics** | The headline output of a run is what the bots learn: which tactics emerge, spread, get crowded out or cannibalized. Economic realism is a means to make that learning comparable to real markets, not the goal. | 2026-11-07 (the tactic tracker, `4dfe307`) |

## Decisions by date

### 2026-11-05: the prototype

- **A closed world built on one real league** (DEVLOG sections 1–11). Bots trade cards of the save's real players.
  Fundamental value comes from the site's card-value formula. Rule bots first, LLM bots later and capped by cost.
- **Prices from a weekly call auction, not a dealer quote** (section 12). Every card clears at one price a week, so
  acting first does not matter.
- **Value needs an anchor** (section 13). Without outside demand or income, the market is greater-fool trading. The
  anchors (outside buyers, royalties) are chosen on purpose, and each is a setting.
- **One market per player × design × finish; rare copies at auction** (section 16). The 4,000-plus card types would
  fragment liquidity. Plain cards trade in 16 order books per player; one-of-a-kind copies trade at sealed
  second-price auctions.
- **Living costs and credit instead of safeguards** (`adbeb92`, section 17). Bubbles end through forced sellers.
  Price limits, a central bank, a wealth tax and position caps became optional policy experiments, off by default.
- **Laws, not plot** (`1ec3f41`, section 20). Scripted fashion swings, hype-driven newcomers, lender cycles and
  seven hand-written strategies were removed or switched off. Credit became bot-to-bot with no bank and no new coins.
- **Mortality, inheritance and fitness by return on capital** (`fbf1efb`, section 21). Bots live 6–14 generations
  and pass estates to heirs. Selection ranks the return from a bot's own decisions; allowance and living costs are
  excluded.
- **Neural bots by default** (`383d618`). Each bot is two small networks with random weights; what earns money is
  copied with mutation. The LLM-bot runner (`run.mjs`) is kept but not used for results.
- **Two-sided quotes** (`e640c34`). One-sided offers dragged every price down and crashed the opening on every seed;
  a price is now moved by quotes only with both sides standing. (Superseded by trade-only and book marks.)

### 2026-11-06: factors, not behaviours

- **Six market mechanisms replace rules that scripted prices** (`4c0270e`). The value walk that rose 55% of weeks,
  quote pulls, fixed liquidator and forced-sale discounts and a pack markup were replaced by: value from data and
  supply; price = last trade; outside buyers with a budget; liquidator and forced sales at sealed auction with no
  minimum; a uniform-price pack auction. Each old rule stays as a switch.
- **Past the last real season, values hold** (`1bcf051`). Drawing real season-to-season changes compounded about
  ×1.21 a season. Superseded the same day by the simulated league.
- **No selection rules, newcomers on, zero-sum games** (`59ab726`). Contest prizes come only from stakes. Random
  retirement became an explicit rate (0).
- **A simulated league drives hidden value** (`85a0bb2`; spec `league-sim-spec.md`). Every rate is measured from the
  save; what the save cannot give (weekly stat lines, injury spells, age) is stated as an assumption and exposed as a
  setting. Age effects come from real NFL rosters. Selection was turned back on so strategies that trade well on the
  news can spread.
- **Comparable-sales marks and a repeat-sales Vault index** (`39ef254`).
- **The football pays** (`b009576`). Royalties are paid weekly from each game; the trade fee fell from 4% to 1% so
  trading on the news can pay; fitness is averaged over 6 generations.
- **Value dealers trade both ways around last week's value; practice generations on** (`c81e9f1`, `2108441`).
- **Auction sales are trades; real-world frictions as settings; fitness at selling value; the health board**
  (`dfb80e7`; spec `realism-factors-spec.md`). Every friction is off in the engine defaults, so a default run matches
  the earlier engine.
- **A public price guide** (`4ea34d6`). Every 4 weeks it publishes values 1 week old. Dealers price from it, so their
  only edge is money; research is the only way to be ahead of it.
- **The Realism preset** (spec `realism-preset-spec.md`). One season is treated as one year. Every number not
  measured from the save is marked as an assumption.

### 2026-11-07: round 3, round 4, the audit and round 5

- **Round 3 fixes** (`4dfe307`). Asks only pull a mark down and bids only push it up; a mark between the bid and ask
  holds (marks had compounded to 2.1e28 with no orders behind them). The Vault index pairs auction sales only with
  auction sales. Fire sales redefined as auction sales below 30% of last week's mark. Diagnostics added (carry-over,
  descent, network and response distance, clusters, learning follow-up, exits, the bots' order book).
- **A full league** (`4dfe307`). Every club carries a 10-man roster. Generated players come from measured data and
  are ranked against the save's own players, so real cards keep their values. Money and pack supply scale with the
  cards.
- **Maximum freedom** (`4dfe307`). Order prices and loan rates are mapped on a log scale with only a numerical safety
  bound; order, listing, short and pack counts were raised until no limit bound often. No per-order fee was needed.
- **The tactic tracker** (`4dfe307`).
- **The scientific audit** (`bb9002c`; [AUDIT.md](AUDIT.md)). 271 forces inventoried, 202 flagged findings verified
  (141 real), 32 methods findings for the government design. The pressure channel was corrected: form reads hidden
  value, never price.
- **Fitness booking for the government experiment** (`8baf2f0`, regulator-spec 22.1). Only lump sums a bot did not
  choose (allowance, transfers and grants, poll tax, opening grants, rescues) are taken out of fitness. Taxes and fees
  tied to a bot's holdings or activity count in its return, so bots can learn to avoid taxes. Not yet implemented in
  the engine.
- **Round 5** (`1487fd4`). The engine was made about 2.4 times faster with every frame hash unchanged. Three world
  factors were added: an attention budget (off in Realism), bots that scale with the cards (on in Realism), and entry
  driven by league news (on in Realism with rallies and returns). Each changes how many, never what.
- **A stand-alone repository** (`85ffd9a`). The sandbox moved out of RetroVault with `sim.mjs` as a headless runner
  and `configs/realism.json`.

## The government experiment (planned, not built)

Decisions already made for the AI government (regulator-spec 22.1, 2026-11-07):

| Decision | Choice |
|---|---|
| Who governs | One Claude session per run |
| What it is | A government: sets the rules and keeps the revenue; does not trade |
| Guardrails | None; legal values only |
| League | Full |
| Length | About 7,000 weeks |
| Time | The world does not wait; thinking costs weeks |
| Its incentive | The treasury it owns against the economy that fills it |
| Its own account | It may take money for itself and keeps it after leaving office |
| End date | Secret |
| Elections | Run 2, with notebook handover |
| Record of governments | Public to every government |
| The board | Anything goes; visible to all bots |
| Watching | Live on the page |
| Fitness booking | As above |

Recommendations awaiting a decision are in regulator-spec 22.2. Methods findings 0–31 from the audit are resolved in
the spec text and remain open until code and a pre-registration implement them.

## Rules for changing the engine

- A change that can alter results raises the engine version (see `CHANGELOG.md`).
- A new rule is added as a setting with the earlier behaviour as its default, unless it fixes a bug.
- Every change is checked by hashing every week's frame against the previous engine on fixed seeds; measurement-only
  fields are excluded from the hash.
- Diagnostics never draw from `W.rand`.
