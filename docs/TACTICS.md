# The tactic tracker

The tactic tracker measures what bots actually did, groups bots with similar behaviour into tactics, names each
tactic in plain words, and follows tactics from one generation to the next. Code: `tkSide`, `tkTrade`, `tkAdd`,
`tacProfile`, `kmeansSil` and `tacticTrack` in `engine.mjs`. Output: `frame.gen.tactics`, a compact history in
`W.tacticHist`, the page's Tactics panel, and `tools/tactics_report.mjs`.

It is measurement only. It draws nothing from `W.rand` and nothing a bot sees or does depends on it. A run with the
tracker on is identical week by week to one with it off, apart from the `gen` field.

The strategy clusters in the `gen` record (`clusters`, METRICS.md section 7) are different: they group bots by how
their networks answer 24 fixed sample cards, not by what they did, and they are not followed across generations.

## 1. Profiles

**Who is profiled.** Every neural bot that has been in the market for at least half a generation (10 weeks) at the
generation end. Newer bots are counted as `unprofiled`.

**What is tallied.** During the generation each bot keeps a tally (`b._tk`), updated as events happen: each side of
every trade (order book, dealer, liquidator, auction), loans made and taken, short sales, cards lent to short sellers,
packs opened, auction listings, sealed bids, and forced selling requested. The tally is reset at each generation end.

**The 23 features** (`TAC_F`, computed by `tacProfile`). `base` is the average of the bot's worth at the start and
end of the generation, at least 1,000 coins.

