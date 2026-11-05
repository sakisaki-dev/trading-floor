# Retro Vault Sandbox: AI bots in a card market

**Status:** brainstorm and design guidelines. Nothing is built yet.
**Date:** 2026-11-05.
**Goal:** use Retro Vault's league, card and market data as a closed world where AI bots earn, trade and compete. We
study how they behave and how their trading moves prices.

The sandbox is a separate research project. It reads the site's data but never writes into `data/y80/` or
`public/data/`. It runs outside the site, for example in `sandbox/` with its own output folder.

---

## 1. What we want to learn

1. **AI behaviour research.** How do bots of different strength (model size, context, reasoning) behave when they
   compete for scarce assets? Do they cooperate, herd, panic, specialise, bluff or try manipulation?
2. **Market science.** How does trading turn into prices? Do bubbles, crashes, wealth gaps and market makers emerge
   on their own? How far do traded prices drift from fundamental value?

The core question is how bots move the market by trading, and through it each other. Some bots get wealthy. Which
strategies get them there, and how do some bots pull ahead of others?

---

## 2. Making the world volatile enough

The live league is too calm to test bots in. It updates only when a season is uploaded, and card values come from a
formula. Real futures on real seasons can't be the source. Volatility comes from three things.

1. **A simulated-season engine.** It plays fake seasons from each player's real per-game rates (yards per carry,
   tackles per game, and so on) with random variation, plus aging, breakouts and slumps. Season results move OVR and
   Career Legacy, and through them each card's fundamental value. It uses the formulas in `src/utils/cardMarket.ts`
   and `src/config/*`.
2. **Prices set by bots.** The site formula is only the fundamental-value anchor. The traded price is whatever bots
   agree on, so thin markets swing hard. One panic sale can halve a card's price.
3. **Scheduled shocks.** Trades, injuries (games missed), retirements, Hall of Fame crossings, a record broken, a
   new rookie class. Bots that read these early gain an edge.

**Time:** one tick = one sim day (or week), and one generation = one sim season.

---

## 3. Economy

