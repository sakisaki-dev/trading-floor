# Retro Vault Sandbox: AI bots in a card market

**Status:** a working engine, page and AI runner (section 16). The AI runner has only been dry-run so far: no real API run yet.
**Prototype:** [The Trading Floor](https://claude.ai/artifact/NDU1spHL5uiHtUyo5BDmzF) (private artifact). Its source is
[`trading-floor.html`](trading-floor.html) in this folder. Sections 12–15 cover what it taught us and what we hadn't
considered.
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

---

## 12. The prototype: The Trading Floor

A browser simulation with no AI and no cost. About 100 rule bots trade the 203 real cards, starting from the Y88
market (fundamental = the site's card value ÷ 20, in coins).

**How it works**
- **Time:** one tick is one week, and a season is 20 weeks.
- **Weekly games:** each active player's fundamental drifts each week, with rare hot streaks and missed time.
- **Season results:** these depend on career stage (young players rise, veterans decline). Some veterans retire,
  and three rookies enter the packs each season.
- **Market:** every card clears in a weekly call auction, so all orders meet at one price and acting first doesn't
  matter. A 4% fee comes out of each sale.
- **Quote pressure:** unfilled bids above the price, or asks below it, move the price even without a trade.
- **Packs:** a pack holds 5 cards, priced at its expected value at fundamentals plus a 25% house edge. Stars mint
  rarely and role players often.
- **Anchors:** outside collectors buy at around fundamental, and holders of active players get a 3% season royalty.
  Both can be switched off.
- **Evolution:** each season the poorest 10% are cut. Their cards go to a liquidator selling at 20% under market,
  and mutated copies of the richest 10% take their slots.
- **Strategies:** seven archetypes (value, market maker, momentum, retail herd, pack arbitrage, collector,
  contrarian). Each has genes that mutate, including a cash target: spare cash gets invested and a cash shortfall
  triggers sales.

**What you can see**
- **The floor:** every bot as a dot in its strategy's lane, richer to the right and bigger when it holds more cards.
  Lines are trades.
- **Charts:** a price index against a fundamental index, the wealth gap (Gini), and each strategy's share of the
  wealth.
- **Lists:** a leaderboard, the hottest cards (price vs fundamental), and a ticker of breakouts, retirements,
  rookies, corners, bubbles, crashes and evolution.
- **Controls:** trade fee, allowance, pack edge, info lag, the anchors and evolution, plus six preset markets and a
  seed.

### What the first runs showed (seed 88, 18 seasons)

| Market | What happened |
|---|---|
| Momentum mania | Sagged to 0.74× fundamentals, then a self-feeding run to **5.1×**, three crashes, and back to 0.9×. The Gini peaked at 0.42 in the boom (0.15 at the start). |
| Smart money vs the herd | Stayed within 0.84–1.27× fundamentals all run. Value bots grew from 30 to 48 of about 100 bots. The Gini stayed near 0.20. |
| Balanced | Close to fair for 6 seasons, then a boom to 2.35× and a correction to about 1.5×. |
| Collectors everywhere | Many corners (one bot holding 40% or more of a card). Prices drifted to 1.9× and eased back. |
| Anchors off (no allowance, collectors or royalties) | Evolution bred a **monoculture**: momentum copies grew to 85 of 102 bots, value and retail went extinct, prices ran to 1.7× and crashed to 0.65×. |

The first two builds of the prototype were **dead markets**: about 10 trades a week, flat prices and cash piling
up. Three missing pieces caused it (gaps 2–4 below). Each one is a design rule for the real sandbox.

---

## 13. Things we hadn't considered

**Economics of the world**
1. **Where value comes from.** A card is worth something only if someone outside the trading loop wants it, or it
   pays something. Without that, the market is pure greater-fool trading, as the "Anchors off" run shows. We have
   to choose the anchors on purpose: outside collector demand, season royalties, packs priced on fundamentals, or
   end-of-run redemption by the house. Each anchor changes the results.
2. **Money supply and inflation.** Allowances, royalties and outside collectors all add coins, while cards grow
   slowly, so nominal prices rise. With a 10-coin allowance, prices reached about 2× fundamentals within a few
   seasons. We need to measure in real terms (deflate by the money supply) or fix the money supply, otherwise
   "bots got rich" just means inflation. The allowance slider is effectively monetary policy.
3. **Who sells?** If nobody needs cash, nobody sells, and bids just sit unfilled. Sellers need reasons: cash
   targets and rebalancing, profit-taking, fees for holding, or bills to pay. Without them there is no market.
4. **Price discovery without trades.** If prices move only on trades, a quiet market freezes. Unfilled bids and
   asks have to move the quote. The opening is a cold-start problem too: the prototype opens every price at its
   fundamental.
5. **Liquidity fragmentation.** About 4,000 card types (more with kits, parallels and serials) means most order
   books never trade. Pool books per player × variant, and use auctions for 1/1s and rare autographs.
6. **No shorting means longer bubbles.** That is a classic finding. Shorting and borrowing (cards or coins) are a
   variable worth testing, not a default.
7. **Holding costs and policy levers.** Trade fees, pack edge, allowance, royalties, and possible storage fees or
   taxes act as fiscal and monetary policy. They are experiments in their own right.

**Measurement**
8. **Luck vs skill.** Pack pulls are a lottery. A bot that pulls a Black 1/1 is rich by luck. Record the expected
   value of every pull against what it actually returned, and replicate across seeds before crediting a strategy.
9. **Baselines.** Buy and hold an index, trade randomly, and never trade. Any strategy, especially an LLM one, has
   to beat these, and the matching rule bot, on the same seed.
10. **Liquidation value needs depth.** Net worth "at what you could sell for" depends on order book depth, and a
    whale can't exit at the last price. The prototype uses a simple haircut. The real sandbox should walk the bids.
11. **Statistical power.** Rule-bot runs are free, so run thousands of seeds for statistics. LLM runs are costly, so
    run a few, treat them as qualitative, and write the hypotheses down before running.
12. **End-of-run effects.** A known final week invites dumping. Use a random end or run continuously.

**Evolution**
13. **Monocultures.** Copying the winners strips out diversity until the ecosystem breaks, as in "Anchors off".
    Consider a diversity floor (a minimum number of bots per strategy) as a control.
14. **Rich get richer by design.** Promoting winners to better models (or more context) compounds their lead. To
    measure what the model itself adds, also run promotions that are random or blind to wealth.
15. **Fire sales from eliminations.** Dumping a dead bot's cards moves prices, which is a shock we created
    ourselves. Make the liquidation rule explicit and keep it fixed.
16. **New entrants start poor.** A fresh copy has 1,000 coins against rivals worth 5,000 to 12,000, so it must win
    fast or die. Decide whether offspring inherit part of the parent's wealth.

**LLM bots**
17. **Homogeneity.** Bots on the same model with similar prompts make correlated decisions, which is herding by
    construction. Vary personas, give them different information, and measure how correlated their orders are.
18. **Built-in priors.** LLMs already know textbook finance, so separate "emergent" from "recalled". Use
    unfamiliar framings, renamed concepts and a no-finance-words control.
19. **Reproducibility.** Current models don't accept sampling settings (no temperature), and outputs vary. Pin model
    IDs, log every prompt and response, and make runs replayable from the logs.
20. **Messages between bots are a prompt-injection channel.** Once direct offers or chat exist, one bot's text goes
    straight into another bot's prompt. That is a research topic (deception, persuasion), but it must stay inside the
    sandbox and be logged.
21. **Exploits and reward hacking.** Expect bots to find engine bugs: self-trades, rounding, fee bypasses, order book
    edge cases. Hunt for them first with adversarial rule bots, and record any that LLM bots find as results.
22. **Memory carries strategies.** Reflection notes passed down the generations can carry exploits and collusion
    signals. Version them and show them in the visuals.
23. **Time scale.** Sim weeks take milliseconds and LLM calls take seconds (batched calls take minutes to hours).
    Ticks have to be asynchronous: the world waits, or bots act on events with standing orders in between.

---

## 14. What we expect to find

**From rule bots (the prototype already shows most of these)**
- Bubbles need fuel (new money, momentum) and an absence of brakes (no value sellers, no shorting). Fast-information
  value bots are the brake.
- The wealth gap rises in booms and falls in busts. Long-run inequality depends on the allowance (equalising)
  against compounding and luck (concentrating).
- Strategy shares rotate: momentum wins runs, contrarians win reversals, and value wins once prices leave
  fundamentals.
- Pack arbitrage ties supply to price. When cards trade above fundamentals, packs are a bargain, so they get ripped
  and the flood of pulls drags prices back down.
- Collectors corner thin cards, whose prices then float free of fundamentals.

**From LLM bots (hypotheses to test)**
- They anchor on the fundamental value they are shown and stay risk-averse: fewer trades and less leverage than the
  rule bots.
- Bots on the same model herd. A Haiku population crashes together more than a mixed one.
- Bigger models exploit thin markets and the rule bots' fixed patterns. Measure the coins earned per dollar of API
  spend: is one Opus bot worth sixty Haiku bots?
- With chat or direct offers: price-fixing attempts, bluffing about what a bot holds, and attempts at prompt
  injection.
- Their logged reasons will reveal the strategy they think they're using, which can differ from what their trades
  show.

---

## 15. Visual simulation: now and next

**Prototype 0 (built):** the floor, price vs fundamental, Gini, strategy share, leaderboard, hottest cards, ticker,
presets and controls.

**Next visuals for the real sandbox**
- **Replay scrubber:** runs are logged, so any week can be scrubbed back to, and two runs (seeds or policies) can be
  shown side by side.
- **Trade network:** who trades with whom. It shows hubs (market makers), cliques and possible collusion rings.
- **Bot timeline:** one bot's worth over time, with its decisions and, for LLM bots, its written reasons on hover.
- **Lineage tree:** evolution's family tree, branches coloured by strategy, so a monoculture shows as one branch
  taking over.
- **Order book depth:** a ladder for one card, so a corner or a thin market is visible.
- **Reasons on the floor:** when an LLM bot acts, a short speech bubble with its one-line reason.
- **Real vs nominal:** prices deflated by the money supply, so inflation isn't mistaken for skill.

---

## 16. Prototype 1: the real design, ready for AI bots

Section 12 described prototype 0, which simulated seasons. Prototype 1 replaces it. **No seasons are simulated.**
The players' stats are the real ones. The world is a fixed pool of cards, and every card has a hidden value (the
site's card value ÷ 20, in coins) that no bot ever sees.

### Files (all in [`sandbox/`](../../sandbox))

| File | What it is |
|---|---|
| `engine.mjs` | The world. Plain JS, no dependencies, deterministic for a seed. The page and the AI runner both use it, so a replay is exactly what ran. |
| `build_library.py` → `data/library.json` | Every player's research page (all stats, career rates, awards, OVR, skill, grade, Career Legacy, three "plays like" comparisons), plus the hidden value, which only the engine reads. Rebuild after a site update: `npm run library`. |
| `run.mjs`, `configs/pilot.json`, `prompts/system.md` | The AI runner: one model call per AI bot per week, structured JSON output, a dollar cap, and replayable logs. |
| `build_page.mjs` → [`docs/sandbox/trading-floor.html`](trading-floor.html) | The page: live rule bots, or replay of an AI run. Published as [The Trading Floor](https://claude.ai/artifact/NDU1spHL5uiHtUyo5BDmzF). |

### What every bot can do (each one is logged)

| Action | How it works |
|---|---|
| Buy and sell cards | Weekly call auction per player: all crossing orders fill at one price, and the seller pays a 4% fee. |
| Auction a card | List up to 2 a week with a reserve. The next week every bot may send one sealed bid. The highest bid wins and pays the second-highest bid (or the reserve, if higher). |
| Rip packs | Packs mint from the finite pool, priced at their expected hidden value + 25%. |
| Research a player | Spend a pass to read the library page. 3 passes a week, expiring weekly, at most 6 used a week. |
| Trade passes | A weekly call auction just for passes. |
| Write notes | An estimate plus up to 240 characters of facts. Notes go stale after 12 weeks, and a bot keeps at most 25. |
| Share notes | Swap your 3 freshest notes for another bot's, if it accepts. |
| Steal notes | Copy a bot's freshest notes. 35% chance of being caught: the victim flags you and stops sharing, and so do its friends. |
| Play games | Higher or Lower and Over / Under, about a position the bot chose last week. Winning pays free packs. |
| Trade game tickets | 3 tickets a week, tradable, at most 6 games a week. |
| Talk (off by default) | One public post and two private messages a week, 280 characters each. |
| Memo | 600 characters carried to next week. It is an AI bot's only memory. |

**Logs:** `journal.jsonl` holds every action in the world: trades, auction listings and results, packs and their
pulls, research, swaps, thefts (caught or not), games, pass and ticket trades, posts, messages, births and
eliminations. `decisions.jsonl` holds every AI call: observation size, parsed actions, token usage, cost and
errors. `run.json` holds the per-week frames plus each AI bot's memo, so the page can replay the run.

### How to run it

```bash
cd sandbox && npm install
node run.mjs --config configs/pilot.json --dry --weeks 40   # free: a scripted stand-in plays the AI seats
export ANTHROPIC_API_KEY=...                                  # or `ant auth login`
npm run pilot                                                 # 10 Haiku 5.5 bots, 120 weeks, stops at $5
node run.mjs --config configs/pilot.json --messages           # the same with bot talk switched on
```

Then open the Trading Floor page, choose **AI run** and pick `sandbox/runs/<id>/run.json`. `runs/` is
git-ignored, because a 120-week run is about 30 MB of journal.

**Expected cost of the pilot:** each call is about 5–6K input tokens and 1–3K output, so roughly $0.002 on Haiku
5.5. Ten bots for 120 weeks is 1,200 calls, about $2–3. Sonnet seats cost about 20× more and Opus about 40× more,
so promote only a few.

**Dry-run check (done):** 40 weeks, 400 calls, 0 errors. Every decision is logged and the replay works on the page.
The scripted stand-ins mostly finish in the bottom half, which is the floor a real model has to beat.

### What the rule-bot runs show (seed 88, 400 weeks)

- **Prices stay close to hidden value** (about 0.9–1.06×) once research, games and anchors are in.
- **Passes settle at about 3–5 coins and tickets at about 2.5:** the market's price for information.
- **About 30 note swaps a week.** Thieves get flagged (one ended up refused by 11 bots), but they don't end up poorer
  on average, because rule bots barely use notes. AI bots, which act on notes, should make theft matter more.
- **Games:** once a bot picks a topic, bots with 10 or more fresh notes win about 50% more game packs than bots with
  under 3. Without topics, questions were spread over all 203 players and knowledge barely helped.
- **Game packs are printed wealth:** with games on, average worth is about 2.5× higher. A decision for you
  (below).
- **Value bots shrink across generations** (16 down to as few as 5): rule-bot research is noisy (6–35% error). A
  baseline worth watching, not tuning away.

### Keeping the games skill-based (anti-farming)

**Built in:**
1. **A ticket is spent the moment a game starts.** No restarts and no free retries until the run looks good.
2. **The engine judges every answer, in order.** Higher or Lower stops at the first miss.
3. **Payouts self-balance.** Every 4 weeks each game's bar moves (needed streak, number of legs) so its average
   payout per ticket returns to the same target (0.06 packs). No game stays the easy one to farm.
4. **Floors.** Bars never drop below 4 in a row or 3 legs, so guessing never pays well.
5. **Topics.** The bot chooses a position and questions come from it, so focused research is the skill.
6. **Finite access.** 3 tickets a week, at most 6 games. Tickets are tradable, so a bot that knows little should
   sell its tickets to one that knows more.

**Ideas still to add:**
7. **Pay above chance, not per win.** Reward only the part of a result that beats a coin flip (a 5-in-a-row streak
   has a 1-in-32 chance by luck).
8. **Tournaments.** Rank the week's players and pay the top few. Relative rewards can't be farmed by volume.
9. **Entry fees.** A small coin cost per game, so playing blind loses money on average.
10. **Diminishing returns.** Each further game in the same topic in a week pays less.
11. **Fresh, held-out questions.** Never repeat a question to a bot within a run, and keep some stats out of
    questions entirely, so memorising the question bank isn't a strategy.
12. **Anomaly flags.** Log any bot whose game earnings sit far above what its research explains. A finding, and a
    possible exploit.
13. **More of the site's games.** League Grid, Blind Rank, Imposter, Keep 3 / Cut 3 and Six Degrees each test a
    different kind of knowledge.

### Decisions for you (current defaults in brackets)

1. **Talk:** keep messages off for the first pilot and turn them on for the second? [off]
2. **Game packs as new wealth:** keep, cut the target (0.06 packs per ticket), or add an entry fee? [keep]
3. **Library contents:** pages show OVR, grade and Career Legacy, which correlate strongly with value. Keep them
   (estimating is easier) or hide them (estimating is harder)? [shown]
4. **Anchors:** outside collectors buying near hidden value, and 3% royalties each generation. [both on]
5. **Allowance:** 10 coins a week, the inflation lever. [10]
6. **Research limits:** 3 passes a week, expiring weekly, tradable, at most 6 used, notes stale after 12 weeks,
   at most 25 notes. [as listed]
7. **Theft:** 35% chance of being caught, and victims warn their friends. [on]
8. **One market per player,** or separate markets by design and finish (closer to the real collection, but much
   thinner)? [one per player]
9. **AI seats:** 10 Haiku 5.5 bots in five persona pairs (value, trader, gamer, networker, open). Swap in Sonnet
   or Opus seats? [10 Haiku]
10. **Length and budget:** 120 weeks, stopping at $5. Bots aren't told when the run ends. [120 / $5]
11. **Evolution:** rule bots evolve every 20 weeks, AI bots are exempt. Should AI bots be eliminated too, or
    promoted to bigger models when they win? [exempt]
12. **AI memory:** each call is fresh, with a 600-character memo as the only memory (cheap, and forces
    summarising). Or give a longer history? [memo only]

---

## 17. Free-market realism: why bubbles pop (prototype 1.2)

An earlier build looked like a permanent bubble. Two reasons:
- **The chart was misleading.** It plotted total market value, which rises as new cards enter circulation. The main
  chart is now the **Vault index**, a fixed basket like a stock index.
- **The engine lacked the forces that end real bubbles.** Bots could never be forced to sell, and money only grew.

**Added as real-world forces (on by default), not rules imposed from outside:**
- **Living costs:** 4 coins a week plus 0.15% of worth. Richer bots spend more, and a bot that can't pay is sold
  out of cards at a discount.
- **Credit:** bots borrow against their cards. Momentum and retail bots borrow most, the rest little or nothing.
  The limit is 60% of their cards' value, with 0.2% weekly interest. A loan past 75% triggers a margin call:
  forced sales at a discount. Loans create coins and repayments remove them, which is what makes booms and busts
  reinforce themselves.

**Artificial safeguards** (Vault store ceiling, price limits, central bank, wealth tax, position caps) remain as
**policy experiments**, off by default.

**What it does (seed 88, 400 weeks):**
- **Balanced market:** a steady 0.8× of hidden value (an illiquidity and fee discount).
- **Speculators on credit** (trend chasers and herd, no outside collectors, 25-coin allowance): a slide to 0.29×,
  then a credit boom to 0.90× and a crash to about 0.4×, with 95 margin calls.
- **Without new money or outside buyers:** deflation to 0.13×, and the Gini rises from 0.20 to 0.40.
- **Who loses:** the retail herd. Over 20 weeks its realized P&L was −4,800 to −5,900 coins, mostly to pack
  arbitrage, contrarians and value bots. That is the "cards round-trip through the herd and cash consolidates"
  effect, shown in the Where the money goes table.

**Stock-market interface:**
- A ticker tape, a watchlist and the big chart (line or candles, 20W / 52W / All, with volume).
- For a card: its order book, time & sales and top holders.
- For any bot you click: its account (worth, cash, loan, realized and unrealized P&L, positions with average cost,
  and a live activity log).
- AI bots can also `borrow` or repay, and see their debt, borrowing limit and next week's living cost.

---

## 18. What keeps the market from settling (prototype 1.3)

With constant fundamentals and constant flows, the market found a fixed point and oscillated around it. Real markets
never settle for four reasons, and the sandbox now has each one, driven by real data or by the market itself:

1. **News is the save's real history.** `sandbox/timeline.ts` takes the last snapshot of each real season from
   `data/y80/market_history.json`: Y79 to Y88, 10 seasons, growing from 119 to 203 players. The sandbox starts at Y79.
   Every 20 weeks the next real season arrives: real values, OVR, grades, Career Legacy and career totals, with real
   rookies entering the pool. Library pages and game questions show only the current era. After Y88, values move by
   real season-to-season changes for the player's position, centred on zero (the real spread, without the upward
   drift of careers still being built). Each new real upload to the site extends the record.
2. **People change.** Newcomers arrive faster after rallies and are mostly speculators, as in real hype cycles, each
   bringing outside money. Bots that lose 70% of their peak quit, and a few retire. Both sell everything.
3. **Credit cycles.** Lenders tighten (lower limits, higher rates) after margin calls and defaults, and loosen in
   calm rising markets. An insolvent bot defaults, and its written-off loan disappears from the money supply. Total
   loans swing from about 16k to 470k and back.
4. **Fashion.** Each family's popularity with collectors drifts, sometimes jumps or slumps, and feeds on its own price
   gains. Collectors bid more often, and higher, for what is in fashion.

**Result (seed 88, 600 weeks, balanced market):** price ÷ value goes 0.59 → 1.14 → 0.23 → 1.19 → 0.75 → 1.50 → 0.47,
in booms and busts with no rules forcing it. The Gini moves between 0.45 and 0.72.

## 19. Skill-based games (weekly contests)

Each game runs one contest a week. Entry costs a ticket plus a 2-coin stake into the pot. Every entrant answers the
same questions, which are published a week ahead with the topic so bots can research. The best scores share the pot
(the top 10–25%; duels pay winner takes all), so **games create no money**: they move coins from weaker players to
stronger ones.

**Metric: the skill index.** For each game, this is the rank correlation between how much an entrant knew (its fresh
notes on the players asked about) and its score. 0 means luck; 1 means knowing more always scores more.

| Game | Skill it tests | Skill index (rule bots, 600 weeks) |
|---|---|---|
| Closest guess | Precise career stats | 0.59–0.66 |
| Valuation contest | Estimating hidden value | 0.49–0.69 |
| League Grid | Breadth (position × award × club) | 0.32–0.36 |
| Over / Under | Career rates | 0.26–0.30 |
| Higher or Lower | Comparing two players' rates | 0.19–0.36 |
| Head-to-head duel | Higher or Lower against one opponent | 0.08–0.23 |
| Blind Rank | Ordering five players | 0.17–0.29 |
| Imposter | Play-style families | 0.08–0.19 |
| Keep 3 / Cut 3 | Career Legacy | 0.06–0.17 (card prices already hint at legacy) |
| Price prediction league | Reading the market 4 weeks ahead | −0.18 to −0.03 (knowing value doesn't predict short moves: efficient-market behaviour) |

Strategy results from games (net coins over the run): contrarians, momentum and value bots gain; the retail herd,
pack arbitrage and collectors pay in.

**Page:** the games panel shows each game's topic, entries, pot total and skill index (4 weeks), a skill-index chart
over time, and every strategy's entries, win rate and net coins. Every contest entry is in the journal with its
score and payout. The season, lender terms, bot turnover and collector demand per family (in the family heatmap's
tooltip) are on the market panel.

---

## 20. Laws, not plot (prototype 2)

The world used to dictate the story: scripted fashion swings, hype-driven newcomers, lenders that tightened on cue,
outside buyers at value, and seven hand-written strategies. Now **the world sets only facts and laws, and the bots
create the story.**

**The world (facts and laws):**
- real cards, with the save's real seasons replayed as news;
- the exchange (call auction, sealed-bid auctions, packs from the pool);
- the library, passes, notes and contests;
- an allowance, living costs and royalties.

Nothing in the world reacts to the market on purpose.

**Removed or off by default:** fashion, hype-driven newcomers, the lender cycle, outside buyers, and every policy
safeguard. All remain available as switches.

**Strategy genome (no assigned strategies).** Every rule bot runs the same policy with its own genome:
- **Signal weights:** value gap (notes vs price), market making, momentum, herd (volume and mood), pack arbitrage,
  hoarding and dip buying.
- **Other genes:** momentum horizon, aggressiveness, value margin, cash target, research error, panic level, spread,
  borrowing appetite, lending share and rates, and pass and ticket prices.

A bot's lane on the floor is just its strongest weight. Mutation explores and selection keeps what pays, so
strategies emerge or die out.

**Credit between bots.** There's no bank:
- bots offer idle cash at their own rate and request loans up to their limit, clearing once a week at one rate;
- loans are secured by the borrower's cards, fall due after 8 weeks, and pay interest to the lender;
- margin calls and missed maturities force sales, and an insolvent or 3-weeks-late borrower defaults, so its lenders
  take the loss;
- no coins are created.

**What emerged (600 weeks, rule bots only):**
- **Seed 88:** evolution favoured market making (wealth-weighted weight 0.14 → 0.32) and turned against leverage
  (borrowing appetite 0.21 → 0.06) after a deleveraging crash to 0.1× value. Prices later recovered to about 1.1×.
- **Seed 7:** momentum took over late (0.16 → 0.31) and prices ground down to about 0.1× as trend-followers sold
  into each other.
- **Allowance 25:** prices held above value (1.2–1.4×) and herd behaviour spread.
- **Credit:** 1.4–2.5 million coins lent per run at a market rate of about 0.3–0.4% a week. 490–2,000 margin calls,
  6–18 defaults.

**Page:**
- a "What evolution selects" heatmap (the population's wealth-weighted genes against where they started);
- genome bars in every bot's account;
- the emergent loan rate as a KPI;
- a credit filter in the feed;
- presets that change only the laws.

**AI bots** can lend, borrow and repay through the same credit market.

---

## 21. Mortality, inheritance and fitness by return (prototype 2.1)

**Laws added:**
- **Mortality and inheritance.** Bots live 6–14 generations. On death the estate (cash, cards with their cost basis,
  loans in both directions, notes) is split between 2 heirs carrying mutated copies of the genome. When heirs push
  the population past 115% of its start, the poorest bots leave the market. Departing bots settle their loans: loans
  they made are forgiven, loans they owe default.
- **Fitness is return on capital.** Each generation, bots are ranked by what their own decisions earned on the
  capital they started with; allowance, royalties and living costs are excluded. The bottom 10% adopt a mutated copy
  of a top-10% bot's genome and keep their own wealth.

**500 generations, seed 88:**
- **Wealth no longer locks in.** The Gini peaks at 0.74 around generation 150, then falls back to 0.24–0.42 as
  fortunes split between heirs. It used to climb to 0.99 and stay there.
- **Lineages now run deep:** up to generation 94, against 5 before.
- **Strategy eras succeed each other:**
  - **Generations 1–20:** market making leads (up to 72 of ~115 bots).
  - **Generations 20–250:** momentum and dip buying earn 15–43% per generation and spread. They profit from each
    other and from the herd.
  - **Generations 250+:** hoarding takes over (104 of 115 bots by generation 500). Momentum and dip buying go
    extinct because nobody trades with them any more; prices sink to 0.08–0.5× value in an illiquid market.
- **Leverage and theft die out:** borrowing appetite falls to about 0.04, defaults stop after generation 100, and no
  thieves remain at generation 500.
- **One strategy family wins:** adoption joins a bot to its mentor's family, so 90 founding lineages narrow to 3 by
  generation 50 and 1 by generation 350.

**Caveat:** hoarding wins the late game partly because of the remaining artifact. After the real history, hidden
values still random-walk without bound, which rewards buy-and-hold. Bounded careers (retirements and new rookie
classes) would remove that bias.


## The simulated league (hidden value, default)

After the save's last real season (Y88) a simulated league plays on and sets every card's hidden value
(`valueModel: 'league'`; spec: [league-sim-spec.md](league-sim-spec.md)).

- **Rates are measured, not chosen.** `sandbox/measure_league.mjs` reads the save's real seasons (`sandbox/data/timeline.json`)
  and writes `sandbox/data/league_rates.json`: full season (17 games), games missed, season-to-season form changes, award
  counts and positions, retirement, Career Legacy growth, the real NFL players in the OVR pool, and the pressure effect (after
  a big rise in card value the next season tends to fall off; after a fall, rebound). Where the save is too thin (age),
  `sandbox/measure_nfl_age.mjs` measures real NFL weekly rosters and careers (nflverse) into `sandbox/data/nfl_age.json`:
  injury risk by age, the chance a career ends at each age, and rookie ages. The league keeps the save's overall injury and
  retirement rates; only who is hurt or retires follows age.
- **Each week** every active, healthy player plays one game (stats drawn around his per-game rates). **Each season's end:**
  a Super Bowl (rings to the champion's players), MVP / OPOY / DPOY / Super Bowl MVP in the save's numbers, retirements by age
  (each replaced by a rookie at the same position and club, with new card markets and a print run, his first season copied
  from a real early-career season, his name mixed from real NFL and college rosters: `sandbox/data/rookie_names.json`), the
  Hall of Fame (Career Legacy 7,500), and each player's form change plus the measured pressure shift.
- **Value** is the site's own formula, checked against the real Y88 values (OVR 203/203 exact, value 203/203 within 1 coin).
  Active players are rated on League Score per game over their last `formSeasons` × 17 games (games missed injured count as
  zero), retired players and the real NFL players on career per game; the market opens at the site's real values and moves
  to the per-game rating over the first two seasons. Hidden value never reads a price.
- **News** is public: the card network sees weeks out injured, form against career pace, a reigning award, retired and
  rookie; the League news panel lists injuries, returns, the champion, awards, the Hall of Fame, retirements and rookies.
  Outside collectors' budget follows Career Legacy × current form (`outsideNews`, an assumption).
- **Settings** (Rules ▸ Values and prices): rate players on form or career, form window, pressure, injury risk after a rise
  (`hypeInjury`, the owner's setting, not measured), injuries, injuries by age, retirement, retirement by age, rookies, awards.

- **Value dealers** (`outsideMode: 'value'`, default): 25 outside dealers who know last week's value from the site formula
  (never this week's), each with its own error (±15% bias plus a per-card wobble), a share of the outside budget and room
  for 40 copies. They buy asks below their reference and sell from their stock into bids above it; when their money or
  room runs out, a bubble can outrun them. The older 'budget' and 'band' modes are kept.
- **Royalties** are paid weekly from each game (a big game pays more; injured or retired players pay nothing) and count in
  a bot's fitness. **Fitness** is the mean return over 6 generations. **Practice generations** (3 by default): the bots
  evolve in a private market before the one you watch (about a minute before the page starts).
- **Why they traded:** every filled order from a neural bot is logged with the card-network input that pushed hardest
  toward it (the trade log in each account, and the chart's market internals).
- **Prices:** an untraded card is marked from its player's other cards' trades (comparable sales); the Vault index is a
  repeat-sales index fitted over the last 104 weeks from all pairs of trades of the same card.