| Feature | Definition | Transform |
|---|---|---|
| `buys`, `sells` | Copies bought and sold | log(1 + x) |
| `turn` | Coins traded (both sides) ÷ base | log(1 + x) |
| `netBuy` | (coins bought − coins sold) ÷ coins traded | none |
| `bMark`, `sMark` | Mean log(price ÷ the card's mark before the trade), buys and sells | clipped to ±1 |
| `bGuide`, `sGuide` | Mean log(price ÷ the price guide for that card), when the guide is on | clipped to ±1 |
| `bEst`, `sEst` | Mean log(price ÷ its own fresh research estimate), when it held one | clipped to ±1 |
| `hold` | Mean weeks a copy was held, over copies sold and copies still held | log(1 + x) |
| `cash` | Cash ÷ (cash + holdings at marks) | none |
| `conc` | Its top player's share of its holdings at marks | none |
| `lend`, `borrow` | Coins lent and borrowed ÷ base | log(1 + 10x) |
| `shorts`, `cardsLent` | Short sales; cards lent to short sellers | log(1 + x) |
| `packs`, `lists`, `sealed` | Packs opened; auction listings; sealed bids | log(1 + x) |
| `botShare` | Share of its trades made with another bot (not a dealer, the liquidator or the store) | none |
| `aucShare` | Share of its trades made at auction | none |
| `forced` | Forced selling requested (margin calls, unpaid bills, taxes, shocks) ÷ base | log(1 + 10x) |

Hidden value never enters a profile. Every price is compared with something the bot can see: the mark, the public
guide, or its own note.

## 2. Clustering

1. Each transformed feature is z-scored across the profiled bots (population standard deviation). A missing value,
   such as a sell-price ratio for a bot that never sold, is set to the mean (z = 0).
2. k-means is run for every k from 2 to `tacticKMax` (8), with k-means++ starts drawn from a private generator seeded
   at 7000 + k, for at most 40 iterations. Fewer than 12 profiled bots: no clustering.
3. The k with the highest mean silhouette is kept. The silhouette is reported as `sil`.

## 3. Names

Each cluster is named after up to three of its most distinctive features: the features with the largest absolute
centroid z-score, taken in that order, skipping any with |z| < 0.4, and using at most one feature from each group
(activity: buys, sells, turn; buy price: bMark, bGuide, bEst; sell price: sMark, sGuide, sEst). Each chosen feature is
stated in plain units from the members' mean raw values (`TAC_SAY`). Examples from runs: "holds ~26 weeks, sells
little (~7 a gen)"; "borrows (93% of its worth a gen), forced to sell (38% of its worth a gen), sells into auctions
(~24 listings a gen)". A cluster with no feature at |z| ≥ 0.4 is "close to the market average on every count".

A name describes a cluster in one generation. The same tactic id can carry different names over time as its centroid
drifts.

## 4. Following tactics across generations

**Distance.** The distance between two centroids is the root mean square, over features, of their difference in the
transformed scale divided by this generation's standard deviation of that feature.

**Matching.** Every (new cluster, last generation's tactic) pair is sorted by distance. Pairs are taken greedily from
the closest, one to one, while the distance is at most `tacticMatch` (1 sd). A matched cluster keeps the tactic's id
and records how far it moved (`dist`).

**Birth.** An unmatched cluster is a new tactic with a new id. The nearest of last generation's tactics is recorded as
its `parent`, with the distance (`parentDist`).

**Death.** A tactic of the last generation that no cluster matched dies. The record keeps its id, name, age, last
share, and the nearest tactic alive now (`into`).

**Origins.** For each tactic, its bots are classified by where they came from since the last generation end:

| Origin | Meaning |
|---|---|
| `stay` | In this tactic last generation too |
| `switch` | In another tactic last generation; its own networks (changed only by learning) |
| `copy` | Copied a top bot's networks through selection, or arrived as an offspring newcomer |
| `heir` | Inherited its networks from a bot that died |
| `new` | A newcomer with random networks, or not profiled last generation |

`src` lists the top 3 source tactics for bots that switched, copied or inherited.

**Returns.** For each tactic: the mean and median return at selling value (`ret`, the fitness return when
`fitnessValue: 'bid'`), the mean and median return at marks (`retMark`), and the median fitness (`fit`). Allowance and
living costs are removed from both returns.

## 5. Flags

Both flags need a trend that holds over `tacticWindow` (2) consecutive generations, read from the tactic's last
`tacticWindow + 1` records. Records must be from consecutive generations.

- **Crowding** (`crowding: true`). The tactic's share rose and its mean return fell in every one of those generations.
  More bots doing the same thing, each earning less: the tactic is competing with itself.
- **Cannibalization** (`cannibalizedBy: <id>`). The tactic's share fell in every one of those generations and its mean
  return at the end of the window is below its return at the start, while the tactic with the nearest centroid rose
  (its share rose in every generation of the window, or it was born inside the window and its share has risen in
  every generation since). A neighbouring tactic is taking its bots and its returns.

A flag is an observation about two series. It does not establish that one tactic caused the other's decline.

## 6. Parameters

| Setting | Default | Realism | What it does |
|---|---|---|---|
| `tactics` | true | true | Turns the tracker on |
| `tacticMatch` | 1 | 1 | Largest centroid distance, in standard deviations, at which a cluster keeps a tactic's id |
| `tacticWindow` | 2 | 2 | Generations a trend must last before a flag |
| `tacticKMax` | 8 | 8 | Largest k tried |

Fixed in code: 10 weeks minimum time in the market to be profiled; |z| ≥ 0.4 for a feature to enter a name; 3
features per name; 12 bots minimum; 40 k-means iterations; private generator seeds 7000 + k; 12 generations of
history kept per tactic.

## 7. The record

`frame.gen.tactics`:

| Field | Meaning |
|---|---|
| `k`, `sil` | Number of clusters and their mean silhouette |
| `bots`, `unprofiled` | Bots profiled and bots too new to profile |
| `list[]` | One entry per tactic, largest first: `id`, `name`, `n`, `share`, `ret` [mean, median], `retMark` [mean, median], `fit`, `age`, `born`, `parent`, `parentDist`, `dist`, `from` (origins), `src`, `crowding`, `cannibalizedBy`, `top` ([feature, z, raw mean] for the named features) |
| `died[]` | `id`, `name`, `age`, `lastShare`, `into` |
| `born[]` | Ids of tactics born this generation |

`W.tacticHist` keeps one compact row per generation: `[id, n, share, mean return, mean return at marks, crowding,
cannibalizedBy]` per tactic, plus born and died ids.

## 8. Reading a run

```bash
node tools/tactics_report.mjs runs/<run>/run.json           # timeline, one block per generation
node tools/tactics_report.mjs runs/<run>/run.json --grid    # adds a share-by-generation table
node tools/tactics_report.mjs runs/<run>/run.json --json    # the parsed history as JSON
```

The report prints the median returns (at selling value / at marks), each tactic's origins, births with their parent,
deaths, and the flags.

## 9. Limits

- Silhouettes have been low: 0.13 to 0.15 in early runs and 0.15 to 0.25 in the 120-week round 5 run. Behaviour is
  closer to a continuum than to separate types. Treat a tactic as a region of behaviour, and read births and deaths
  near the match threshold with that in mind.
- A tactic keeps its id while its centroid drifts slowly, so a long-lived tactic can end far from where it started.
  `dist` records each generation's move.
- Distances are measured in each generation's own standard deviations, so a change in the population's spread changes
  what "1 sd" means between generations.
- Only bots with at least 10 weeks in the market are profiled; with high turnover a large share can be unprofiled.