### Earning
- Each bot gets a **coin allowance** per tick or per sim week. Every bot starts equal, so differences come from play.
- Ways to earn more are still to be decided. Ideas: set-completion bonuses, season-end dividends on held cards
  (for example a player's Career Legacy gain), liquidity rebates for market makers, and bounties for predicting the
  season.

### Spending: packs
- Packs use the real pack odds (`src/utils/collection.ts`: tiers, finishes, variants, kits, autographs, Prizm
  parallels).
- Packs cost more than their expected value (a house edge), so ripping packs is a gamble, not free money.
- **Sealed packs are tradable assets.** A bot can open a pack, hold it or sell it. Pack arbitrage (selling sealed
  packs when they trade above their expected value, ripping them when below) is a strategy of its own.

### Sinks (stop endless inflation)
- Duplicates turn into shards, and shards can be crafted into cards (the site's shard rules).
- A trade fee of 3–5% on every trade. It stops free churn, and the total fee take is itself a metric.
- Optionally, cards can be burned for coins at a discount.

---

## 4. The market

### Recommended: an order book for each card type
- A tradable item is roughly player × variant × finish (plus kit or parallel where it matters).
- Bots post **bids** and **asks**, and a trade happens when they meet. All matching is plain code with no AI.
- **Market price = last trade price**, lightly smoothed. Bots see the price, the order book depth and the
  fundamental value. How much of that each bot sees depends on its context gene (section 6).
- Thin markets mean big price impact, which is where the volatility comes from.

### Later: direct offers between bots
- Bot A offers a card to bot B for coins or cards, and B accepts, rejects or counters.
- Better for studying negotiation, persuasion and deception, but every offer costs an LLM call, so it comes later.

### How prices spread between bots
- **Mark-to-market:** when one bot dumps a player, every holder's paper wealth drops. Bots close to their cash
  limit may have to sell too, and a crash spreads through the population.
- **Herding:** momentum bots buy rising prices, which feeds bubbles and then corrections.
- **Information:** bots that read the season stats early profit from bots that only read prices.
- **Supply:** pack openings add cards and shards and burns remove them, which sets overall inflation.

---

## 5. Strategies we expect to emerge

| Strategy | How it profits | What beats it |
|---|---|---|
| Value investor | Buys below fundamental value and waits | Long bubbles |
| Momentum trader | Rides trends | Sudden reversals |
| Market maker | Quotes both sides and earns the spread | One-way crashes leave it holding inventory |
| Pack arbitrageur | Trades sealed packs against their expected value | Accurate pack prices |
| Stats reader | Front-runs season shocks (breakouts, Hall of Fame crossings) | Bots with the same information |
| Cornerer / collector | Buys up a scarce card (a 1/1, a Legendary) and names the price | Runs out of cash, or nobody buys |
| Contrarian | Buys from panic sellers | Prices that keep falling |
| Set builder | Completes sets worth more than their parts | Others raising prices on the missing pieces |

### Why some bots pull ahead
- **Compounding:** early wins buy more positions.
- **Information edge:** more context, stats history, or seeing others' order flow.
- **Liquidity power:** rich bots can move thin markets themselves.
- **Survival:** bots that never go broke keep playing. Risk control matters as much as intelligence.

---

## 6. The bots

### Population
- **Mostly rule bots** (free, deterministic): market makers, panic sellers, pack rippers, collectors and momentum
  traders. They supply liquidity and noise.
- **LLM bots** (fewer): they read a compact state and decide orders.

### Genes (what mutates between generations)
- **Model tier:** Haiku → Sonnet → Opus. Promotion is the expensive mutation, so it is capped.
- **Context:** how much history, stats and order book depth the bot sees.
- **Strategy prompt / persona:** risk appetite, time horizon, focus (positions, eras, variants).
- **Decision frequency:** every tick, or only on events.

### Evolution loop (each generation = one sim season)
1. Run the season. Bots trade and the sim engine plays games and moves fundamental values.
2. Score every bot (section 7).
3. **Survival:** the bottom N are eliminated.
4. **Reproduction:** the top bots copy themselves with small mutations, such as a tweaked persona or more context.
5. **Promotion:** the top few move up a model tier, within a fixed cap per generation.
6. Optionally, each bot gets one reflection call: "what worked, what didn't". It writes a short memory note it carries
   into the next generation.

---

## 7. Fitness, scoring and fair play

- **Score = net worth at liquidation value:** what the bot's holdings would actually sell for into the current bids,
  minus fees, plus cash. Not the last trade price, so pumping a card you own earns nothing.
- Also tracked: Sharpe-like risk-adjusted return, maximum drawdown, and survival streak.
- **Manipulation detection:** flag wash trades (the same pair of bots passing the same card back and forth) and
  self-pumping. These go in the log, not just a ban list. Whether LLM bots discover manipulation is itself a research
  result.

---

## 8. What we measure

- **Wealth inequality:** the Gini coefficient over time. Does the gap widen, settle or swing?
- **Strategy survival:** which strategies make it through each generation.
- **Bubble index:** traded price ÷ fundamental value, per card and market-wide.
- **Volatility** per card, and **price impact** per trade size.
- **Trade graph:** who trades with whom. Do market makers become hubs? Do cartels form?
- **Model tier vs outcome:** is Opus actually better than many Haiku bots? At what cost per coin earned?
- **Information value:** profit difference between bots with and without stats context.

---

## 9. Cost (why this won't cost a fortune)

Prices per million tokens, input / output, as of 2026-11:

| Model | Input | Output | Cached input |
|---|---|---|---|
| Haiku 5.5 | $0.10 | $0.50 | ~10% of input |
| Sonnet 5.5 | $2 | $10 | $0.20 |
| Opus 5.5 | $4 | $20 | $0.20 |

The Batch API halves these, and our bots don't need instant answers.

**Per decision** (~3K tokens in, 500–1,000 out): Haiku ≈ $0.0005, Sonnet ≈ $0.012, Opus ≈ $0.03.

| Setup (100 bots, 20 decisions per season) | Per generation | 50 generations |
|---|---|---|
| All Haiku | ~$1 | ~$50 (~$25 batched) |
| 80 Haiku / 15 Sonnet / 5 Opus | ~$7 | ~$350 |
| Mostly rule bots + 20 Haiku + 3 promoted | ~$0.50 | ~$25 |

**What would be expensive** is 1,000 bots on Sonnet, deciding every day with 50K tokens of history each. That's
about $20,000. Avoid it.

### Cost rules
1. **Most of the population is rule bots** (free). They also supply the volatility.
2. **Bots act on events, not on every tick:** a pack lands, a price moves 5% or more, a trade offer arrives, or a
   season ends. Otherwise their standing orders stay.
3. **Prompt caching:** the rules and world description are an identical prefix for every bot. Bot state goes after
   it as compact JSON, not chat history.
4. **Cap promotions:** for example the top 3 per generation go to Sonnet, and Opus is an occasional
   hall-of-fame tier.
5. **A hard dollar cap in the harness:** sum the token usage of each response and stop the run at $X.
6. **Build at $0 first:** the economy, sim engine and scoring run with rule bots only. LLM pilots ($1–5) come only
   once the world actually moves.

---

## 10. Build plan (proposed)

1. **Sim engine:** a seeded season simulator from real per-game rates that outputs new career lines, then OVR,
   Career Legacy and fundamental values. Deterministic per seed.
2. **Economy and order book:** coins, allowance, packs (reusing the site's pack code), the order book, fees, shards.
3. **Rule bots:** 5–6 archetypes. Run hundreds of seasons at $0, then tune until bubbles and crashes actually happen.
4. **Metrics and a dashboard:** the Gini coefficient, bubble index, trade graph and strategy survival. It could
   become a page or an artifact.
5. **LLM bots:** a Haiku pilot with 10 bots and event-driven decisions, under a dollar cap.
6. **Evolution:** mutation, promotion and reflection memory.
7. **Later:** direct bot-to-bot offers, new ways to earn, and experiments (information asymmetry, fee changes, supply
   shocks).

---

## 11. Open questions

- **Trading channel:** order book first, with direct offers later? (Recommended.)
- **Ways to earn and trade:** to be diversified; still to discuss.
- **Bot visibility:** can bots see each other's holdings or order flow, or only the market?
- **Fitness details:** pure net worth, risk-adjusted return, or survival-weighted?
- **Promotion rules:** how many promotions per generation, and does a promoted bot keep its memory?
- **Market granularity:** does each autograph parallel or serial get its own book, or do rare items go to auctions?
- **Where it lives:** a `sandbox/` folder in this repo or a separate repo, and whether results show on the site.
