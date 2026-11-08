// Retro Vault Sandbox engine: one world, run by the browser prototype (docs/trading-floor.html) and by the
// Node runner with AI bots (sandbox/run.mjs). Plain JS, no dependencies, deterministic for a seed (AI bots aside).
//
// The world: a fixed pool of cards for the 203 real league players. Nothing is simulated about the players: their
// stats are the real ones, in a library a bot can read only with research passes (3 a week by default). Each card has
// a HIDDEN fundamental (the site's card value, in coins) that no bot ever sees; bots estimate it from research.
// Bots trade cards in a weekly call auction, buy packs that mint from the pool, trade research passes, and swap or
// steal research notes. Every decision a run depends on is in DEFAULTS below.

let PRACTICE_HOOK = null; // called (week, of) during practice generations, so a page can show progress
export function setPracticeHook(f) { PRACTICE_HOOK = f; }
export const DEFAULTS = {
  seed: 88,
  weeksPerGeneration: 20, // evolution and royalties happen at the end of each generation
  valueDivisor: 1, // the site's card values are divided by this to get coins (1 = the site's exact prices)
  coinScale: 20, // every coin amount in the rules (cash, allowance, stakes, costs, pass and ticket prices) is in units of this
  startCash: 20000,
  allowance: 1800, // coins per bot per week (new money: this is the inflation lever)
  fee: 0.01, // share of every card sale kept by the house
  packSize: 5,
  packEdge: 0.25, // packs cost their expected hidden value × (1 + edge)
  poolMultiplier: 10, // unminted copies in the pool = copies in circulation at the start × this
  passesPerWeek: 3, // research passes granted to every bot each week
  passLife: 1, // weeks before an unused pass expires (1 = use or sell it this week)
  maxResearchPerWeek: 6, // most players one bot may research in a week, own and bought passes together
  passesTradable: true,
  knowledgeWeeks: 12, // a research note goes stale after this many weeks
  memoryCap: 25, // most notes one bot keeps (oldest dropped first)
  sharing: true, // bots may swap notes ("friendly")
  stealing: true, // thieves may copy another bot's notes
  detectChance: 0.35, // chance a theft is noticed; the victim then flags the thief and stops sharing with it
  gossip: true, // a victim's friends flag the thief too
  outsideCollectors: true, // buyers from outside the bots bid around hidden value (the market's anchor)
  royalties: true, // each generation, holders get 3% of hidden value per card held
  royaltyRate: 0.1, royaltyEvery: 'week', royaltyFunding: 'minted', // royaltyFunding 'minted': new coins (prices inflate); 'house': paid only out of the house's takings (fees, pack sales, living costs), a closed loop that can fall short
  // royaltyRate: share of hidden value a card pays its holders per weeksPerGeneration (20) weeks; 'week' pays it weekly, from that week's game under the league
  evolve: true, // each generation the worst 10% by recent return adopt a mutated copy of a top 10% bot's networks (so strategies that trade well on the news can spread); off: strategies spread only through heirs
  evolveShare: 0.1,
  mortality: true, // bots live 6–14 generations; on death the estate is split between heirs that carry a mutated copy of the genome
  lifespan: [6, 14],
  heirs: 1, // an estate passes to this many heirs, each with a mutated copy of the networks (1 keeps the population steady: it changes only through newcomers and bots that give up or retire)
  capPoorest: false, populationCap: 1.15, // OLD RULE (off): heirs beyond populationCap × the starting population push the poorest bots out of the market
  // Intrinsic value: 'ovrWalk' (default) starts every card at the site's price for it (its value × its rarity). Each week
  // it rises by a percentage with probability walkUp, else falls by the same percentage. The size of that move comes
  // from the card's risk rating: ±walkVolLow at riskLo or below, ±walkVolHigh at riskHi or above, in between in a line.
  // With every card rising 55% of weeks, riskier cards earn more on average but swing far harder. The risk rating
  // starts at the player's OVR and then follows the card's own record: riskPerDoubling points up for every doubling of
  // its value since it entered the market (down for every halving), plus or minus any change in his real OVR from new
  // seasons. A low card that keeps rising becomes a safe, slow one; a top card that crashes becomes risky.
  // Never below 1% of where it started. 'formula' follows the site's value formula season by season instead.
  // 'factors' (default): value = player factor × supply factor and nothing else. The player factor is the site's value
  // for him from his real data (OVR, skill, Career Legacy); it changes only when a season changes that data, and past the
  // real history it holds (pastSave 'hold': no data, no change; 'draw' replays a random real season-to-season change from
  // his position, which compounds about ×1.21 a season). The supply factor is
  // (copies out now + print run) ÷ (copies out at the start + print run), raised to −scarcity: packs opened add copies and
  // lower it, collectors taking cards out raise it. Nothing here says which way a value goes.
  valueModel: 'league', scarcity: 0.5, pastSave: 'hold',
  // formulaPull ('formula' model only, past the save): how far each drawn season pulls a value back toward its last real one
  // (0 to 1; 0 = none). A disclosed factor: it sets a direction (back toward the anchor). Without it the draws compound: a
  // log change averaging zero still grows the average value by exp(sd²/2) a season (16% for linemen, about 400× in 40 seasons).
  formulaPull: 0.25,
  // 'league' (default): after the last real season a simulated league plays on (rates measured from the save:
  // sandbox/data/league_rates.json) and the site's own value formula reprices every player weekly from its stats.
  // valueBasis 'form': an active player is ranked (in the site's one OVR pool) on his career League Score × his form, the
  // production per game over his last formSeasons × 17 games (games missed injured count as zero: injuryCountsInForm)
  // ÷ his career per game. The window starts at his career pace, so the market opens at the site's real values.
  // Retired players keep career OVR. 'career': everyone on career OVR, exactly as the site.
  formSeasons: 1, injuryCountsInForm: true, injuryByAge: true, retirementByAge: true, // injuryByAge: injury chance follows the real NFL's risk by age (sandbox/data/nfl_age.json)
  // pressure: next season's form change is shifted by how much his card value moved this season (measured in the save: a
  // big rise tends to be followed by a falloff, a fall by a rebound). hypeInjury (0 = off, the owner's setting, NOT measured:
  // the save shows no link): extra chance of an injury spell next season, × the log rise of his value this season.
  pressure: true, pressureStrength: 1, hypeInjury: 0, // pressureStrength 1 = the measured shift; above 1 is the owner's setting
  // gameNoise: the spread of a game's yards around the player's per-game rate (only season totals are known).
  valueBasis: 'form', injuries: true, retirement: true, rookies: true, rookieRule: 'replacePlus', extraRookies: 3, // rookieRule 'replacePlus' (default): one rookie per retiree at his position and club, plus extraRookies (3) more a season; 'replace': one per retiree only (66 active always); 'measured': arrivals at the save's measured rate, whoever retires
  awards: true, gameNoise: 0.4,
  // leagueFill 'save' (default): the league is the save's own players (66 active in Y88, a few per club). 'full': every club
  // carries a real Retro Bowl roster of rosterSize (10: QB, RB, 2 WR, TE, OL, DL, LB, 2 DB; the save's own full rosters).
  // At the open each club × position short of it gets a generated veteran: a rookie built from measured data (as addRookie)
  // who has already played s seasons, s drawn from the seasons played by the save's active players, under the league's own
  // season rules (injuries, form swings, Career Legacy growth; no awards or rings). His cards are dealt out like real ones.
  // At each season's end retirees are replaced and any gap filled until every club × position is back at rosterSize
  // (rookieRule and extraRookies are not used; a slot above the shape is never filled, so it drifts down). OVR and value
  // for everyone come from rank within position among the save's own players (and the game's legends): a fixed reference,
  // so real cards keep the values they would have had and a generated player is worth where he would rank in it. Money
  // follows the cards: allowance, outsideBudget and packsPerWeek are scaled by copies in circulation at the open ÷ the
  // copies of the save's own players. Needs valueModel 'league', history on and startSeason 'latest'.
  // dormantAfter (weeks; 'full' only): a retired player none of whose cards anyone holds (bots, the liquidator, outside
  // dealers, one-of-a-kind items) and whose markets saw no trade or order for this many weeks is set aside: the weekly
  // per-card loops skip his 16 markets. He wakes the moment anyone bids, lists, pulls or holds one. 0 = never.
  leagueFill: 'save', rosterSize: { QB: 1, RB: 1, WR: 2, TE: 1, OL: 1, DL: 1, LB: 1, DB: 2 }, dormantAfter: 52,
  walkUp: 0.55, walkVolLow: 0.15, walkVolHigh: 0.03, riskLo: 60, riskHi: 95, riskPerDoubling: 10,
  startSeason: 'latest', // 'latest' opens the market at the present (site prices and price history imported); 'first' replays from Y79
  priceOnly: false, // a card is worth only what someone pays: no hidden value anywhere in the world (no royalties, packs priced
                    // from market prices, no valuation contest, research shows what a card has traded for). Real seasons still
                    // update the library's stats and the game questions, and bring rookies. Off by default: with nothing to
                    // anchor them (holding earns nothing, cards have no use), prices ratchet down to about zero.
  history: true, // replay the save's real seasons as news (sandbox/data/timeline.json), then real-change draws after
  seasonWeeks: 20, // weeks per season
  turnover: true, // newcomers with fresh random networks arrive (entryRate a week, the only source of new strategies); bots that lose 70% of their peak may give up, and a few retire
  entryRate: 0.25, // newcomers per week
  // entrants 'random' (default): a newcomer brings a brand-new random network; 'offspring': a mutated copy of a bot already
  // in the market, its parent picked the way evolution picks (at random from the top evolveShare by fitness, shared
  // fitness when fitnessSharing is on); random until the first generation has ended. Its cash is a newcomer's as before.
  // fitnessSharing (0 = off): evolution ranks bots by fitness divided by (niche count)^strength, the niche count being how
  // many bots' card networks behave like its own (tanh of each output on 24 fixed sample cards, RMS distance, a triangle
  // kernel of radius sharingRadius). Fitness is first shifted to be positive. A common strategy scores less, a rare one more (NEAT).
  // populationFloor (0 = off): a share of the starting population; when bots leave and the market falls below it,
  // newcomers (random or offspring, per entrants) top it back up that week. The world still decides who leaves.
  // practiceWorlds (1 = today): practice runs on this many private markets (different seeds) with one shared set of
  // networks; each generation they play every world, are scored by their average fitness across the worlds, and the
  // worst evolveShare copy the best once. Above 1, turnover, deaths, evolution inside each world and learning within a
  // lifetime pause during practice (they would make the worlds' populations differ).
  entrants: 'random', fitnessSharing: 0, sharingRadius: 0.5, populationFloor: 0, practiceWorlds: 1, // sharingRadius: about how far a copy drifts from its source in one generation (measured: 0.49; two random bots 0.68)
  retireRate: 0, // share of bots that leave at random each week (the old rule was 0.002)
  lenderCycle: false, // (retired: credit is now between bots, so rates and limits come from their own decisions)
  fashion: false, // collectors' taste for each player family drifts, jumps on hype and feeds on price gains
  gameStake: 40, // coins each entrant stakes into a game's pot (plus a ticket); the best scores share the pot
  prizeShare: 0, // share of the house's weekly takings (trade fees, pack sales, living costs) added to contest prizes (0: games pay only from the stakes, so only skill wins)
  aiLifespanWeeks: [40, 80], // an AI bot's life; when it ends its estate and memo pass to one heir, who carries on
  games: true, // weekly Arcade contests (see GAMES)
  gameTickets: 3, // game tickets granted to every bot each week; a ticket is spent when a game starts (no restarts)
  ticketLife: 1, // weeks before an unused ticket expires
  ticketsTradable: true, // bots may sell tickets to bots that play better
  maxGamesPerWeek: 6, // most games one bot may play in a week, own and bought tickets together
  auctions: true, // bots may put a card up for a sealed-bid auction (highest bid wins, pays the second-highest)
  // Real-world forces (on by default): bots must pay to live, and can borrow against their cards
  livingCost: 80, // coins a bot must spend each week just to stay in the market (leaves the economy)
  lifestyle: 0.0015, // plus this share of its worth: richer bots spend more, as people do
  credit: true, // bots may lend to and borrow from each other, secured by the borrower's cards (no bank, no new coins)
  maxLTV: 0.6, // most a bot can borrow, as a share of its cards' value
  marginCall: 0.75, // past this share of its cards' value, a borrower must sell at a discount until it is back under maxLTV
  loanWeeks: 8, // loans fall due after this many weeks; a borrower that can't repay must sell, and after 3 late weeks defaults
  interest: 0.002, // (unused without a bank) the rate is whatever lenders and borrowers agree
  // Artificial safeguards (policy experiments, all off by default)
  store: false, // the Vault store sells unminted copies at hidden value × (1 + storePremium): a ceiling while the pool lasts
  storePremium: 0.6,
  priceLimit: 0, // a card's price can move at most this much in a week (0 = off)
  centralBank: false, // the allowance follows prices: more coins when cards trade below hidden value, none when above (inflation targeting)
  bankTarget: 1, // the price ÷ hidden value the bank aims for
  bankGain: 4, // how hard it reacts: allowance × (1 + gain × (target − price ÷ value)), between 0 and 4× the base
  closedEconomy: false, // instead: allowances and royalties paid only from what the house collects (no printed money)
  wealthTax: 0, // weekly tax on worth above 2× the median bot, paid into the house treasury (0 = off)
  positionLimit: 0, // no bot may hold more than this share of a card's circulation (at least 3 copies allowed; 0 = off)
  // The liquidator sells the cards of bots that defaulted or left. 'cutWhenUnsold': each card's asking price is set
  // once when it arrives (liqStart × its price that day) and cut by liqStep only in weeks when no copy of it sells,
  // so it never chases its own falling price. 'chase': the old rule, liqStart is ignored and it asks 80% of each
  // week's price (which pulls prices down by itself).
  liquidation: 'auction', liqListings: 30, liqStart: 0.95, liqStep: 0.05, // 'auction': seized copies go to the sealed auction with no minimum price, liqListings a week; 'cutWhenUnsold' / 'chase': the old asks (liqStart, liqStep)
  twoSidedQuotes: true, // between trades, a price is marked to the spread only when the book has both an unfilled bid and an unfilled offer; off: any unfilled bid above or offer below pulls it (the old rule, which dragged every price down while random bots posted far more offers than bids)
  quotePull: 0.25, // how far unfilled orders pull the quoted price toward them each week (priceRule 'quotes' only)
  priceRule: 'comps', compsWeeks: 4, vaultIndex: 'repeatSales', // 'comps' (default): an untraded card is marked from its player's other cards' trades in the last compsWeeks weeks (comparable sales); 'lastTrade': its own last trade only. vaultIndex 'repeatSales': from pairs of trades of the same card; 'basket': every card's mark
  // 'lastTrade': a card's price is the last price it traded at; best bid and ask are shown, never move it. 'quotes': the old pull
  // markRule 'book' (default): the last trade or comparable-sales mark, kept inside the standing book (the median of the
  // markDepth best asks pulls it down, of the best bids up, once it has held markWeeks weeks running). markHalfLife: an
  // untraded mark drifts toward the book with this half-life (0 = off): with both sides, toward their middle; with only
  // asks, down toward the lower of the ask level and the last trade; with only bids, up toward the higher of the bid level
  // and the last trade; with neither, it holds. Asks never raise a mark, bids never lower one. fireShare: a card auction
  // sale below this share of the card's mark the week before counts as a fire sale (measurement only). holdCost: share of each card's mark its holder pays
  // a week to the house (0 = off). wealthTaxForced: the unpaid part of the wealth tax becomes a forced sale.
  // estateSale: share of a dying bot's cards sold before the heirs inherit. cashShocks: weekly chance of a cash need of
  // size × worth (the owner's assumption, not measured).
  wealthTaxTo: 'equal', // where the wealth tax goes: 'equal' (default) paid out to every bot alike, like a citizen's dividend; 'belowMedian' to the bots below the median worth; 'house' into the house treasury (it leaves circulation unless Closed economy is on)
  // Bots' freedom: priceRange (±60%) around a base the card network chooses between the price and its own research estimate
  // (priceAnchor); keepMax (95%) the most cash it may target; rateMax (5% a week) the highest loan rate it may offer or
  // adaptBar: what a trial is judged against. 'kept' (default): the score of the last kept period, from another stretch of
  // the market; 'fresh': after a rejected trial the restored networks run one period untouched and that score is the bar;
  // 'market': every score is measured against the median score of all neural bots over the same period (the market's common
  // move removed). entryReturns: newcomers × (1 + entryReturns × the median bot's own return over the last 11 weeks, allowance
  // and other money it didn't earn removed): word of mouth (owner's assumption, only how many arrive, never what they do).
  // entryNews: newcomers × (1 + entryNews × news), news = the league's public news this last 4 weeks (Super Bowls, awards,
  // Hall of Fame inductions, retirements, rookies, injuries, returns, season openings: the league items of the news feed)
  // over its 52-week average, minus 1, floored at 0: people hear about the hobby when the league is in the news (an
  // assumption; only how many arrive, never what they do). The league has no records or club trades to count.
  // botScale: with a full league (leagueFill 'full'), 'cards' multiplies the starting population, the newcomer rate and
  // the population floor and cap by W.fillK, the factor money and packs already follow; the allowance is then split over
  // the larger population, so its total still grows by W.fillK once. 1 (default): as before, the same bots for any league.
  // accept; maxOrderQty, maxListings, maxShorts, maxPacks: per-card order size and weekly counts. quitRule 'drawdown'
  // (default): a bot that lost quitDrawdown of its peak may give up, quitChance a week; 'network': its own quit output.
  // forcedOrder 'network' (default): forced sellers sell the cards their own network most wants to sell; 'price': dearest first.
  adaptOn: false, adaptEvery: 10, adaptSize: 0.05, adaptBar: 'kept', lossRate: 0, entryHype: 0, entryReturns: 0, entryNews: 0, botScale: 1, // adapt*: learning within a lifetime (off); lossRate: share of copies lost per season (owner's assumption); entryHype: newcomers × (1 + entryHype × the Vault index's 20-week rise) (owner's assumption)
  priceRange: 0.6, priceAnchor: true, keepMax: 0.95, rateMax: 0.05, maxOrderQty: 3, maxListings: 1, maxShorts: 3, maxPacks: 3,
  // priceMap: how the 'price offset' output becomes a price. 'range' (default): base × (1 + priceRange × tanh(output)), a wall
  // at ±priceRange; 'log': base × exp(priceLogK × output), the same slope at 0 (0 = the base) but no wall: ×3 or ÷3 at output
  // ±1.8, held only by a numerical safety clamp of priceClamp either way; it also frees the pack bid (exp(output) instead of
  // exp(tanh(output)), held by the same clamp). rateMap: how the two loan-rate outputs become rates. 'range' (default):
  // 0.1% to rateMax through a sigmoid; 'log': rateLogMid × exp(output) (2.5% at output 0, about the range's midpoint), no rateMax, held only
  // by the numerical safety bound rateClamp (10 = 1,000% a week).
  priceMap: 'range', priceLogK: 0.6, priceClamp: 50, rateMap: 'range', rateLogMid: 0.025, rateClamp: 10,
  quitRule: 'drawdown', quitDrawdown: 0.7, quitChance: 0.25, forcedOrder: 'network',
  singleBidder: 'own', // an auction with one bidder: 'own' (default) it pays its own bid; 'reserve' it pays the reserve (with no minimum, 0.01)
  fitnessValue: 'bid', // 'bid' (default): fitness from what each bot could actually sell its holdings for that week (realValue); the page's worth is unchanged
  markRule: 'book', markDepth: 3, markWeeks: 2, markHalfLife: 0, fireShare: 0.3, holdCost: 0, wealthTaxForced: false, estateSale: 0, cashShocks: { chance: 0, size: 0 },
  collectorSaveWeeks: 26, // dealer savings, in weeks of budget, so dealers can afford star cards (they still buy only at or below their read of value; 4 = the earlier world)
  outsideMode: 'value', collectors: 25, collectorError: 0.15, collectorStart: 0.1, collectorPerCard: 4, collectorSpread: 0.05, // 'value' (default): two-sided dealers trading around last week's public value (see valueCollectors); 'budget': a price-taking budget; // 'budget': outsideBudget coins a week buy the lowest asks, spread by real popularity (Career Legacy), and outsideResale of what collectors hold is sold back into the best bids. 'band': the old 5% chance of a bid at 0.85–1.08× value
  outsideBudget: 250000, outsideResale: 0.02, outsideNews: true, // outsideNews: each player's share is his Career Legacy × his current form (the public news: a hot streak draws more, a slump or an injury less)
  forcedSale: 'book', // 'book': a margin-called or broke bot sells into the best bids, then lists the rest at auction with no minimum. 'discount': the old 88% ask and 70% item reserve
  packSale: 'auction', // 'auction': packsPerWeek are released and sold by uniform-price auction (everyone pays the lowest winning bid). 'markup': the old expected value + packEdge
  packsPerWeek: 33, packMix: { standard: 0.75, premium: 0.21, elite: 0.025, holo: 0.015 }, // the mix bots bought under the old price
  shorting: true, // bots may borrow cards from holders who lend them, sell them, and buy them back later
  cardLendFee: 0.005, // weekly fee a borrower pays the lender, as a share of the card's price
  shortMargin: 0.5, // cash a short seller posts as collateral, as a share of the price, per copy
  shortMaintenance: 0.25, // a short seller whose worth falls below this share of what it owes in borrowed cards is forced to buy back
  cardLoanWeeks: 12, // a borrowed card must be returned within this many weeks
  // A called short (due, or under shortMaintenance) must buy its card back: a neural borrower bids what its own card network
  // prices the card at, any other borrower coverBid × the mark; one still short coverGraceWeeks after the call (or that can't
  // pay the mark) is settled in cash at coverSettle × the mark, paid to the lender
  coverGraceWeeks: 3, coverSettle: 1.1, coverBid: 1.15,
  flagWeeks: 26, // a caught thief can't trade with the bots that flagged it; the flags lift after this many weeks without being caught again (0 = never)
  deployOrders: 10, // most buy orders a bot places a week to put spare cash to work
  // The most-traded list: live cards ranked by trades over hotWeeks weeks ('volume', default: plain trade count; 'momentum':
  // the old rule, trades × max(0.2, 1 + 4-week return), which tilts toward rising cards). Genome bots research from its top
  // hotResearch and look for orders in its top hotOrders, a genome collector's book draws from its top hotBook, and an AI bot
  // sees marketRows rows of it a week (it may page further with the marketPage action). Neural bots never read it.
  hotRank: 'volume', hotWeeks: 20, hotResearch: 40, hotOrders: 30, hotBook: 50, marketRows: 40,
  // attention: an attention budget for the neural bots (a world factor: how many cards a bot can look at, never which way it
  // trades). 0 (default): every bot's card network scores every live card each week. K > 0: each week it scores only the cards
  // it holds or owes, its watchlist (players it has notes on, cards it has up for auction, cards it traded in the last
  // attentionMemory weeks) and K other live cards drawn with W.rand: 'uniform' (default) every live card equally likely,
  // 'volume' in proportion to 1 + its public trade count over the last 4 weeks. Unattended cards get no new orders from that
  // bot that week (book orders, sealed auction bids, research), and the draw never reads its network or hidden values.
  attention: 0, attentionMemory: 8, attentionSample: 'uniform',
  messages: false, // AI bots may talk: one public board post and two private messages a week (280 characters each)
  messageLimits: { public: 1, direct: 2, chars: 280 },
  priceGuide: { on: false, every: 4, lag: 1 }, // a public price guide: each player's value, re-published every `every` weeks as of `lag` weeks earlier; bots and dealers see the same
  gameFloor: { need: 4, legs: 3 }, // NOT READ ANYWHERE: a leftover setting with no effect (no difficulty minimum is applied)
  leagueUpdates: false, // TEST ONLY: every updateEvery weeks some players' hidden values move, as a real upload would
  updateEvery: 40,
  population: 250, // non-AI bots at the start
  brain: 'nn', // 'nn': each bot is two small neural networks with random weights; 'genome': the older strategy-genome bots
  nnMutation: 0.15, // weight noise when a bot copies a better bot's networks (standard deviation per weight)
  nnReset: 0.01, // chance each copied weight is redrawn from scratch instead (bigger jumps)
  nnResearchError: 0.2, // how far a neural bot's research note can be off the hidden value (log-normal)
  nnFitnessGens: 6, // fitness = the mean return over this many generations (a longer window rewards consistency over luck)
  nnStartBias: 0, // newborn networks lean toward doing nothing: this is subtracted from the buy, sell, pack and borrow outputs' starting bias
  practiceGens: 3, // before the market opens, the bots play this many generations in a private practice market with the same rules and open with what they learned // neural bots are ranked by their average return over this many generations
  social: { sharer: 0.45, reciprocator: 0.35, thief: 0.2 }, // social style shares among rule bots
  // Tactic tracker (measurement only, frame.gen.tactics): each generation every bot's profile of what it actually did
  // (trades and their prices against the mark, guide and its own notes, holding period, cash, concentration, loans, shorts,
  // packs, auctions, counterparties) is clustered; a cluster within tacticMatch (RMS distance in the generation's standard
  // deviations) of a tactic of the last generation keeps its id, else a new tactic is born. tacticWindow: generations a
  // trend must last to flag crowding (share up, return down) or cannibalization. Changes nothing in the world.
  tactics: true, tacticMatch: 1, tacticWindow: 2, tacticKMax: 8,
};

export const ARCH = [
  { key: 'value', label: 'Value', short: 'VAL', color: '#3987e5', blurb: 'Strongest gene: the gap between its notes and the price.' },
  { key: 'mm', label: 'Market maker', short: 'MM', color: '#d95926', blurb: 'Quotes a bid and an ask on a handful of cards and earns the spread.' },
  { key: 'momentum', label: 'Momentum', short: 'MOM', color: '#199e70', blurb: 'Buys what is rising, sells what is falling. Sells its research passes.' },
  { key: 'retail', label: 'Herd', short: 'HRD', color: '#c98500', blurb: 'Rips packs, chases hot cards, panic-sells when the market drops.' },
  { key: 'arb', label: 'Pack arbitrage', short: 'ARB', color: '#d55181', blurb: 'Rips packs when their pulls sell for more than the pack costs, then flips them.' },
  { key: 'collector', label: 'Collector', short: 'COL', color: '#008300', blurb: 'Researches and hoards two favourite players. Can corner a card.' },
  { key: 'contrarian', label: 'Contrarian', short: 'CTR', color: '#9085e9', blurb: 'Buys sharp drops below the recent average, sells the bounce.' },
  { key: 'ai', label: 'AI bots', short: 'AI', color: '#e66767', blurb: 'An LLM decides: research, orders, packs, passes, notes. Run by sandbox/run.mjs.' },
  { key: 'nn', label: 'Neural', short: 'NN', color: '#3987e5', blurb: 'Two small neural networks with random starting weights decide everything; what earns money is copied.' },
];
export const AI = 7, NN_KIND = 8;
// Bots are compared by wealth, not by strategy: each week every bot is placed in one of three groups by its worth
export const GROUPS = [{ key: 'top', label: 'Top 10%', color: '#e66767' }, { key: 'mid', label: 'Next 40%', color: '#c98500' }, { key: 'low', label: 'Bottom 50%', color: '#3987e5' }];
export const OVR_BANDS = [{ label: 'under 70', lo: 0 }, { label: '70–79', lo: 70 }, { label: '80–84', lo: 80 }, { label: '85–89', lo: 85 }, { label: '90–94', lo: 90 }, { label: '95+', lo: 95 }];
export const FINISH_MULTS = [1, 1.5, 2.5, 6], DESIGN_MULTS = [1, 1.2, 1.8, 2.5, 1];
export const bandOf = (ovr) => { let k = 0; for (let i = 0; i < OVR_BANDS.length; i++) if ((ovr ?? 60) >= OVR_BANDS[i].lo) k = i; return k; };

/* ---------- Random ---------- */
function seeded(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- World ---------- */
export function createWorld(library, overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides, social: { ...DEFAULTS.social, ...(overrides.social || {}) } };
  const rand = seeded(cfg.seed * 7919 + 17), lib0 = library;
  if (fullLeague(cfg)) library = { ...library, players: library.players.slice() }; // generated players go into this world's own list, never the caller's (a practice world shares it)
  packCache = null; hot = []; mood = { drop: 0 }; // module state belongs to the newest world
  const W = {
    cfg, rand, t: 0, nextId: 1, cards: [], bots: [], events: [], arcsWeek: [], liq: new Map(),
    house: { fees: 0, packs: 0, outside: 0, royalties: 0 }, lastTrades: 0, passPrice: null, passTrades: 0,
    hist: { p: [], f: [], bub: [], gini: [], share: [], trades: [], money: [], pass: [], informed: [], flags: [], shares: [], thefts: [], gamePacks: [] },
    contests: null, predictions: [], gameStats: null, gameArch: null, gamePacksWeek: 0,
    tickets: true, ticketPrice: null, ticketTrades: 0, auctions: [], auctionResults: [], journal: [], board: [],
    treasury: 0, flow: null, botLog: new Map(),
    cool: {}, cornered: new Set(), bubbleOn: false, week: { shares: 0, thefts: 0, caught: 0, researched: new Map() },
    library,
  };
  W.guideNet = !!guideOn(cfg); useShape(W);
  W.byPos = {}; W.libIndex = new Map(); W.byKey = new Map(); W.mktByKey = new Map(); W.items = new Map(); W.liqItems = [];
  W.kitInfo = library.kits?.kits || null; W.kitMeta = library.kits || null;
  library.players.forEach((p, i) => { (W.byPos[p.pos] ||= []).push(p); W.libIndex.set(p, i); });
  W.gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  W.pick = (a) => a[Math.floor(rand() * a.length)];
  // Players hold the player-level facts; each has 16 card markets (4 designs × 4 finishes). A player's F is the
  // intrinsic value of his Prizm Base card: the site's price for it (card value)
  W.players = [];
  library.players.forEach((p, i) => {
    const F = Math.max(W.cfg.coinScale * 0.05, p.hidden.value / W.cfg.valueDivisor), S0 = Math.max(2, Math.round(40 / Math.sqrt(Math.max(0.5, p.hidden.value / 100))));
    W.players.push({ id: i, key: p.key, name: p.name, pos: p.pos, team: teamShort(p.team), F, F0: F, P: F, P0: F, S0, circ: 0, pool: S0 * cfg.poolMultiplier, Ph: [F], volH: [], isPlayer: true });
  });
  for (const c of W.players) W.byKey.set(c.key, c);
  W.families = familyList(library);
  library.players.forEach((p, i) => (W.players[i].fam = familyIndex(W.families, p)));
  startTimeline(W);
  if (fullLeague(cfg)) fillLeague(W);
  W.botK = cfg.botScale === 'cards' ? (W.fillK ?? 1) : 1; // bots follow the cards too (botScale)
  for (const p of W.players) for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = makeMarket(W, p, d, f); W.cards.push(m); W.mktByKey.set(m.key, m); }
  seedHistory(W);
  for (let k = 0, n = popOf(W); k < n; k++) W.bots.push(newBot(W, null));
  // A practice season: the same bots' networks first play cfg.practiceGens generations in a private market with the
  // same rules (another seed); the real market opens with the networks that came out of it
  if (cfg.practiceGens > 0 && cfg.brain === 'nn' && W.bots.length && (cfg.practiceWorlds ?? 1) > 1) practiceMany(W, lib0, overrides);
  else if (cfg.practiceGens > 0 && cfg.brain === 'nn' && W.bots.length) {
    const P = createWorld(lib0, { ...overrides, seed: (cfg.seed || 88) * 7919 + 1, practiceGens: 0 });
    const T = cfg.practiceGens * cfg.weeksPerGeneration; for (let t = 0; t < T; t++) { step(P); if (PRACTICE_HOOK) PRACTICE_HOOK(t + 1, T); }
    const pb = P.bots.filter((b) => b.g?.nn).sort((x, y) => (y.fit ?? 0) - (x.fit ?? 0));
    W.bots.forEach((b, i) => { const s = pb[i % pb.length]; if (s && b.g?.nn) b.g = { ...s.g, card: Float64Array.from(s.g.card), bot: Float64Array.from(s.g.bot), w: { ...s.g.w }, targets: [], book: [] }; });
    W.practice = { gens: cfg.practiceGens, endIndex: P.hist.p[P.hist.p.length - 1], endPF: bubble(P) };
    packCache = null; packCacheT = null; hot = []; mood = { drop: 0 };
  }
  if (W.bots.length) endow(W, W.bots);
  for (const b of W.bots) { b.nwh = [worth(W, b)]; b.genStart = b.nwh[0]; b.exo = 0; }
  if (cfg.games) { publishContests(W); publishContests(W); } // this week's contests and the ones two weeks out
  record(W);
  log(W, 'start', `The market opens${W.seasonLabel ? ` in ${W.seasonLabel}` : ''}: ${W.bots.length} bots, ${W.players.filter((p) => p.on !== false).length} players, ${(W.cards.reduce((s, c) => s + c.circ, 0) + W.items.size).toLocaleString()} cards in circulation (${W.items.size} one of a kind) and ${W.players.reduce((s, c) => s + c.pool, 0).toLocaleString()} still in the pool. Every card opens at the site's price for it.`);
  return W;
}
// Practice on several worlds (practiceWorlds > 1): one set of networks plays every private world each generation; each
// network's score is its fitness averaged over the worlds it is still in; the worst evolveShare copy the best (mutated, with
// world 0's generator); the market opens with the networks ranked by that score, as with one world
function practiceMany(W, library, overrides) {
  const cfg = W.cfg, K = cfg.practiceWorlds, wpg = cfg.weeksPerGeneration, T = K * cfg.practiceGens * wpg; let done = 0;
  const ov = { ...overrides, practiceGens: 0, practiceWorlds: 1, turnover: false, mortality: false, evolve: false, adaptOn: false, adapt: { ...(cfg.adapt || {}), on: false }, populationFloor: 0 };
  const Ps = Array.from({ length: K }, (_, j) => createWorld(library, { ...ov, seed: (cfg.seed || 88) * 7919 + 1 + j * 104729 }));
  const copyG = (g) => ({ ...g, card: Float64Array.from(g.card), bot: Float64Array.from(g.bot), w: { ...g.w }, targets: [], book: [] });
  let nets = new Map(Ps[0].bots.filter((b) => b.g?.nn).map((b) => [b.id, b.g])), score = new Map();
  for (let g = 0; g < cfg.practiceGens; g++) {
    for (const P of Ps) for (const b of P.bots) { const n = nets.get(b.id); if (n) b.g = copyG(n); }
    for (const P of Ps) for (let t = 0; t < wpg; t++) { step(P); if (PRACTICE_HOOK) PRACTICE_HOOK(++done, T); }
    const next = new Map(); score = new Map();
    for (const id of nets.keys()) { const fs = Ps.map((P) => P.bots.find((b) => b.id === id)).filter(Boolean); if (!fs.length) continue; next.set(id, fs[0].g); score.set(id, fs.reduce((a, b) => a + (Number.isFinite(b.fit) ? b.fit : 0), 0) / fs.length); }
    const ids = [...score.keys()].sort((a, b) => score.get(b) - score.get(a)), n = Math.max(1, Math.round(ids.length * cfg.evolveShare));
    if (g < cfg.practiceGens - 1 && cfg.evolve && ids.length > 4) { const best = ids.slice(0, n); for (const id of ids.slice(-n)) next.set(id, mutate(Ps[0], next.get(Ps[0].pick(best)))); }
    nets = next;
  }
  const ranked = [...score.keys()].sort((a, b) => score.get(b) - score.get(a)).map((id) => nets.get(id));
  W.bots.forEach((b, i) => { const s = ranked[i % ranked.length]; if (s && b.g?.nn) b.g = copyG(s); });
  W.practice = { gens: cfg.practiceGens, worlds: K, endIndex: Ps.map((P) => r2(P.hist.p[P.hist.p.length - 1])), endPF: Ps.map((P) => r2x(bubble(P))) };
  packCache = null; packCacheT = null; hot = []; mood = { drop: 0 };
}
export function teamShort(t) { const w = String(t || 'FA').split(' '); return t === 'Free agent' ? 'FA' : w[w.length - 1]; }

// AI bots join on equal terms: the same starting cash plus a basket as big as the average rule bot's, minted from the pool.
export function addAiBot(W, extra = {}) {
  const b = newBot(W, AI, null, { social: extra.social || 'reciprocator', ...extra });
  const lw = W.cfg.aiLifespanWeeks; if (lw) { b.lifespanW = lw[0] + Math.floor(W.rand() * (lw[1] - lw[0] + 1)); }
  b.line = extra.line || 1;
  const rule = W.bots.filter((x) => x.kind === 'rule'), avg = rule.length ? Math.round(rule.reduce((s, x) => s + x.n, 0) / rule.length) : 0;
  for (let k = 0; k < avg; k++) { const pk = packInfo(W, 'standard'); if (!pk.tot) break; const p = drawPlayer(W, pk, wpick(W, PACK_TYPES.standard.tiers)); if (!p) break; const x = rollCopy(W, p, 'standard'); mintCopy(W, b, x, p.F * copyMult(x)); }
  packCache = null; packCacheT = null;
  W.bots.push(b); b.nwh = [worth(W, b)];
  return b;
}

// Two bots can't deal with each other while either has flagged the other as a thief
const blocked = (a, b) => !!a && !!b && typeof a === 'object' && typeof b === 'object' && (a.flags?.has(b.id) || b.flags?.has(a.id));
function give(b, c, q) { const v = (b.h.get(c.id) || 0) + q; v > 0 ? b.h.set(c.id, v) : b.h.delete(c.id); b.n += q; }
// What a bot could actually sell for this week (fitnessValue 'bid', for fitness only): each copy fills one standing bid of
// another bot, highest first; copies beyond the bids are valued at the lower of the mark and the player's latest card-auction
// price within compsWeeks (brought to this card by its multiplier), or at the mark with worth()'s concentration haircut.
// Cash, debt, money lent and one-of-a-kind cards as in worth().
function realValue(W, b, st) {
  const fee = W.cfg.fee, k = W.cfg.compsWeeks ?? 4; let v = b.cash - (b.debt || 0) + (b.lent || 0);
  for (const [id, q] of b.h) { const c = W.cards[id], hc = q <= 3 ? 1 : 1 / (1 + 0.06 * (q - 3)), bs = typeof bids !== 'undefined' && bids?.[id] ? leftBids(c).filter((o) => o.b !== b) : [];
    let n = 0; for (; n < q && n < bs.length; n++) v += bs[n].p * (1 - fee);
    const rest = q - n; if (rest > 0) { const p = W.players[c.pid], auc = p.aucBaseT != null && W.t - p.aucBaseT < k ? p.aucBaseP * c.mult : null; v += rest * (auc != null ? Math.min(c.P, auc) : c.P * hc) * (1 - fee); if (st) st.noBid += rest; }
    if (st) st.copies += q; }
  if (b.items) for (const uid of b.items) { const it = W.items.get(uid); if (it) v += markItem(W, it) * (1 - fee) * 0.9; }
  return v;
}
const r2x = (x) => Math.round(x * 10000) / 10000;
export function worth(W, b) {
  let v = b.cash - (b.debt || 0) + (b.lent || 0);
  for (const [id, q] of b.h) { const c = W.cards[id]; const hc = q <= 3 ? 1 : 1 / (1 + 0.06 * (q - 3)); v += q * c.P * (1 - W.cfg.fee) * hc; }
  if (b.items) for (const uid of b.items) { const it = W.items.get(uid); if (it) v += markItem(W, it) * (1 - W.cfg.fee) * 0.9; } // one of a kind: harder to sell
  if (b.lentOut) for (const [id, q] of b.lentOut) v += q * W.cards[id].P * (1 - W.cfg.fee); // cards lent out are still yours
  if (b.owed) for (const [id, q] of b.owed) v -= q * W.cards[id].P; // borrowed cards must be bought back
  return v + (b.shortColl || 0);
}
const fresh = (W, n) => n && W.t - n.week <= W.cfg.knowledgeWeeks;
// Notes are kept per player (his Prizm Base card); for any other card the estimate scales by its rarity premium
export const estimate = (W, b, c) => { const n = b.notes.get(c.isPlayer === false ? c.pid : c.id); return fresh(W, n) ? n.est * (c.isPlayer === false ? c.mult : 1) : null; };
const playerOf = (W, c) => (c.isPlayer === false ? W.players[c.pid] : c);
const est = (W, b, c) => estimate(W, b, c) ?? c.P;
const ret = (c, L) => c.P / c.Ph[Math.max(0, c.Ph.length - 1 - L)] - 1;
const ma = (c, L) => { const h = c.Ph, n = Math.min(L, h.length); let s = 0; for (let i = h.length - n; i < h.length; i++) s += h[i]; return s / n; };
const recentVol = (c, L = 60) => { let s = 0; for (let i = Math.max(0, c.volH.length - L); i < c.volH.length; i++) s += c.volH[i]; return s; };

/* ---------- Library ---------- */
// What a research pass reveals: the full page minus the hidden value.
export function libraryPage(W, cardId) {
  const p = W.library.players[cardId];
  const { hidden, hallOfFame, stats, rates, ...page } = p;
  const e = W.era?.[cardId];
  if (!e) return { ...page, stats, rates };
  const risk = W.cfg.valueModel !== 'formula' ? riskRating(W, W.players[cardId]) : null;
  return { ...page, asOf: W.seasonLabel || W.timeline.seasons[0].season, ovr: e.ovr, skill: e.skill, grade: e.grade, careerLegacy: e.legacy, careerTotals: e.totals, perGame: e.perGame, ...(risk != null ? { riskRating: Math.round(risk), weeklySwingPct: Math.round(walkVol(W, risk) * 1000) / 10 } : {}) };
}
function writeNote(W, b, c, estValue, from, facts) {
  b.notes.set(c.isMkt ? c.pid : c.id, { est: c.isMkt ? estValue / c.mult : estValue, week: W.t, from, ...(facts ? { facts: String(facts).slice(0, 240) } : {}) });
  if (b.notes.size > W.cfg.memoryCap) {
    let oldest = null; for (const [id, n] of b.notes) if (!oldest || n.week < oldest[1].week) oldest = [id, n];
    b.notes.delete(oldest[0]);
  }
}
function research(W, b, c0) {
  const c = playerOf(W, c0);
  b.stats.researched++;
  jot(W, { type: 'research', bot: b.name, player: c.key });
  W.week.researched.set(c.id, (W.week.researched.get(c.id) || 0) + 1);
  // A rule bot's "analysis" is the hidden value seen through its own error. An AI bot writes its own estimate.
  // It also keeps what the page showed (career rates, totals, Career Legacy, play-style family), seen through the same
  // error (z): what its contest answers are computed from
  if (b.kind === 'rule') { const z = W.gauss(); writeNote(W, b, c, (W.cfg.priceOnly ? ma(c, 20) : c.F) * Math.exp(z * b.g.err), 'research'); const n = b.notes.get(c.id); if (n) { const e = eraOf(W, c.id); n.ovr = W.era?.[c.id]?.ovr ?? W.library.players[c.id].ovr; if (W.cfg.valueModel === 'ovrWalk') n.risk = riskRating(W, c); n.z = z; n.lib = { pg: { ...(e.perGame || {}) }, tot: { ...(e.totals || {}) }, leg: e.legacy ?? 0, fam: c.fam }; } }
}
function usePass(W, b) { if (!b.passes.length) return false; b.passes.sort((x, y) => x - y); b.passes.shift(); return true; }


/* ---------- Rarities: the site's card designs, finishes, kits, parallels and autographs ---------- */
// Every table below is copied from the site (src/utils/collection.ts, src/utils/cardMarket.ts, src/config/autographs.ts).
// A player has 16 tradable card markets (4 designs × 4 finishes, home kit, no parallel). Any copy that is one of a kind
// (an autograph, a Prizm colour parallel, an alternate or throwback kit) is an item, traded only at auction.
export const DESIGNS = ['Prizm', 'Jersey', 'Topps', 'Locker', 'Autograph'];
export const FINISHES = ['Base', 'Silver', 'Gold', 'Holo'];
const FINISH_MULT = [1, 1.5, 2.5, 6], DESIGN_MULT = [1, 1.2, 1.8, 2.5, 1];
const TIERS = ['common', 'rare', 'epic', 'legendary'];
export const PACK_TYPES = {
  standard: { label: 'Standard', size: 3, tiers: [75, 18, 6, 1], fin: [[86.5, 11.2, 2, 0.3], [87, 10.8, 1.95, 0.25], [88, 10, 1.8, 0.2], [89, 9.5, 1.4, 0.1]], des: [44, 29, 15, 8.5, 3.5], kit: [0.08, 0.025], prizm: [0.08, 0.04, 0.018, 0.0045, 0.0002] },
  premium: { label: 'Premium', size: 4, tiers: [66, 24, 8.5, 1.5], fin: [[80, 15, 4.5, 0.5], [81, 14.5, 4.1, 0.4], [82, 14, 3.7, 0.3], [84, 13, 2.8, 0.2]], des: [40, 29, 17, 10, 4], kit: [0.09, 0.03], prizm: [0.085, 0.045, 0.021, 0.0055, 0.00025], silverPlus: true },
  elite: { label: 'Elite', size: 5, tiers: [52, 30, 15, 3], fin: [[74, 20, 5.5, 0.5], [75, 19.5, 5, 0.5], [77, 18, 4.6, 0.4], [80, 16, 3.7, 0.3]], des: [36, 28, 19, 12, 5], kit: [0.1, 0.035], prizm: [0.09, 0.05, 0.024, 0.0065, 0.0003], epicPlus: true },
  holo: { label: 'Holo Showcase', size: 5, tiers: [52, 30, 15, 3], fin: [[74, 20, 5.5, 0.5], [75, 19.5, 5, 0.5], [77, 18, 4.6, 0.4], [80, 16, 3.7, 0.3]], des: [32, 28, 20, 13.5, 6.5], kit: [0.12, 0.045], prizm: [0.095, 0.055, 0.027, 0.008, 0.0004], oneHolo: true },
};
const STACK = { 2: [[1, 0.9, 0.8, 0.7], [1, 0.9, 0.8, 0.7]], 3: [[1, 0.85, 0.7, 0.55], [1, 0.85, 0.7, 0.55]], 4: [[1, 0.65, 0.45, 0.15], [1, 0.65, 0.5, 0.5]] }; // [tier factors, finish factors]
const COMBO_AUTO_LEG_HOLO = 0.15;
const KIT_BONUS = { home: 1, alt: 1.2, era: 1.4 };
const PRIZM = [{ c: 'Red', run: 199, m: 1.3 }, { c: 'Blue', run: 99, m: 1.6 }, { c: 'Green', run: 49, m: 2 }, { c: 'Gold', run: 10, m: 3.5 }, { c: 'Black', run: 1, m: 8 }];
const AUTO_PAR = [{ id: 'Sticker', run: 99, w: 50, m: 3 }, { id: 'On-card', run: 50, w: 27, m: 5 }, { id: 'Inscribed', run: 25, w: 13, m: 6 }, { id: 'Patch', run: 10, w: 8, m: 10 }, { id: 'Cut 1/1', run: 1, w: 2, m: 40 }];
const INKS = [['Ballpoint black', 10, 0.9], ['Ballpoint blue', 10, 0.95], ['Sharpie black', 22, 1], ['Sharpie blue', 14, 1.1], ['Felt tip, team colour', 16, 1.2], ['Paint pen silver', 12, 1.3], ['Broad nib navy', 6, 1.4], ['Broad nib oxblood', 5, 1.5], ['Paint pen gold', 5, 1.6]];
const INSCRIBE = { nickname: 1.3, hof: 1.25, mvp: 1.2, champ: 1.15 }, INSCRIBE_CHANCE = 0.12, THROWBACK = { chance: 0.06, mult: 1.25 };
const serialMult = (n, of) => (of === 1 ? 1 : n === 1 ? 1.5 : n === of ? 1.2 : 1);
function wpick(W, ws) { const t = ws.reduce((a, b) => a + b, 0); let r = W.rand() * t; for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return ws.length - 1; }
// The site's tiers: Legendary = Career Legacy 10,000+; Epic = Hall of Famer (7,500+) or OVR 90+; Rare = OVR 80+
export function tierOf(W, p) { const e = W.era?.[p.id], lg = e?.legacy ?? W.library.players[p.id].careerLegacy ?? 0, ovr = e?.ovr ?? W.library.players[p.id].ovr ?? 60; return lg >= 10000 ? 3 : lg >= 7500 || ovr >= 90 ? 2 : ovr >= 80 ? 1 : 0; }
export const mktId = (pid, d, f) => pid * 16 + d * 4 + f;
// One copy's rarity roll for a known player, with a pack type's odds
function rollCopy(W, p, type, force = {}) {
  const P = PACK_TYPES[type], t = tierOf(W, p);
  const f = force.f ?? wpick(W, P.fin[t]);
  const dw = P.des.map((w, d) => w * (STACK[d] ? STACK[d][0][t] * STACK[d][1][f] : 1) * (d === 4 && t === 3 && f === 3 ? COMBO_AUTO_LEG_HOLO : 1));
  const d = wpick(W, dw);
  if (d === 4) return { pid: p.id, d, f, auto: rollAuto(W, p) };
  const kits = W.kitInfo?.[p.key] || [1, 0], r = W.rand();
  const kit = kits[1] && r < P.kit[1] ? 'era' : kits[0] && r >= P.kit[1] && r < P.kit[1] + P.kit[0] ? 'alt' : 'home';
  let par = null;
  if (d === 0) { let x = W.rand(); for (const pz of PRIZM) { const pr = P.prizm[PRIZM.indexOf(pz)]; if (x < pr) { par = { c: pz.c, run: pz.run, ser: 1 + Math.floor(W.rand() * pz.run), m: pz.m }; break; } x -= pr; } }
  return { pid: p.id, d, f, kit, par };
}
function rollAuto(W, p) {
  const lp = W.library.players[p.id], e = W.era?.[p.id], hof = (e?.legacy ?? lp.careerLegacy ?? 0) >= 7500;
  const ins = [lp.nickname && 'nickname', hof && 'hof', (e?.totals?.mvp ?? lp.stats?.MVP ?? 0) > 0 && 'mvp', (e?.totals?.rings ?? lp.stats?.Rings ?? 0) > 1 && 'champ'].filter(Boolean);
  let par = AUTO_PAR[wpick(W, AUTO_PAR.map((x) => x.w))];
  if ((par.id === 'Cut 1/1' && !hof) || (par.id === 'Inscribed' && !ins.length)) par = AUTO_PAR[1];
  const ink = par.id === 'Cut 1/1' ? INKS[6] : INKS[wpick(W, INKS.map((x) => x[1]))];
  const insc = par.id === 'Inscribed' ? W.pick(ins) : ins.length && W.rand() < INSCRIBE_CHANCE ? W.pick(ins) : null;
  const ser = 1 + Math.floor(W.rand() * par.run), tb = W.rand() < THROWBACK.chance;
  return { par: par.id, run: par.run, ser, ink: ink[0], insc, tb, m: par.m * ink[2] * (insc ? INSCRIBE[insc] : 1) * serialMult(ser, par.run) * (tb ? THROWBACK.mult : 1) };
}
// A copy's value multiplier on top of the player's base (Prizm Base) value, as the site prices it
function copyMult(x) {
  if (x.d === 4) return FINISH_MULT[x.f] * x.auto.m;
  return FINISH_MULT[x.f] * DESIGN_MULT[x.d] * KIT_BONUS[x.kit] * (x.par ? x.par.m * (x.par.ser === 1 && x.par.run > 1 ? 1.15 : 1) : 1);
}
export function itemLabel(W, it) {
  const p = W.players[it.pid];
  if (it.d === 4) return `${p.pos} ${p.name} · ${FINISHES[it.f]} Autograph, ${it.auto.par} ${it.auto.ser}/${it.auto.run}, ${it.auto.ink}${it.auto.insc ? `, inscribed (${it.auto.insc})` : ''}${it.auto.tb ? ', throwback' : ''}`;
  return `${p.pos} ${p.name} · ${FINISHES[it.f]} ${DESIGNS[it.d]}${it.kit !== 'home' ? ` (${it.kit === 'era' ? 'throwback' : 'alternate'} kit)` : ''}${it.par ? `, Prizm ${it.par.c} ${it.par.ser}/${it.par.run}` : ''}`;
}
// Put a rolled copy in a bot's hands: a market copy if it is a plain card, otherwise a one-of-a-kind item
function mintCopy(W, b, x, cost, t = W.t, fromPool = true) {
  if (W.ord && fromPool) W.ord.minted++;
  const p = W.players[x.pid]; if (p.dorm) wakePlayer(W, p);
  if (fromPool) { if (p.pool <= 0) return null; p.pool--; if (p.pool === 0) log(W, 'pool', `The pool has run out of ${p.pos} ${p.name} cards.`); }
  if (x.d < 4 && x.kit === 'home' && !x.par) { const m = W.cards[mktId(x.pid, x.d, x.f)]; m.circ++; if (!fromPool) m.S0++; if (b) { give(b, m, 1); addLot(b, m, cost, t); } return m; }
  const it = { uid: `I${(W.itemSeq = (W.itemSeq || 0) + 1)}`, pid: x.pid, d: x.d, f: x.f, kit: x.kit || 'home', par: x.par || null, auto: x.auto || null, mult: copyMult(x), owner: b, cost, last: null };
  it.label = itemLabel(W, it); W.items.set(it.uid, it); if (b) (b.items ||= new Set()).add(it.uid);
  return it;
}
// An item's mark-to-market: its plain card's price × its rarity premium; its intrinsic value: base value × premium
export function markItem(W, it) { const m = W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)]; return (m.P / m.mult) * it.mult; }
export const intrinsicItem = (W, it) => W.players[it.pid].F * it.mult;
// Pack prices: each type's expected intrinsic value of its contents × (1 + edge); the market EV uses traded prices
let packCacheT = null, packCache = null;
function packInfo(W, type = 'standard') {
  if (!packCacheT || packCacheT.t !== W.t) packCacheT = { t: W.t, by: {} };
  const hit = packCacheT.by[type]; if (hit) { if (W.cfg.packSale === 'auction') hit.price = W.packPx?.[type] ?? hit.evMarket; return hit; }
  const P = PACK_TYPES[type], meanAuto = W.kitMeta?.autographMeanMult || 7.36;
  // pool-weighted base value and implied base price of each tier
  const tv = [0, 0, 0, 0], tp = [0, 0, 0, 0], tn = [0, 0, 0, 0], byTier = [[], [], [], []];
  for (const p of W.players) { if (p.on === false || p.pool <= 0) continue; const t = tierOf(W, p); tv[t] += p.pool * p.F; tp[t] += p.pool * p.P; tn[t] += p.pool; byTier[t].push(p); }
  const tw = P.tiers.map((w, t) => (tn[t] ? w : 0)), twt = tw.reduce((a, b) => a + b, 0) || 1;
  let ev = 0, evP = 0;
  for (let t = 0; t < 4; t++) {
    if (!tw[t]) continue;
    let e = 0;
    P.fin[t].forEach((fw, f) => { const dw = P.des.map((w, d) => w * (STACK[d] ? STACK[d][0][t] * STACK[d][1][f] : 1) * (d === 4 && t === 3 && f === 3 ? COMBO_AUTO_LEG_HOLO : 1)), dt = dw.reduce((a, b) => a + b, 0);
      const de = dw.reduce((s, w, d) => s + (w / dt) * (d === 4 ? meanAuto : DESIGN_MULT[d] * (1 + P.kit[0] * 0.2 + P.kit[1] * 0.4) * (d === 0 ? 1 + P.prizm.reduce((a, pr, i) => a + pr * (PRIZM[i].m - 1), 0) : 1)), 0);
      e += (fw / 100) * FINISH_MULT[f] * de; });
    ev += (tw[t] / twt) * (tv[t] / tn[t]) * e; evP += (tw[t] / twt) * (tp[t] / tn[t]) * e;
  }
  const size = P.size, out = { type, size, ev: ev * size, evMarket: evP * size, price: (W.cfg.priceOnly ? evP : ev) * size * (1 + W.cfg.packEdge), byTier, tot: tn.reduce((a, b) => a + b, 0) };
  if (W.cfg.packSale === 'auction') out.price = W.packPx?.[type] ?? out.evMarket;
  packCacheT.by[type] = out; return out;
}
function drawPlayer(W, pk, t) { let ts = t; if (!pk.byTier[ts].length) ts = [0, 1, 2, 3].find((x) => pk.byTier[x].length) ?? -1; if (ts < 0) return null; const xs = pk.byTier[ts], tot = xs.reduce((a, p) => a + p.pool, 0); let r = W.rand() * tot; for (const p of xs) { r -= p.pool; if (r <= 0) return p; } return xs[xs.length - 1]; }
// A bot wants a pack: under 'auction' that is a bid (the price it names: mult × the last clearing price), settled with
// everyone else's in packAuction; otherwise it buys at the posted price
function buyPack(W, b, type = 'standard', mult = 1) {
  if (W.cfg.packSale !== 'auction') return ripPack(W, b, false, type);
  const p = packInfo(W, type).price * mult; if (!(p > 0) || b.cash < p) return null;
  (W.packBids ||= []).push({ b, type, p }); return true;
}
// 5. Packs: packsPerWeek released (by packMix), one uniform-price auction per type: the highest bids win and all pay the
// lowest winning bid. Nothing links the price to hidden value.
function packAuction(W) {
  const cfg = W.cfg, bidsP = W.packBids || []; W.packBids = []; W.packWeek = {};
  const carry = (W.packCarry ||= {}), px = (W.packPx ||= {});
  for (const type of Object.keys(PACK_TYPES)) {
    const supply = (carry[type] || 0) + (cfg.packsPerWeek || 0) * (W.fillK ?? 1) * (cfg.packMix?.[type] || 0), n0 = Math.floor(supply); carry[type] = supply - n0;
    const bs = bidsP.filter((x) => x.type === type).sort((x, y) => y.p - x.p), n = Math.min(n0, bs.length);
    let sold = 0;
    if (n > 0) { const clearPx = bs[n - 1].p; for (const x of bs.slice(0, n)) if (x.b.cash >= clearPx && ripPack(W, x.b, false, type, clearPx)) sold++; if (sold) px[type] = clearPx; }
    W.packWeek[type] = { released: n0, bids: bs.length, sold, price: px[type] ?? null };
  }
  packCacheT = null;
}
function ripPack(W, b, free = false, type = 'standard', paid = null) {
  const pk = packInfo(W, type), P = PACK_TYPES[type], cost = paid ?? pk.price;
  if (!pk.tot || (!free && b.cash < cost)) return null;
  if (!free) { b.cash -= cost; flowOut(W, b, cost); W.treasury += cost; W.house.packRevenue = (W.house.packRevenue || 0) + cost; }
  W.house.packs++; tkAdd(W, b, 'packs');
  const rolls = [];
  for (let k = 0; k < P.size; k++) {
    let t = wpick(W, P.tiers);
    if (P.epicPlus && k === P.size - 1 && !rolls.some((x) => tierOf(W, W.players[x.pid]) >= 2)) t = Math.max(2, t);
    const p = drawPlayer(W, pk, t); if (!p) break;
    const force = {};
    if (P.oneHolo && k === 0) force.f = 3;
    if (P.silverPlus && k === P.size - 1 && !rolls.some((x) => x.f >= 1)) force.f = Math.max(1, wpick(W, P.fin[tierOf(W, p)]));
    rolls.push(rollCopy(W, p, type, force));
  }
  const each = free ? 0 : cost / Math.max(1, rolls.length), out = [];
  for (const x of rolls) { const got = mintCopy(W, b, x, each); if (got) out.push(got); }
  packCache = null; packCacheT = null;
  jot(W, { type: 'pack', bot: b.name, free, packType: type, price: free ? 0 : r2(cost), pulls: out.map((x) => (x.uid ? x.label : x.key)) });
  return out;
}

/* ---------- Order helpers ---------- */
let bids, asks, passBids, passAsks;
function bid(b, c, p, x) {
  if (!(p > 0) || b.cash < p) return;
  const lim = W_.cfg.positionLimit;
  if (lim > 0 && (b.h.get(c.id) || 0) >= Math.max(3, Math.floor(lim * c.circ))) return;
  if (c.dorm) wakePlayer(W_, W_.players[c.pid]);
  bids[c.id].push(x ? { b, p, x } : { b, p });
}
let W_ = null; // the world the module-level order helpers act on
function ask(b, c, p, pend, x) { const q = b.h.get(c.id) || 0, used = pend.get(c.id) || 0; if (q > used && p > 0) { asks[c.id].push(x ? { b, p, x } : { b, p }); pend.set(c.id, used + 1); } }
function sample(W, k) { const live = W._live || W.cards; const o = []; for (let i = 0; i < k * 3 && o.length < k; i++) { const c = live[Math.floor(W.rand() * live.length)]; if (c && c.on !== false) o.push(c); } return o; }
let hot = [], mood = { drop: 0 };

/* ---------- Notes (social) ---------- */
// Will x take a note swap that y offers? Each kind decides through its own decision-maker: a neural bot its 'accept
// swaps' output, an AI bot its accept list, a genome bot its scripted social style
function willing(W, x, y) { return x.g?.nn ? !!x._nnAccept : x.kind === 'ai' ? (x.pendingShares || []).includes(y.id) || !!x.acceptAll : x.social === 'sharer' || (x.social === 'reciprocator' && (x.friends.has(y.id) || y.flaggedBy === 0)) || (x.social === 'thief' && W.rand() < 0.5); }
// A neural bot's pick among candidates: its partner weights (PARTNER_IN) times what it sees of each; ties go to a uniform draw
function nnPickBot(W, b, xs, w) {
  let best = -Infinity, top = [];
  for (const y of xs) { const v = w[0] * (b.friends.has(y.id) ? 1 : 0) + w[1] * clamp((y.flaggedBy || 0) / 5, 0, 2) + w[2] * Math.log1p(Math.max(0, W.t - (y.joined ?? y.born ?? 0))) / 5;
    if (v > best) { best = v; top = [y]; } else if (v === best) top.push(y); }
  return top.length ? (top.length > 1 ? W.pick(top) : top[0]) : null;
}
// Neural bots act on their own outputs: steal when 'steal notes' > 0, offer a swap when 'share notes' > 0, the target
// chosen by their partner weights; nothing filters candidates by notes they hold (a bot can't see another's notes), so an
// empty victim or partner is a lost try. Genome bots keep their scripted styles (the 0.5 and 0.4 draws, the filters).
function socialPhase(W) {
  const cfg = W.cfg;
  const rule = W.bots.filter((b) => b.kind === 'rule');
  for (const b of rule) {
    if (b.g?.nn) {
      if (b._nnSteal && cfg.stealing) { const v = nnPickBot(W, b, W.bots.filter((v) => v !== b), b._nnStealW || [0, 0, 0]); if (v) steal(W, b, v); }
      if (b._nnShare && cfg.sharing && b.notes.size) { const p = nnPickBot(W, b, W.bots.filter((p) => p !== b && !b.flags.has(p.id) && !p.flags.has(b.id)), b._nnShareW || [0, 0, 0]); if (p && willing(W, p, b)) swap(W, b, p); }
      continue;
    }
    if (b.notes.size === 0 && b.social !== 'thief') continue;
    if (b.social === 'thief' && cfg.stealing && W.rand() < 0.5) {
      const victims = W.bots.filter((v) => v !== b && v.notes.size > 2);
      if (victims.length) steal(W, b, W.pick(victims));
      continue;
    }
    if (!cfg.sharing || W.rand() > 0.4) continue;
    const partners = W.bots.filter((p) => p !== b && !b.flags.has(p.id) && !p.flags.has(b.id) && p.notes.size > 0);
    if (!partners.length) continue;
    const p = W.pick(partners);
    if (willing(W, p, b)) swap(W, b, p);
  }
}
export function swap(W, a, b) {
  const give3 = (from, to) => {
    const mine = [...from.notes.entries()].filter(([, n]) => fresh(W, n)).sort((x, y) => y[1].week - x[1].week).slice(0, 3);
    let k = 0;
    for (const [id, n] of mine) { const cur = to.notes.get(id); if (!cur || cur.week < n.week) { to.notes.set(id, { est: n.est, week: n.week, from: `shared by ${from.name}`, ...(n.facts ? { facts: n.facts } : {}), ...(n.lib ? { lib: n.lib, z: n.z } : {}) }); k++; } }
    return k;
  };
  const k = give3(a, b) + give3(b, a);
  trimNotes(W, a); trimNotes(W, b);
  a.friends.add(b.id); b.friends.add(a.id); a.stats.shared++; b.stats.shared++; W.week.shares++;
  jot(W, { type: 'share', a: a.name, b: b.name, notesMoved: k });
  return k;
}
export function steal(W, thief, victim) {
  if (victim.flags.has(thief.id) && W.rand() < 0.5) { jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: false, reason: 'guarded' }); return { ok: false, reason: 'guarded' }; } // a bot that flagged you watches you
  const notes = [...victim.notes.entries()].filter(([, n]) => fresh(W, n)).sort((x, y) => y[1].week - x[1].week).slice(0, 3);
  for (const [id, n] of notes) thief.notes.set(id, { est: n.est, week: n.week, from: `taken from ${victim.name}`, ...(n.facts ? { facts: n.facts } : {}), ...(n.lib ? { lib: n.lib, z: n.z } : {}) });
  trimNotes(W, thief); thief.stats.stolen++; W.week.thefts++;
  if (W.rand() < W.cfg.detectChance) {
    W.week.caught++; thief.stats.caught++; thief.lastCaught = W.t;
    const flaggers = [victim, ...(W.cfg.gossip ? W.bots.filter((f) => victim.friends.has(f.id)) : [])];
    for (const f of flaggers) if (!f.flags.has(thief.id)) { f.flags.add(thief.id); f.friends.delete(thief.id); thief.flaggedBy++; }
    jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: true, notes: notes.length, caught: true, flaggedBy: flaggers.length });
    if (thief.flaggedBy >= 5 && !thief.announced) { thief.announced = true; log(W, 'flag', `${thief.name} (${ARCH[thief.a].label}) is caught stealing notes again. ${thief.flaggedBy} bots now refuse to share or trade with it.`); }
    return { ok: true, caught: true, notes: notes.length };
  }
  jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: true, notes: notes.length, caught: false });
  return { ok: true, caught: false, notes: notes.length };
}
function trimNotes(W, b) { while (b.notes.size > W.cfg.memoryCap) { let o = null; for (const [id, n] of b.notes) if (!o || n.week < o[1].week) o = [id, n]; b.notes.delete(o[0]); } }

/* ---------- Rule bots: research and passes ---------- */
// Passes and game tickets trade the same way: each bot keeps the ones it needs, sells spares to bots that want more,
// and everything clears in one weekly call auction per token at a single price.
function tokenMarket(W, kind) {
  const cfg = W.cfg, field = kind === 'pass' ? 'passes' : 'tickets', cap = kind === 'pass' ? cfg.maxResearchPerWeek : cfg.maxGamesPerWeek;
  const tradable = kind === 'pass' ? cfg.passesTradable : cfg.ticketsTradable;
  const B = [], A = [], S = kind === 'pass' ? (SNAP = snapCards(W)) : null;
  for (const b of W.bots) {
    if (b.kind === 'ai') {
      if (!tradable) continue;
      for (const x of (kind === 'pass' ? b.pending?.passOrders : b.pending?.ticketOrders) || []) {
        const price = Number(x.price); if (!(price > 0)) continue;
        for (let k = 0; k < clamp(Math.floor(Number(x.qty) || 1), 1, 6); k++) x.side === 'sell' ? A.push({ b, p: price }) : B.push({ b, p: price });
      }
      continue;
    }
    const want = kind === 'pass' ? (b._wish = b.g.nn ? nnResearchWish(W, b) : researchWish(W, b)).length : b.g.nn ? Math.min(W.cfg.maxGamesPerWeek, (b._nnGames || []).length) : ticketWish(W, b);
    if (!tradable) continue;
    const spare = b[field].length - want;
    if (spare > 0) for (let k = 0; k < spare; k++) A.push({ b, p: kind === 'pass' ? b.g.passAsk : b.g.ticketAsk });
    else if (spare < 0) for (let k = 0; k < Math.min(-spare, cap - b[field].length); k++) B.push({ b, p: kind === 'pass' ? b.g.passBid : b.g.ticketBid });
  }
  if (S) endSnap(W, S);
  B.sort((x, y) => y.p - x.p); A.sort((x, y) => x.p - y.p);
  // A pair is matched only if it can settle: the buyer can pay its bid (the price is never above it) on top of what it has
  // already been matched for and stays under the cap, and the seller still has a token; so the price comes from a pair that settles
  const m = [], spent = new Map(), got = new Map(), gave = new Map(), skip = (o) => { const k = got.get(o.b) || 0; return o.b.cash < (spent.get(o.b) || 0) + o.p || o.b[field].length + k >= cap; }; let i = 0, j = 0;
  while (i < B.length && j < A.length && B[i].p >= A[j].p) {
    if (skip(B[i])) { i++; continue; } if ((gave.get(A[j].b) || 0) >= A[j].b[field].length) { j++; continue; }
    if (B[i].b === A[j].b || blocked(B[i].b, A[j].b)) { j++; continue; }
    m.push([B[i], A[j]]); spent.set(B[i].b, (spent.get(B[i].b) || 0) + B[i].p); got.set(B[i].b, (got.get(B[i].b) || 0) + 1); gave.set(A[j].b, (gave.get(A[j].b) || 0) + 1); i++; j++; }
  let traded = 0, price = null;
  if (m.length) {
    const last = m[m.length - 1]; price = (last[0].p + last[1].p) / 2;
    for (const [bd, ak] of m) {
      if (bd.b.cash < price || !ak.b[field].length || bd.b[field].length >= cap) continue; // (cannot happen now; kept as a guard)
      ak.b[field].sort((x, y) => y - x); const exp = ak.b[field].shift();
      bd.b[field].push(exp); bd.b.cash -= price; ak.b.cash += price * (1 - cfg.fee); W.house.fees += price * cfg.fee; W.treasury += price * cfg.fee; traded++;
      flowOut(W, bd.b, price); flowIn(W, ak.b, price * (1 - cfg.fee));
      jot(W, { type: kind === 'pass' ? 'passTrade' : 'ticketTrade', buyer: bd.b.name, seller: ak.b.name, price: r2(price) });
    }
  }
  if (kind === 'pass') { W.passTrades = traded; if (traded) W.passPrice = price; }
  else { W.ticketTrades = traded; if (traded) W.ticketPrice = price; }
}
function passPhase(W) {
  const cfg = W.cfg;
  tokenMarket(W, 'pass');
  for (const b of W.bots) {
    if (b.kind === 'ai') {
      for (const key of (b.pending?.research || []).slice(0, cfg.maxResearchPerWeek)) {
        const c = resolvePlayer(W, key); if (!c || !usePass(W, b)) continue;
        research(W, b, c); (b.inbox ||= []).push(libraryPage(W, c.id));
      }
      continue;
    }
    for (const c of (b._wish || []).slice(0, cfg.maxResearchPerWeek)) { if (!usePass(W, b)) break; research(W, b, c); }
  }
}

/* ---------- Auctions ---------- */
// A bot lists one card with a reserve. The next week every bot may send one sealed bid; the highest bid at or above the
// reserve wins and pays the second-highest bid (or the reserve, whichever is higher). Unsold cards go back.
function listAuction(W, b, c, reserve) {
  if (!W.cfg.auctions || !(reserve > 0) || (b.h.get(c.id) || 0) < 1) return null;
  give(b, c, -1); tkAdd(W, b, 'lists');
  const a = { id: `A${W.t}-${(W.auctionSeq = (W.auctionSeq || 0) + 1)}`, seller: b, cardId: c.id, reserve: r2(reserve), listed: W.t, bids: [] };
  W.auctions.push(a);
  jot(W, { type: 'auctionList', id: a.id, seller: b.name, card: c.key, reserve: a.reserve });
  return a;
}
// A one-of-a-kind card (autograph, Prizm parallel, alternate or throwback kit) can only change hands at auction
function listItem(W, seller, it, reserve) {
  if (!W.cfg.auctions || !(reserve > 0) || !it || W.auctions.some((a) => a.uid === it.uid)) return null;
  if (seller !== 'liq') { if (it.owner !== seller) return null; seller.items.delete(it.uid); }
  it.owner = null; tkAdd(W, seller, 'lists');
  const a = { id: `A${W.t}-${(W.auctionSeq = (W.auctionSeq || 0) + 1)}`, seller, uid: it.uid, cardId: mktId(it.pid, it.d === 4 ? 0 : it.d, it.f), reserve: r2(reserve), listed: W.t, bids: [] };
  W.auctions.push(a);
  jot(W, { type: 'auctionList', id: a.id, seller: seller === 'liq' ? 'liquidator' : seller.name, card: it.label, item: it.uid, reserve: a.reserve });
  return a;
}
function auctionPhase(W) {
  const open = W.auctions.filter((a) => a.listed < W.t);
  W.auctions = W.auctions.filter((a) => a.listed >= W.t);
  W.auctionResults = []; const markBefore = new Map(); // each card's mark before this week's sales (last week's), for the fire-sale count
  for (const a of open) if (!a.uid && !markBefore.has(a.cardId)) markBefore.set(a.cardId, W.cards[a.cardId].P);
  // Each neural bot's worth, kept between auctions until a result touches it: the buyer and seller, and on a card's sale
  // every bot holding, lending, owing or owning a one-of-a-kind copy of that card (its price moved). Same numbers, fewer sums.
  const wc = new Map(), ctx = marketCtx(W), nwOf = (b) => { let v = wc.get(b); if (v === undefined) wc.set(b, (v = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)))); return v; };
  const touch = (b) => { if (b && typeof b === 'object') wc.delete(b); };
  const moved = (id) => { for (const b of wc.keys()) if (b.h.has(id) || b.lentOut?.has(id) || b.owed?.has(id) || (b.items?.size && [...b.items].some((u) => { const it = W.items.get(u); return it && mktId(it.pid, it.d === 4 ? 0 : it.d, it.f) === id; }))) wc.delete(b); };
  for (const a of open) {
    const c = W.cards[a.cardId], it = a.uid ? W.items.get(a.uid) : null, sellerName = a.seller === 'liq' ? 'liquidator' : a.seller.name, label = it ? it.label : c.key;
    for (const b of W.bots) {
      if (b === a.seller || (a.seller !== 'liq' && blocked(b, a.seller))) continue;
      let bidv = null;
      if (b.kind === 'ai') bidv = Number((b.pending?.auctionBids || []).find((x) => x.auctionId === a.id)?.bid) || null;
      else { const base = b.g.nn ? nnAuctionBid(W, b, c, it, nwOf(b), ctx) : ruleAuctionBid(W, b, c); bidv = base && it ? (base * it.mult) / c.mult : base; }
      if (bidv && bidv > 0 && b.cash >= bidv) { a.bids.push({ b, p: bidv }); tkAdd(W, b, 'sealed'); }
    }
    a.bids.sort((x, y) => y.p - x.p);
    const top = a.bids[0], second = a.bids[1];
    let result;
    if (top && top.p >= a.reserve) {
      const price = second ? Math.max(a.reserve, second.p) : W.cfg.singleBidder === 'reserve' ? a.reserve : top.p, net = price * (1 - W.cfg.fee); tkTrade(W, top.b, a.seller, c, price, it ? markItem(W, it) : c.P, 'auc', it); if (W.cfg.attention > 0) attTraded(W, c, top.b, a.seller); // one bidder: no second price, so it pays its own bid ('reserve': the old rule)
      top.b.cash -= price; flowOut(W, top.b, price);
      if (it) { it.owner = top.b; (top.b.items ||= new Set()).add(it.uid); const cost0 = it.cost; it.cost = price; it.last = price; if (a.seller !== 'liq') { const pnl = net - (cost0 ?? 0); a.seller.stats.realized = (a.seller.stats.realized || 0) + pnl; if (W.flow) W.flow.realized[a.seller._grp ?? 2] += pnl; } }
      else { give(top.b, c, 1); addLot(top.b, c, price, W.t); if (a.seller !== 'liq') sellLot(W, a.seller, c, net);
        { const A = (W.aucStats ||= { sold: 0, coins: 0, free: 0, vs: [] }); A.sold++; A.coins += price; if (price <= 1 || price < 0.1 * top.p) A.freeOld = (A.freeOld || 0) + 1; if (price < (W.cfg.fireShare ?? 0.3) * (markBefore.get(c.id) ?? c.P)) A.free++; if (c.P > 0) A.vs.push(price / c.P); } // measurement for the health board: before the sale re-marks the card
        c.P = price; noteTrade(W, c, price, 1); { const pl = W.players[c.pid]; pl.aucBaseP = price / c.mult; pl.aucBaseT = W.t; } c.aucN = (c.aucT === W.t ? c.aucN : 0) + 1; c.aucT = W.t; W.aucWeek = (W.aucWeek || 0) + 1; if (W.ord) W.ord.coins += price; } // a card sold at auction is a trade: it sets the price, feeds comparable sales and the Vault index, and counts
      W.house.fees += price * W.cfg.fee; W.treasury += price * W.cfg.fee;
      if (a.seller !== 'liq') { a.seller.cash += net; flowIn(W, a.seller, net); } else { W.house.outside -= net; const m = (W.house.mint ||= {}); m.outsideOut = (m.outsideOut || 0) + price; m.liqOut = (m.liqOut || 0) + price; }
      result = { type: 'auctionResult', id: a.id, card: label, item: a.uid || null, seller: sellerName, winner: top.b.name, price: r2(price), bids: a.bids.length, topBid: r2(top.p) };
      const ref = it ? markItem(W, it) : c.P;
      if (price > ref * 1.5 && price > 20 * W.cfg.coinScale) log(W, 'auction', `Auction: ${top.b.name} wins ${label} from ${sellerName} for ${r2(price)} coins against ${a.bids.length} sealed bids, ${Math.round((price / ref - 1) * 100)}% above its market mark.`);
    } else {
      if (it) { if (a.seller === 'liq') W.liqItems.push(it.uid); else { it.owner = a.seller; a.seller.items.add(it.uid); } }
      else if (a.seller !== 'liq') give(a.seller, c, 1); else W.liq.set(a.cardId, (W.liq.get(a.cardId) || 0) + 1);
      result = { type: 'auctionResult', id: a.id, card: label, item: a.uid || null, seller: sellerName, winner: null, bids: a.bids.length, topBid: top ? r2(top.p) : null, reserve: a.reserve };
    }
    jot(W, result); W.auctionResults.push(result);
    if (result.winner) { touch(top.b); touch(a.seller); if (!it) moved(c.id); } else touch(a.seller);
  }
  // This week's new listings (shown to everyone next week)
  for (const b of W.bots) {
    if (b.kind === 'ai') { for (const x of (b.pending?.auction || []).slice(0, 2)) { const it = W.items.get(x.player); if (it && it.owner === b) { listItem(W, b, it, Number(x.reserve)); continue; } const c = resolveMarket(W, x.player); if (c) listAuction(W, b, c, Number(x.reserve)); } continue; }
    if (!W.cfg.auctions || b.g.nn) continue;
    ruleAuctionList(W, b);
  }
  // The liquidator auctions the one-of-a-kind cards of bots that left or defaulted, a few a week, at half their mark
  if (W.cfg.liquidation === 'auction') { // seized copies and one-of-a-kind cards, liqListings a week, no minimum price
    let n = W.cfg.liqListings ?? 30;
    for (const uid of W.liqItems.splice(0, Math.min(n, W.liqItems.length))) { const it = W.items.get(uid); if (it && listItem(W, 'liq', it, NO_MIN)) n--; }
    while (n > 0 && W.liq.size) { let any = false; for (const [id, q] of [...W.liq]) { if (n <= 0) break; if (!(q > 0)) continue; q > 1 ? W.liq.set(id, q - 1) : W.liq.delete(id); const c = W.cards[id];
        const a = { id: `A${W.t}-${(W.auctionSeq = (W.auctionSeq || 0) + 1)}`, seller: 'liq', cardId: id, reserve: NO_MIN, listed: W.t, bids: [] }; W.auctions.push(a); jot(W, { type: 'auctionList', id: a.id, seller: 'liquidator', card: c.key, reserve: a.reserve }); n--; any = true; }
      if (!any) break; }
  } else for (const uid of W.liqItems.splice(0, 5)) { const it = W.items.get(uid); if (it) listItem(W, 'liq', it, Math.max(0.05 * W.cfg.coinScale, markItem(W, it) * 0.5)); }
}
const r2 = (x) => Math.round(x * 100) / 100;
const WHO = ['bot', 'buyer', 'seller', 'a', 'b', 'thief', 'victim', 'winner', 'from', 'to'];
export function jot(W, e) {
  const entry = { t: W.t, ...e }; W.journal.push(entry);
  for (const k of WHO) { const n = entry[k]; if (typeof n !== 'string') continue; let l = W.botLog.get(n); if (!l) W.botLog.set(n, (l = [])); l.push(entry); if (l.length > 400) l.shift(); }
  if (entry.type === 'pack' && typeof entry.bot === 'string') { let q = (W.botPacks ||= new Map()).get(entry.bot); if (!q) W.botPacks.set(entry.bot, (q = [])); q.push(entry); if (q.length > 12) q.shift(); }
  const ck = entry.card || entry.player; if (typeof ck === 'string') { let l = (W.cardLog ||= new Map()).get(ck); if (!l) W.cardLog.set(ck, (l = [])); l.push(entry); if (l.length > 60) l.shift(); }
}
// Cost basis: every copy a bot holds remembers what it paid (FIFO), so sales realize a profit or loss
export function addLot(b, c, price, t) { let l = (b.lots ||= new Map()).get(c.id); if (!l) b.lots.set(c.id, (l = [])); l.push([price, t]); }
function sellLot(W, b, c, net) {
  const l = b.lots?.get(c.id), has = l && l.length, lot = has ? l.shift() : [c.F, 0];
  if (has) { const T = tk(W, b); if (T) { T.hold += W.t - lot[1]; T.holdN++; } } // tactic tracker: weeks this copy was held
  const pnl = net - lot[0]; b.stats.realized = (b.stats.realized || 0) + pnl;
  if (W.flow) { W.flow.realized[b._grp ?? 2] += pnl; if (W.t - lot[1] <= 12 && lot[1] > 0) W.flow.trips[b._grp ?? 2]++; }
  return pnl;
}
function flowIn(W, b, x) { if (W.flow && b && typeof b === 'object') W.flow.net[b._grp ?? 2] += x; }
function flowOut(W, b, x) { if (W.flow && b && typeof b === 'object') W.flow.net[b._grp ?? 2] -= x; }
export function avgCost(b, id) { const l = b.lots?.get(id); return l && l.length ? l.reduce((s, x) => s + x[0], 0) / l.length : null; }

/* ---------- Arcade games (weekly contests) ---------- */
// Every game runs one contest a week. Each entrant spends a ticket and stakes coins into the game's pot, every entrant
// answers the SAME questions (published a week ahead, with the topic), and the best scores share the pot. Nothing is
// printed: games move coins from worse players to better ones. Each game's metrics include a skill index: the rank
// correlation between how much an entrant knew about the players asked (fresh notes) and how well it scored.
export const TOPICS = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];
export const GAMES = {
  valuation: { label: 'Valuation contest', skill: 'Estimate each card\'s hidden value', answer: 'a number of coins per card', paid: 0.2 },
  prediction: { label: 'Price prediction league', skill: 'Will each card be higher in 4 weeks?', answer: 'a probability 0 to 1 per card (scored by Brier, settled in 4 weeks)', paid: 0.1 },
  blindRank: { label: 'Blind Rank', skill: 'Rank 5 players on a stat, highest first', answer: 'the five letters in order, e.g. "C,A,E,B,D"', paid: 0.25 },
  closest: { label: 'Closest guess', skill: 'Guess career stats', answer: 'a number per question', paid: 0.25 },
  keepCut: { label: 'Keep 3 / Cut 3', skill: 'Keep the 3 of 6 with the highest Career Legacy', answer: 'three letters, e.g. "A,D,F"', paid: 0.25 },
  imposter: { label: 'Imposter', skill: 'Which of 4 players is not the same play-style family?', answer: 'a letter per question', paid: 0.25 },
  grid: { label: 'League Grid', skill: 'Name a player who fits position × award × club', answer: 'a player key per square; rarer correct answers score more', paid: 0.25 },
  higherLower: { label: 'Higher or Lower', skill: 'Which of two players has the higher career rate?', answer: 'A or B per question', paid: 0.25 },
  overUnder: { label: 'Over / Under', skill: 'Is a career rate over or under the line?', answer: 'over or under per question', paid: 0.25 },
  duel: { label: 'Head-to-head duel', skill: 'Beat one paired opponent on 5 Higher or Lower questions', answer: 'A or B per question; the winner takes both stakes', paid: 0 },
};
const GKEYS = Object.keys(GAMES);
const L5 = ['A', 'B', 'C', 'D', 'E', 'F'];

// What a bot can know about a player in this era (the timeline's season, or the latest library)
export function eraOf(W, id) {
  const e = W.era?.[id]; if (e) return e;
  const p = W.library.players[id];
  return { on: true, ovr: p.ovr, skill: p.skill, grade: p.grade, legacy: p.careerLegacy, totals: p.stats, perGame: p.rates };
}
const onCards = (W) => W.players.filter((c) => c.on !== false);
const pickOn = (W, pos) => { const xs = onCards(W).filter((c) => !pos || c.pos === pos); return xs.length ? W.pick(xs) : null; };
function rateOf(W, id) { const e = eraOf(W, id); const ks = Object.keys(e.perGame || {}); return ks.length ? ks : null; }
function sharedRate(W, ids) { const sets = ids.map((id) => new Set(rateOf(W, id) || [])); const first = [...sets[0]]; const both = first.filter((k) => sets.every((s) => s.has(k))); return both.length ? W.pick(both) : null; }

function makeContest(W, game) {
  const topic = W.pick(TOPICS.filter((t) => onCards(W).filter((c) => c.pos === t).length >= 6)) || 'WR';
  const group = onCards(W).filter((c) => c.pos === topic);
  const draw = (k) => { const out = new Set(); let tries = 0; while (out.size < Math.min(k, group.length) && tries++ < 200) out.add(W.pick(group).id); return [...out]; };
  const q = [];
  switch (game) {
    case 'valuation': case 'prediction': { if (game === 'valuation' && W.cfg.priceOnly) break; const ids = draw(5); for (const id of ids) q.push({ ids: [id], text: `${W.players[id].key}${game === 'prediction' ? `: higher than ${r2(W.players[id].P)} in 4 weeks?` : ': hidden value in coins?'}` }); break; }
    case 'blindRank': { for (let t = 0; t < 10 && !q.length; t++) { const ids = draw(5), stat = sharedRate(W, ids); if (!stat) continue; const order = ids.slice().sort((a, b) => eraOf(W, b).perGame[stat] - eraOf(W, a).perGame[stat]); q.push({ ids, stat, truth: order.map((id) => L5[ids.indexOf(id)]), text: `Rank by career "${stat}", highest first: ${ids.map((id, i) => `${L5[i]}) ${W.players[id].key}`).join(' ')}` }); } break; }
    case 'closest': { for (const id of draw(3)) { const e = eraOf(W, id), ks = Object.keys(e.totals || {}).filter((k) => typeof e.totals[k] === 'number' && e.totals[k] > 0 && !/rings|mvp|opoy|dpoy|roty|sbmvp/i.test(k)); if (!ks.length) continue; const k = W.pick(ks); const vals = group.map((c) => eraOf(W, c.id).totals?.[k]).filter((v) => typeof v === 'number'); const mu = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / vals.length) || 1; q.push({ ids: [id], stat: k, truth: e.totals[k], sd, med: vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)], text: `${W.players[id].key}: career "${k}"?` }); } break; }
    case 'keepCut': { const ids = draw(6); const best = ids.slice().sort((a, b) => eraOf(W, b).legacy - eraOf(W, a).legacy).slice(0, 3); q.push({ ids, truth: best.map((id) => L5[ids.indexOf(id)]), text: `Keep the 3 with the highest Career Legacy: ${ids.map((id, i) => `${L5[i]}) ${W.players[id].key}`).join(' ')}` }); break; }
    case 'imposter': { const byFam = {}; for (const c of group) (byFam[c.fam] ||= []).push(c.id); const fams = Object.values(byFam).filter((x) => x.length >= 3); for (let t = 0; t < 4 && fams.length; t++) { const fam = W.pick(fams), others = group.filter((c) => !fam.includes(c.id)); if (!others.length) break; const three = []; while (three.length < 3) { const x = W.pick(fam); if (!three.includes(x)) three.push(x); } const odd = W.pick(others).id; const ids = [...three, odd].sort(() => W.rand() - 0.5); q.push({ ids, truth: L5[ids.indexOf(odd)], text: `Which plays a different style? ${ids.map((id, i) => `${L5[i]}) ${W.players[id].key}`).join(' ')}` }); } break; }
    case 'grid': { const AW = ['rings', 'mvp', 'sbmvp', 'opoy']; for (let t = 0; t < 30 && q.length < 3; t++) { const c0 = W.pick(group), team = c0.team, aw = W.pick(AW); const valid = group.filter((c) => c.team === team && (eraOf(W, c.id).totals?.[aw] || 0) > 0).map((c) => c.key); if (!valid.length) continue; q.push({ ids: group.filter((c) => c.team === team).map((c) => c.id), valid, aw, text: `A ${topic} for the ${team} with at least one ${aw.toUpperCase()}` }); } break; }
    case 'higherLower': case 'duel': { for (let t = 0; t < 40 && q.length < (game === 'duel' ? 5 : 8); t++) { const ids = draw(2); if (ids.length < 2) break; const stat = sharedRate(W, ids); if (!stat) continue; const a = eraOf(W, ids[0]).perGame[stat], b = eraOf(W, ids[1]).perGame[stat]; if (a === b) continue; q.push({ ids, stat, truth: a > b ? 'A' : 'B', text: `Higher career "${stat}": A) ${W.players[ids[0]].key} or B) ${W.players[ids[1]].key}?` }); } break; }
    case 'overUnder': { for (const id of draw(5)) { const ks = rateOf(W, id); if (!ks) continue; const stat = W.pick(ks), v = eraOf(W, id).perGame[stat]; let line = Math.round(v * lerp(0.8, 1.2, W.rand()) * 100) / 100; if (line === v) line = Math.round((v * 1.05 + 0.01) * 100) / 100; q.push({ ids: [id], stat, line, truth: v > line ? 'over' : 'under', text: `${W.players[id].key}, career "${stat}": over or under ${line}?` }); } break; }
  }
  return { game, topic, week: W.t + 1, questions: q };
}
// Contests are published two weeks ahead: what a bot sees as "in two weeks" this week is what it answers next week, so
// research it orders now arrives in time
export function publishContests(W) { W.contests = W.contestsAhead || null; W.contestsAhead = Object.fromEntries(GKEYS.map((g) => [g, makeContest(W, g)])); if (!W.contests) W.contests = Object.fromEntries(GKEYS.map((g) => [g, makeContest(W, g)])); }

// Scores: higher is better for every game
const num = (x) => { const v = Number(String(x).replace(/[^0-9.\-e]/gi, '')); return isFinite(v) ? v : null; };
function scoreOf(W, game, con, ans) {
  const qs = con.questions; if (!qs.length) return 0;
  switch (game) {
    case 'valuation': return -qs.reduce((s, q, i) => { const v = num(ans[i]); const F = W.players[q.ids[0]].F; return s + (v && v > 0 ? Math.min(3, Math.abs(Math.log(v / F))) : 3); }, 0) / qs.length;
    case 'prediction': return null; // settled in 4 weeks
    case 'blindRank': { const q = qs[0], got = String(ans[0] ?? ans.join(',')).toUpperCase().split(/[^A-F]+/).filter(Boolean); let d = 0; q.truth.forEach((l, i) => { const j = got.indexOf(l); d += j < 0 ? 4 : Math.abs(j - i); }); return 1 - d / 12; }
    case 'closest': return -qs.reduce((s, q, i) => { const v = num(ans[i]); return s + (v == null ? 3 : Math.min(3, Math.abs(v - q.truth) / q.sd)); }, 0) / qs.length;
    case 'keepCut': { const got = new Set(String(ans[0] ?? ans.join(',')).toUpperCase().split(/[^A-F]+/).filter(Boolean).slice(0, 3)); return qs[0].truth.filter((l) => got.has(l)).length / 3; }
    case 'imposter': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toUpperCase().startsWith(q.truth) ? 1 : 0), 0) / qs.length;
    case 'grid': return qs.reduce((s, q, i) => { const a = String(ans[i] ?? '').trim(); return s + (q.valid.includes(a) ? 1 + 1 / q.valid.length : 0); }, 0) / qs.length;
    case 'higherLower': case 'duel': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toUpperCase().startsWith(q.truth) ? 1 : 0), 0) / qs.length;
    case 'overUnder': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toLowerCase() === q.truth ? 1 : 0), 0) / qs.length;
  }
  return 0;
}
// How a rule bot answers: from its fresh notes when it has them (its research error blurs them), else a guess
function knows(W, b, id) { return estimate(W, b, W.players[id]) !== null; }
function ruleAnswers(W, b, game, con) {
  const e = b.g.err, noisy = (v) => v * Math.exp(W.gauss() * e), coin = (p) => W.rand() < p;
  const flip = (t) => ({ A: 'B', B: 'A', over: 'under', under: 'over' }[t] ?? t);
  return con.questions.map((q) => {
    const k = q.ids.filter((id) => knows(W, b, id)).length / q.ids.length;
    switch (game) {
      case 'valuation': return String(r2(knows(W, b, q.ids[0]) ? estimate(W, b, W.players[q.ids[0]]) : W.players[q.ids[0]].P));
      case 'prediction': { const c = W.players[q.ids[0]], est0 = estimate(W, b, c); const tilt = b.g.w.momentum > 0.3 ? clamp(ret(c, 4) * 3, -0.3, 0.3) : est0 !== null ? (est0 > c.P ? 0.18 : -0.18) : 0; return String(r2(clamp(0.5 + tilt + W.gauss() * 0.05, 0.02, 0.98))); }
      case 'blindRank': return q.ids.map((id, i) => [L5[i], knows(W, b, id) ? noisy(eraOf(W, id).perGame[q.stat]) : W.rand() * eraOf(W, q.ids[0]).perGame[q.stat] * 2]).sort((x, y) => y[1] - x[1]).map((x) => x[0]).join(',');
      case 'closest': return String(Math.round(knows(W, b, q.ids[0]) ? noisy(q.truth) : q.med));
      case 'keepCut': return q.ids.map((id, i) => [L5[i], knows(W, b, id) ? noisy(eraOf(W, id).legacy) : W.players[id].P * 30]).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]).join(',');
      case 'imposter': return coin(0.25 + 0.6 * k * (1 - e)) ? q.truth : W.pick(L5.slice(0, 4));
      case 'grid': { const mine = q.valid.filter((key) => knows(W, b, W.byKey.get(key).id)); if (mine.length && coin(0.9)) return W.pick(mine); const pool = q.ids.map((id) => W.players[id].key); return coin(0.5) ? W.pick(pool) : ''; }
      default: return coin(0.5 + 0.42 * k * (1 - e)) ? q.truth : flip(q.truth);
    }
  });
}
// How a neural bot answers: every answer is computed from what it holds (its fresh notes' page facts, seen through its
// research error; its card network for the price prediction) and the public prices, with no draw deciding whether it is
// right. A player it has no note on is given the mean of the ones it has in that question (ties then go to the dearer
// card, the public signal); where nothing it holds tells the options apart (an unnoted Over / Under, an Imposter it can't
// narrow down) it guesses uniformly among the options it can't rule out.
function nnAnswers(W, b, game, con) {
  const err = b.g.err ?? 0, fact = (id) => { const n = b.notes.get(id); return fresh(W, n) && n.lib ? { ...n.lib, f: Math.exp((n.z ?? 0) * err) } : null; };
  const px = (id) => W.players[id].P, rank = (ids, val) => { const v = ids.map((id) => { const f = fact(id); const x = f ? val(f) : null; return Number.isFinite(x) ? x : null; }), kn = v.filter((x) => x != null), mu = kn.length ? kn.reduce((a, x) => a + x, 0) / kn.length : 0;
    return ids.map((id, i) => [L5[i], v[i] ?? mu, px(id)]).sort((x, y) => y[1] - x[1] || y[2] - x[2]).map((x) => x[0]); };
  const nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W);
  return con.questions.map((q) => {
    switch (game) {
      case 'valuation': return String(r2(knows(W, b, q.ids[0]) ? estimate(W, b, W.players[q.ids[0]]) : W.players[q.ids[0]].P));
      case 'prediction': { const o = cardNet(W, b, W.cards[mktId(q.ids[0], 0, 0)], nw, ctx); return String(r2(clamp(sigm(o[0] - o[1]), 0.01, 0.99))); } // its card network: buy over sell
      case 'blindRank': return rank(q.ids, (f) => f.pg[q.stat] * f.f).join(',');
      case 'closest': { const f = fact(q.ids[0]); if (f && Number.isFinite(f.tot[q.stat])) return String(Math.round(f.tot[q.stat] * f.f));
        const pos = W.players[q.ids[0]].pos, xs = []; for (const [id] of b.notes) { const g = fact(id); if (g && W.players[id]?.pos === pos && Number.isFinite(g.tot[q.stat])) xs.push(g.tot[q.stat] * g.f); } // else the median of what it knows at his position
        return xs.length ? String(Math.round(xs.sort((a, c) => a - c)[xs.length >> 1])) : ''; }
      case 'keepCut': return rank(q.ids, (f) => f.leg * f.f).slice(0, 3).join(',');
      case 'imposter': { const fam = q.ids.map((id) => fact(id)?.fam ?? null), ok = q.ids.filter((_, x) => { const others = fam.filter((v, i) => i !== x && v != null); return others.every((v) => v === others[0]) && !(fam[x] != null && others.length && fam[x] === others[0]); });
        return L5[q.ids.indexOf(W.pick(ok.length ? ok : q.ids))]; }
      case 'grid': { const kn = q.ids.map((id) => [id, fact(id)]), yes = kn.filter(([, f]) => f && (f.tot[q.aw] || 0) > 0).map(([id]) => id), maybe = kn.filter(([, f]) => !f).map(([id]) => id), pool = yes.length ? yes : maybe; // a noted winner, else an unnoted teammate
        return pool.length ? W.players[pool.sort((x, y) => px(y) - px(x))[0]].key : ''; }
      case 'overUnder': { const f = fact(q.ids[0]), v = f ? f.pg[q.stat] * f.f : null; return Number.isFinite(v) ? (v > q.line ? 'over' : 'under') : W.pick(['over', 'under']); }
      default: return rank(q.ids, (f) => f.pg[q.stat] * f.f)[0]; // higherLower, duel: A or B
    }
  });
}
function bestTopic(W, b) {
  const n = {}; for (const [id, note] of b.notes) if (fresh(W, note)) n[W.players[id].pos] = (n[W.players[id].pos] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 3 ? top[0] : null;
}
// A rule bot enters the contests whose topic it knows best (or a couple at random), one ticket each
function ruleEntries(W, b) {
  const known = {}; for (const [id, note] of b.notes) if (fresh(W, note)) known[W.players[id].pos] = (known[W.players[id].pos] || 0) + 1;
  const ranked = GKEYS.map((g) => [g, (known[W.contests[g].topic] || 0) + W.rand()]).sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, b.tickets.length).filter(([, s]) => s >= 1 || W.rand() < 0.35).map(([g]) => g);
}
function rankCorr(xs, ys) {
  const n = xs.length; if (n < 4) return null;
  const rk = (a) => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = Array(n); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const rx = rk(xs), ry = rk(ys), mx = (n - 1) / 2; let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
function payout(W, game, entries, prize = 0) {
  // entries: [{b, score, know}] — the top share of scorers split the pot (stakes + the house's prize; ties at the cut included)
  const pot = entries.length * W.cfg.gameStake + (entries.length ? prize : 0), st = W.gameStats[game];
  if (entries.length) { st.prize = (st.prize || 0) + prize; W.prizePaid = (W.prizePaid || 0) + prize; (W.house.mint ||= {}).prizes = (W.house.mint.prizes || 0) + prize; }
  st.entrants += entries.length; st.pot += pot;
  if (!entries.length) return;
  const sorted = entries.slice().sort((a, b) => b.score - a.score);
  const k = Math.max(1, Math.round(entries.length * GAMES[game].paid)), cut = sorted[k - 1].score, winners = sorted.filter((e) => e.score >= cut);
  for (const w of winners) { w.b.cash += pot / winners.length; flowIn(W, w.b, pot / winners.length); }
  for (const e of entries) { const won = winners.includes(e), net = (won ? pot / winners.length : 0) - W.cfg.gameStake; const a = W.gameArch[e.b._grp ?? 2]; a[0]++; if (won) a[1]++; a[2] += net; e.b.stats.gameNet = (e.b.stats.gameNet || 0) + net; jot(W, { type: 'game', bot: e.b.name, game, topic: W.contests[game]?.topic, score: r2(e.score), won, net: r2(net) }); }
  st.scoreSum += entries.reduce((s, e) => s + e.score, 0); st.top = Math.max(st.top ?? -Infinity, sorted[0].score);
  const r = rankCorr(entries.map((e) => e.know), entries.map((e) => e.score)); if (r !== null) { st.skillSum += r; st.skillN++; }
}
function gamePhase(W) {
  const cfg = W.cfg, con = W.contests; if (!con) { publishContests(W); return; }
  W.gameStats = Object.fromEntries(GKEYS.map((g) => [g, { entrants: 0, pot: 0, scoreSum: 0, top: null, skillSum: 0, skillN: 0 }]));
  W.gameArch = GROUPS.map(() => [0, 0, 0]);
  const entries = Object.fromEntries(GKEYS.map((g) => [g, []]));
  for (const b of W.bots) {
    b.gameResults = [];
    const picks = b.kind === 'ai' ? (b.gameAnswers || []).filter((x) => GAMES[x?.game]).map((x) => x.game) : b.g.nn ? b._nnGames || [] : ruleEntries(W, b);
    const seen = new Set();
    for (const g of picks) {
      if (seen.has(g) || !b.tickets.length || b.cash < cfg.gameStake || !con[g]?.questions.length) continue;
      seen.add(g); b.tickets.shift(); b.cash -= cfg.gameStake; flowOut(W, b, cfg.gameStake);
      const ans = b.kind === 'ai' ? (b.gameAnswers.find((x) => x.game === g)?.answers || []) : b.g.nn ? nnAnswers(W, b, g, con[g]) : ruleAnswers(W, b, g, con[g]);
      const know = con[g].questions.reduce((s, q) => s + q.ids.filter((id) => knows(W, b, id)).length / q.ids.length, 0) / con[g].questions.length;
      if (g === 'prediction') { (W.predictions ||= []).push({ b, settle: W.t + 4, qs: con[g].questions.map((q) => [q.ids[0], W.players[q.ids[0]].P]), probs: con[g].questions.map((q, i) => clamp(Number(ans[i]) || 0.5, 0, 1)), know }); continue; }
      entries[g].push({ b, score: scoreOf(W, g, con[g], ans), know, ans });
    }
  }
  // Duels: entrants are paired at random; the better score takes both stakes (a tie splits them back)
  const duel = entries.duel.sort(() => W.rand() - 0.5); W.gameStats.duel.entrants += duel.length; W.gameStats.duel.pot += duel.length * cfg.gameStake;
  for (let i = 0; i + 1 < duel.length; i += 2) {
    const [x, y] = [duel[i], duel[i + 1]], pot = 2 * cfg.gameStake;
    const shares = x.score === y.score ? [pot / 2, pot / 2] : x.score > y.score ? [pot, 0] : [0, pot];
    [[x, shares[0]], [y, shares[1]]].forEach(([e, got]) => { e.b.cash += got; flowIn(W, e.b, got); const a = W.gameArch[e.b._grp ?? 2]; a[0]++; if (got > cfg.gameStake) a[1]++; a[2] += got - cfg.gameStake; e.b.stats.gameNet = (e.b.stats.gameNet || 0) + got - cfg.gameStake; jot(W, { type: 'game', bot: e.b.name, game: 'duel', opponent: (e === x ? y : x).b.name, score: r2(e.score), won: got > cfg.gameStake, net: r2(got - cfg.gameStake) }); });
  }
  if (duel.length % 2) { const e = duel[duel.length - 1]; e.b.cash += cfg.gameStake; } // an unpaired duelist gets its stake back
  { const r = rankCorr(duel.map((e) => e.know), duel.map((e) => e.score)); if (r !== null) { W.gameStats.duel.skillSum += r; W.gameStats.duel.skillN++; } W.gameStats.duel.scoreSum += duel.reduce((s, e) => s + e.score, 0); }
  // The house's prize pool: half of last week's takings, shared between games by how many entered each
  const takings = (W.house.fees - (W.prevFees ?? W.house.fees)) + ((W.house.packRevenue || 0) - (W.prevPackRev ?? (W.house.packRevenue || 0))) + (W.living?.spent || 0);
  W.prevFees = W.house.fees; W.prevPackRev = W.house.packRevenue || 0; W.prizePaid = 0;
  const pool = Math.max(0, takings) * cfg.prizeShare, dueN = (W.predictions || []).filter((p) => p.settle <= W.t).length;
  const counts = Object.fromEntries(GKEYS.filter((g) => g !== 'duel').map((g) => [g, g === 'prediction' ? dueN : entries[g].length])), totN = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  W.prizePool = pool;
  for (const g of GKEYS) if (g !== 'duel' && g !== 'prediction') payout(W, g, entries[g], (pool * counts[g]) / totN);
  // Prediction league: settle the predictions made 4 weeks ago (Brier score: lower is better, so score = −Brier)
  const due = (W.predictions || []).filter((p) => p.settle <= W.t); W.predictions = (W.predictions || []).filter((p) => p.settle > W.t);
  if (due.length) payout(W, 'prediction', due.map((p) => ({ b: p.b, know: p.know, score: -p.qs.reduce((s, [id, P0], i) => s + (p.probs[i] - (W.players[id].P > P0 ? 1 : 0)) ** 2, 0) / p.qs.length })), (pool * counts.prediction) / totN);
  for (const b of W.bots) b.gameResults = W.journal.filter((j) => j.type === 'game' && j.bot === b.name && j.t === W.t).map(({ game, score, won, net }) => ({ game, score, won, net }));
  publishContests(W);
}
// A rule bot wants game tickets in proportion to what it knows
function ticketWish(W, b) {
  const topic = bestTopic(W, b);
  if (!topic) return W.rand() < 0.5 ? 1 : 0;
  const n = [...b.notes.entries()].filter(([id, note]) => fresh(W, note) && W.players[id].pos === topic).length;
  return clamp(1 + Math.floor(n / 3), 1, W.cfg.maxGamesPerWeek);
}

/* ---------- Strategy genome (no assigned strategies) ---------- */
// Every rule bot runs the same policy. What differs is its genome: how much weight it puts on each signal it can see,
// plus how aggressive, patient, leveraged, generous and sociable it is. Strategies are not assigned; a bot's "style"
// is just a label for its dominant weight, recomputed as its genome mutates down the generations. Whatever pays,
// spreads (if evolution is on); whatever doesn't, dies out.
//   value    the gap between its notes' estimate and the price
//   make     posting quotes on both sides (market making)
//   momentum the card's recent trend
//   herd     what the crowd is doing (recent volume and the market's mood)
//   pack     the gap between what a pack's pulls sell for and the pack's price
//   hoard    accumulating a few favourite players
//   revert   distance below the card's recent average (buying dips)
export const SIGNALS = ['value', 'make', 'momentum', 'herd', 'pack', 'hoard', 'revert'];
function socialStyle(W) { const s = W.cfg.social, r = W.rand(); return r < s.sharer ? 'sharer' : r < s.sharer + s.reciprocator ? 'reciprocator' : 'thief'; }
function gammaish(W, k) { let x = 0; for (let i = 0; i < 3; i++) x -= Math.log(W.rand() || 1e-9); return Math.pow(x / 3, 1 / k); } // skewed draw: most weights small, a few large
function norm(w) { const s = SIGNALS.reduce((a, k) => a + w[k], 0) || 1; for (const k of SIGNALS) w[k] /= s; return w; }
const styleOf = (w) => w.__nn ? NN_KIND : SIGNALS.reduce((best, k, i) => (w[k] > w[SIGNALS[best]] ? i : best), 0);
function collectorTargets(W) { const pool = (W._live || W.cards).filter((c) => c.on !== false && c.F > 4 * W.cfg.coinScale && c.F < 600 * W.cfg.coinScale); return pool.length ? [W.pick(pool).id, W.pick(pool).id] : []; }
function randomGenome(W) {
  const r = W.rand, w = {}; for (const k of SIGNALS) w[k] = gammaish(W, 0.45);
  return {
    w: norm(w), horizon: 2 + Math.floor(r() * 11), aggr: lerp(0.01, 0.08, r()), margin: lerp(0.04, 0.25, r()), keep: lerp(0.08, 0.4, r()),
    err: lerp(0.06, 0.35, r()), panic: lerp(0.06, 0.3, r()), spread: lerp(0.02, 0.1, r()), size: 5 + Math.floor(r() * 11),
    lev: r() < 0.5 ? 0 : -Math.log(r() || 1e-9) * 0.4, lendShare: r() < 0.5 ? 0 : r() * 0.6, lendRate: lerp(0.001, 0.008, r()), maxRate: lerp(0.002, 0.012, r()),
    passBid: lerp(2, 30, r()) * W.cfg.coinScale, passAsk: lerp(1, 12, r()) * W.cfg.coinScale, ticketBid: lerp(0.5, 8, r()) * W.cfg.coinScale, ticketAsk: lerp(0.2, 4, r()) * W.cfg.coinScale,
    targets: collectorTargets(W), book: [],
  };
}
function mutate(W, g) {
  if (g.nn) return mutateBrain(W, g);
  const o = { ...g, w: { ...g.w }, book: [], targets: g.targets.slice() };
  for (const k of SIGNALS) o.w[k] *= Math.exp(W.gauss() * 0.3);
  if (W.rand() < 0.1) o.w[W.pick(SIGNALS)] *= 3; // now and then a bigger jump: innovation
  norm(o.w);
  for (const k of ['aggr', 'margin', 'keep', 'err', 'panic', 'spread', 'lev', 'lendShare', 'lendRate', 'maxRate', 'passBid', 'passAsk', 'ticketBid', 'ticketAsk']) o[k] = Math.max(0, o[k] * lerp(0.85, 1.15, W.rand()) + (o[k] === 0 && W.rand() < 0.05 ? 0.05 : 0));
  o.horizon = clamp(Math.round(o.horizon * lerp(0.8, 1.25, W.rand())), 2, 16); o.size = clamp(Math.round(o.size * lerp(0.8, 1.25, W.rand())), 3, 20);
  if (W.rand() < 0.2) o.targets = collectorTargets(W);
  return o;
}
export function newBot(W, a, parent, extra = {}) {
  const ai = a === AI, g = ai ? randomGenome(W) : parent ? mutate(W, parent.g) : W.cfg.brain === 'nn' ? randomBrain(W) : randomGenome(W);
  const b = {
    id: W.nextId++, a: ai ? AI : styleOf(g.w), kind: ai ? 'ai' : 'rule', g, cash: W.cfg.startCash,
    h: new Map(), n: 0, nwh: [], gen: parent ? parent.gen + 1 : 1, born: W.t, seasons: 0,
    passes: [], tickets: [], notes: new Map(), debt: 0, lent: 0, flags: new Set(), friends: new Set(), flaggedBy: 0,
    social: parent ? (W.rand() < 0.1 ? socialStyle(W) : parent.social) : socialStyle(W),
    stats: { shared: 0, stolen: 0, caught: 0, researched: 0 }, memo: '', ...extra,
  };
  b.name = extra.name || (g.nn ? randomName(W, parent) : null) || `BOT-${String(b.id).padStart(3, '0')}`;
  b.surname = parent?.surname || b.name.split(' ')[1] || b.name;
  b.lineage = parent ? parent.lineage ?? parent.id : b.id;
  return b;
}

// The signals one bot reads for one card (all roughly in −1…1)
function signals(W, b, c) {
  const e = estimate(W, b, c), g = b.g;
  return {
    value: e === null ? 0 : clamp((e - c.P) / c.P, -1, 1),
    momentum: clamp(ret(c, g.horizon), -0.5, 0.5),
    revert: clamp(1 - c.P / ma(c, 12), -0.5, 0.5),
    herd: (recentVol(c, 4) > 2 ? clamp(ret(c, 2), -0.3, 0.3) + 0.05 : 0) - mood.drop * 2,
  };
}
const scoreCard = (b, s) => 3 * (b.g.w.value * s.value + b.g.w.momentum * s.momentum + b.g.w.revert * s.revert + b.g.w.herd * s.herd);

// Which players a bot wants to research this week: bots that weigh value, hoarding or dips read the library; pure
// momentum, herd and pack bots mostly sell their passes
function researchWish(W, b) {
  const w = b.g.w, want = clamp(Math.round(W.cfg.passesPerWeek * 1.6 * (w.value + w.hoard + 0.5 * w.revert + 0.5 * w.make)), 0, W.cfg.maxResearchPerWeek);
  if (!want) return [];
  const known = (c) => { const n = b.notes.get(c.isPlayer === false ? c.pid : c.id); return fresh(W, n) && W.t - n.week < W.cfg.knowledgeWeeks - 2; };
  const held = [...b.h.keys()].map((id) => W.cards[id]), tg = (b.g.targets || []).map((id) => W.cards[id]);
  return [...tg, ...held, ...hot.slice(0, W.cfg.hotResearch ?? 40), ...sample(W, 8)].filter((c, i, a) => c && c.on !== false && !known(c) && a.indexOf(c) === i).slice(0, want);
}

function act(W, b) {
  const pend = new Map(), g = b.g, w = g.w, nw = b.nwh[b.nwh.length - 1] || b.cash, pk = packInfo(W);
  const held = [...b.h.keys()].map((id) => W.cards[id]);
  const cand = [...held, ...[...b.notes.keys()].map((id) => W.cards[mktId(id, 0, 0)]), ...hot.slice(0, W.cfg.hotOrders ?? 30), ...sample(W, 10)].filter((c, i, a) => c && c.on !== false && a.indexOf(c) === i);
  const scored = cand.map((c) => [c, scoreCard(b, signals(W, b, c))]);
  // Panic: a bot that weighs the crowd dumps cards after a drawdown
  const dd = b.nwh.length > 4 ? 1 - b.nwh[b.nwh.length - 1] / Math.max(...b.nwh.slice(-5)) : 0;
  if (w.herd > 0.2 && Math.max(dd, mood.drop) > g.panic) { let k = 0; for (const c of held) { if (k++ > 6) break; ask(b, c, c.P * 0.85, pend); } return; }
  // Buy what scores well, sell what scores badly (one copy each; two on a strong signal)
  let spare = b.cash - g.keep * nw, orders = 0;
  for (const [c, s] of scored.sort((x, y) => y[1] - x[1])) {
    const q = b.h.get(c.id) || 0;
    if (s > 0.03 && spare > c.P && orders < W.cfg.deployOrders) { bid(b, c, c.P * (1 + Math.min(g.aggr, s))); spare -= c.P; orders++; if (s > 0.15 && spare > c.P) { bid(b, c, c.P * (1 + g.aggr)); spare -= c.P; } }
    else if (q && s < -0.03) ask(b, c, c.P * (1 - Math.min(g.aggr, -s) / 2), pend);
  }
  // Value exit: sell above the notes' estimate by the bot's margin
  if (w.value > 0.15) for (const c of held) { const e = estimate(W, b, c); if (e !== null && c.P > e * (1 + g.margin)) ask(b, c, Math.max(e * (1 + g.margin), c.P * 0.98), pend); }
  // Hoarding: keep buying two favourite players, rarely sell
  if (w.hoard > 0.15) for (const id of g.targets) { const c = W.cards[id]; if (!c || c.on === false) continue; const e = est(W, b, c); if (c.P < e * (1 + 2 * w.hoard) && b.cash > c.P) bid(b, c, c.P * 1.05); if ((b.h.get(id) || 0) && c.P > e * 3) ask(b, c, c.P, pend); }
  // Market making: quote both sides on a book of liquid cards, skewed by inventory
  if (w.make > 0.15) {
    if (!g.book.length || W.t % W.cfg.weeksPerGeneration === 1) g.book = hot.slice(0, W.cfg.hotBook ?? 50).sort(() => W.rand() - 0.5).slice(0, g.size).map((c) => c.id);
    for (const id of g.book) { const c = W.cards[id], inv = b.h.get(id) || 0, e = estimate(W, b, c), mid = e === null ? c.P : lerp(c.P, e, 0.3), skew = (inv - 3) * 0.012; if (inv < 10 && b.cash > c.P * 2) bid(b, c, mid * (1 - g.spread - skew)); if (inv > 0) ask(b, c, mid * (1 + g.spread - skew), pend); }
  }
  // Packs: rip when the pulls sell for more than the pack, then flip them; the crowd-minded rip for the thrill
  if (w.pack > 0.1 && pk.evMarket * (1 - W.cfg.fee) > pk.price * 1.02) for (let k = 0; k < 1 + Math.floor(w.pack * 4); k++) if (!buyPack(W, b)) break;
  if (w.pack > 0.2) for (const c of held) if (W.rand() < w.pack) ask(b, c, c.P * 0.985, pend);
  if (w.herd > 0.25 && W.rand() < w.herd * 0.3 && b.cash > pk.price * 1.5) buyPack(W, b);
  // Raise cash when below half the cash target: sell what scores worst
  if (b.cash < g.keep * nw * 0.5) for (const [c] of scored.filter(([c]) => b.h.get(c.id)).sort((x, y) => x[1] - y[1]).slice(0, 2)) ask(b, c, c.P * 0.98, pend);
}
// A rule bot's sealed bid for an auctioned card: what its signals say the card is worth to it
function ruleAuctionBid(W, b, c) {
  const s = scoreCard(b, signals(W, b, c)), e = estimate(W, b, c);
  if (b.g.w.hoard > 0.15 && b.g.targets.includes(c.id)) return est(W, b, c) * (1 + 2 * b.g.w.hoard) * 0.9;
  if (e !== null && b.g.w.value > 0.2) return e * (1 - b.g.margin * 0.5);
  return s > 0.05 ? c.P * (1 + Math.min(0.2, s)) : null;
}
function ruleAuctionList(W, b) {
  if (b.items?.size && W.rand() < 0.06 + (b.g.w?.pack || 0) * 0.3) { const it = W.items.get(W.pick([...b.items])); if (it) { listItem(W, b, it, markItem(W, it) * (1 + (b.g.margin || 0.1))); return; } }
  if (b.g.w.pack > 0.25) for (const [id] of b.h) { const c = W.cards[id]; if (c.circ < 12 && W.rand() < 0.3) { listAuction(W, b, c, c.P); return; } }
  if (b.g.w.herd > 0.3 && W.rand() < 0.04 && b.h.size) { const c = [...b.h.keys()].map((id) => W.cards[id]).sort((x, y) => y.P - x.P)[0]; listAuction(W, b, c, c.P * 0.9); }
}


/* ---------- Neural bots ("primitive AI") ---------- */
// Each neural bot carries two small networks and nothing else: no strategy, no signals picked for it, no rules of
// thumb. The card network looks at one card at a time (every live card market, every week) and answers buy, sell,
// how far from the last price, how many, whether to research him and whether to auction it. The bot network looks at
// the bot's own balance sheet and the world once a week and sets everything else: its cash target, lending and
// borrowing, what it pays for passes and tickets, packs, sharing and stealing, and which contests to enter. The
// weights start random. Whatever earns money survives: at each generation's end the worst-returning 10% (averaged
// over their last 3 generations) copy the networks of the top 10% with small random changes.
// Games per topic this week and next (what the contest board shows everyone), counted once a week
function topicCount(W) { if (W._tcT === W.t) return W._tc; const n = {}; for (const cs of [W.contests, W.contestsAhead]) for (const c of Object.values(cs || {})) if (c?.topic) n[c.topic] = (n[c.topic] || 0) + 1; W._tcT = W.t; return (W._tc = n); }
export const CARD_IN_BASE = ['bias', 'price (log)', 'rarity premium (log)', 'design', 'finish', 'change 1w', 'change 4w', 'change 12w', 'below 12w average', 'trades 4w', 'copies out', 'pool left', 'has a note', 'note vs price', 'note age', 'OVR (from research)', 'copies held', 'gain on cost', 'share of worth', 'cash share', 'debt share', 'market drawdown', 'market 4w', 'season phase', 'one of a kind', 'its premium', 'risk rating (from research)', 'royalty yield (from note)', 'my weeks of life left', 'copies I am short', 'copies lendable', 'card lending fee', 'royalty paid last gen ÷ price', 'games on its position (this + next wk)', 'best bid ÷ price', 'best ask ÷ price', 'weeks out injured', 'form vs career pace', 'reigning award winner', 'retired', 'rookie'];
export const CARD_OUT_BASE = ['buy', 'sell', 'price offset', 'size', 'research', 'auction', 'short', 'anchor to my estimate'];
// The public price guide (priceGuide) adds two card-network inputs and one output. They exist only in a world where the
// guide is or was on, so with it off the networks, their random draws and every frame stay exactly as before.
export const GUIDE_IN = ['guide ÷ price', 'weeks since the guide updated'], GUIDE_OUT = ['anchor to the guide'];
export let CARD_IN = CARD_IN_BASE, CARD_OUT = CARD_OUT_BASE;
export const BOT_IN = ['bias', 'cash share', 'debt share', 'lent share', 'worth vs median', 'own 4w return', 'age', 'credit rate', 'weeks to my loan due', 'weeks to a loan I made is due', 'pass price', 'ticket price', 'prize pool', 'notes held', 'fresh notes', 'flags on me', 'friends', 'market drawdown', 'market 4w', 'season phase', 'pack value vs price', 'last week games', 'royalty rate', 'living cost share', 'weeks of life left', 'allowance share', 'trade fee', 'pack markup', 'card lending fee', 'short margin', 'my short exposure', 'my cards lent', ...TOPICS.map((t) => `games on ${t} (this + next wk)`)];
// What a bot sees of another bot when it picks whom to swap notes with or steal from (all public or its own record, never
// the other's notes): the bot network's last outputs weigh these, and the best-scoring candidate is chosen (socialPhase)
export const PARTNER_IN = ['a friend of mine', 'its public flags', 'its weeks in the market'];
export const BOT_OUT = ['cash target', 'lend share', 'lend rate', 'borrow share', 'max borrow rate', 'pass bid', 'pass ask', 'ticket bid', 'ticket ask', 'research count', 'Standard packs', 'Premium packs', 'Elite packs', 'Holo packs', 'share notes', 'steal notes', 'accept swaps', ...GKEYS.map((g) => `enter ${g}`), 'lend cards share', ...TOPICS.map((t) => `research aim ${t}`), ...Object.keys(PACK_TYPES).map((t) => `pack bid ${t}`), 'quit', ...PARTNER_IN.map((f) => `share partner: ${f}`), ...PARTNER_IN.map((f) => `steal victim: ${f}`)];
const OUT_QUIT = 17 + GKEYS.length + 1 + TOPICS.length + Object.keys(PACK_TYPES).length, OUT_SHARE_W = OUT_QUIT + 1, OUT_STEAL_W = OUT_SHARE_W + 3; // where the quit and partner-weight outputs sit
let CARD_SHAPE = [CARD_IN.length, 16, 8, CARD_OUT.length]; const BOT_SHAPE = [BOT_IN.length, 12, BOT_OUT.length];
const NN = 8;
const sigm = (x) => 1 / (1 + Math.exp(-x));
const NW_FLOOR = 50; // × coinScale: the worth a bot's shares (cash, debt, holdings) are measured against when its own is lower, so a broke bot's inputs stay finite
function netSize(sh) { let n = 0; for (let i = 0; i + 1 < sh.length; i++) n += (sh[i] + 1) * sh[i + 1]; return n; }
function randomNet(W, sh) { const w = new Float64Array(netSize(sh)); let k = 0; for (let i = 0; i + 1 < sh.length; i++) { const s = 1 / Math.sqrt(sh[i]); for (let j = 0; j < (sh[i] + 1) * sh[i + 1]; j++) w[k++] = W.gauss() * s; } return w; }
// Forward pass: tanh hidden layers, linear outputs. `buf` holds the layers so nothing is allocated per card.
function forward(sh, w, x, buf) {
  if (sh === CARD_SHAPE) return forwardCard(w, x, buf);
  let k = 0, a = x;
  for (let l = 0; l + 1 < sh.length; l++) {
    const n = sh[l], m = sh[l + 1], o = buf[l];
    for (let j = 0; j < m; j++) { let s = w[k + n]; for (let i = 0; i < n; i++) s += w[k + i] * a[i]; k += n + 1; o[j] = l + 2 < sh.length ? Math.tanh(s) : s; }
    a = o;
  }
  return a;
}
const bufs = (sh) => sh.slice(1).map((m) => new Float64Array(m));
// The card network's forward pass with its shape fixed (it runs about 350,000 times a week)
// Inputs 0 and 19–23 are the same for every card a bot looks at in a week, so their share of the first layer is folded
// into a bias once per bot and week (`fold`); inputs that are zero are skipped. The result is the same.
const VARY_BASE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 27, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40]; let VARY = VARY_BASE; const FIXED = [0, 19, 20, 21, 22, 23, 28, 31];
const FOLD = new Float64Array(16), FOLD_X = new Float64Array(16); let foldKey = null, foldT = -1;
function foldFor(w, x, t, o = 0) {
  if (foldKey === w && foldT === t) { let same = true; for (let k = 0; k < FIXED.length; k++) if (x[o + FIXED[k]] !== FOLD_X[k]) { same = false; break; } if (same) return; }
  const N0 = CARD_SHAPE[0]; for (let j = 0, k = 0; j < CARD_SHAPE[1]; j++, k += N0 + 1) { let s = w[k + N0]; for (const i of FIXED) s += w[k + i] * x[o + i]; FOLD[j] = s; }
  foldKey = w; foldT = t; for (let k = 0; k < FIXED.length; k++) FOLD_X[k] = x[o + FIXED[k]];
}
function forwardCard(w, x, buf) { foldFor(w, x, CUR_T); cardKernel(w, x, 0, buf[2], 0, buf); return buf[2]; }
// One card's pass through the card network: inputs x[o..], outputs to out[oo..]. The 16 first-layer sums run side by side
// (one pass over the inputs feeds all of them) and the later layers are written out: every sum adds the same terms in
// the same order as the plain loops did, so each result is bit-identical, but the CPU overlaps the chains (2.5× faster).
function cardKernel(w, x, o, out, oo, buf) {
  const R = CARD_SHAPE[0] + 1, N3 = CARD_SHAPE[3], V = VARY, NV = V.length, F = FOLD;
  let s0 = F[0], s1 = F[1], s2 = F[2], s3 = F[3], s4 = F[4], s5 = F[5], s6 = F[6], s7 = F[7], s8 = F[8], s9 = F[9], s10 = F[10], s11 = F[11], s12 = F[12], s13 = F[13], s14 = F[14], s15 = F[15];
  for (let v = 0; v < NV; v++) { const i = V[v], xi = x[o + i]; if (xi === 0) continue; // zero inputs are skipped, as before
    s0 += w[i] * xi; s1 += w[i + R] * xi; s2 += w[i + 2 * R] * xi; s3 += w[i + 3 * R] * xi; s4 += w[i + 4 * R] * xi; s5 += w[i + 5 * R] * xi; s6 += w[i + 6 * R] * xi; s7 += w[i + 7 * R] * xi;
    s8 += w[i + 8 * R] * xi; s9 += w[i + 9 * R] * xi; s10 += w[i + 10 * R] * xi; s11 += w[i + 11 * R] * xi; s12 += w[i + 12 * R] * xi; s13 += w[i + 13 * R] * xi; s14 += w[i + 14 * R] * xi; s15 += w[i + 15 * R] * xi; }
  const a0 = fastTanh(s0), a1 = fastTanh(s1), a2 = fastTanh(s2), a3 = fastTanh(s3), a4 = fastTanh(s4), a5 = fastTanh(s5), a6 = fastTanh(s6), a7 = fastTanh(s7), a8 = fastTanh(s8), a9 = fastTanh(s9), a10 = fastTanh(s10), a11 = fastTanh(s11), a12 = fastTanh(s12), a13 = fastTanh(s13), a14 = fastTanh(s14), a15 = fastTanh(s15);
  if (buf) { const h = buf[0]; h[0] = a0; h[1] = a1; h[2] = a2; h[3] = a3; h[4] = a4; h[5] = a5; h[6] = a6; h[7] = a7; h[8] = a8; h[9] = a9; h[10] = a10; h[11] = a11; h[12] = a12; h[13] = a13; h[14] = a14; h[15] = a15; }
  let k = 16 * R; const h2 = KERN_H2;
  for (let j = 0; j < 8; j++, k += 17) h2[j] = fastTanh(w[k + 16] + w[k] * a0 + w[k + 1] * a1 + w[k + 2] * a2 + w[k + 3] * a3 + w[k + 4] * a4 + w[k + 5] * a5 + w[k + 6] * a6 + w[k + 7] * a7 + w[k + 8] * a8 + w[k + 9] * a9 + w[k + 10] * a10 + w[k + 11] * a11 + w[k + 12] * a12 + w[k + 13] * a13 + w[k + 14] * a14 + w[k + 15] * a15);
  const b0 = h2[0], b1 = h2[1], b2 = h2[2], b3 = h2[3], b4 = h2[4], b5 = h2[5], b6 = h2[6], b7 = h2[7]; if (buf) buf[1].set(h2);
  for (let j = 0; j < N3; j++, k += 9) out[oo + j] = w[k + 8] + w[k] * b0 + w[k + 1] * b1 + w[k + 2] * b2 + w[k + 3] * b3 + w[k + 4] * b4 + w[k + 5] * b5 + w[k + 6] * b6 + w[k + 7] * b7;
}
const KERN_H2 = new Float64Array(8);
// Many cards for one bot: rows from..to of X (inputs, CARD_SHAPE[0] wide) into O (outputs, CARD_SHAPE[3] wide)
function scoreRows(w, X, O, from, to) { const NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3]; for (let r = from; r < to; r++) { foldFor(w, X, CUR_T, r * NI); cardKernel(w, X, r * NI, O, r * N3, null); } }
function fastTanh(v) { if (v > 9) return 1; if (v < -9) return -1; const e = Math.exp(2 * v); return (e - 1) / (e + 1); }
let CB = bufs(CARD_SHAPE), XC = new Float64Array(CARD_SHAPE[0]); let SHAPE_G = false;
// Switch the card network's shape to this world's (the guide inputs and output, or not)
function useShape(W) {
  const g = !!W.guideNet; if (g === SHAPE_G) return; SHAPE_G = g;
  CARD_IN = g ? [...CARD_IN_BASE, ...GUIDE_IN] : CARD_IN_BASE; CARD_OUT = g ? [...CARD_OUT_BASE, ...GUIDE_OUT] : CARD_OUT_BASE;
  CARD_SHAPE = [CARD_IN.length, 16, 8, CARD_OUT.length]; CB = bufs(CARD_SHAPE); XC = new Float64Array(CARD_SHAPE[0]); VARY = g ? [...VARY_BASE, 41, 42] : VARY_BASE; foldKey = null;
}
// A network from before the guide was turned on: the new input and output weights start small and random, the rest
// unchanged, so nothing breaks and the bot must learn to use the guide
function widenCard(W, w) {
  const N0 = CARD_IN_BASE.length, M = CARD_OUT_BASE.length, A = CARD_SHAPE[0], O = CARD_SHAPE[3];
  if (w.length === netSize(CARD_SHAPE) || w.length !== netSize([N0, 16, 8, M])) return w;
  const out = new Float64Array(netSize(CARD_SHAPE)); let i = 0, k = 0;
  for (let j = 0; j < 16; j++) { for (let q = 0; q < N0; q++) out[k++] = w[i++]; for (let q = N0; q < A; q++) out[k++] = W.gauss() * 0.1; out[k++] = w[i++]; }
  for (let q = 0; q < 17 * 8 + M * 9; q++) out[k++] = w[i++];
  for (let q = M; q < O; q++) for (let r = 0; r < 9; r++) out[k++] = W.gauss() * 0.1;
  return out;
}
// A bot network from before the partner-weight outputs (one output fewer per weight): the new outputs' weights start small
// and random, every other weight unchanged (the output layer is the array's end, one row of hidden + 1 per output)
function widenBot(W, w) { const n = netSize(BOT_SHAPE), h = BOT_SHAPE[1] + 1; if (w.length > n || (n - w.length) % h) return w; const out = new Float64Array(n); out.set(w); for (let i = w.length; i < n; i++) out[i] = W.gauss() * 0.1; return out; }
const BB = bufs(BOT_SHAPE), XB = new Float64Array(BOT_SHAPE[0]);
const FLAT = Object.fromEntries(SIGNALS.map((k) => [k, 0]));
function startBias(W, card, bot) {
  const b = W.cfg.nnStartBias; if (!b) return;
  const cOut = (CARD_SHAPE[0] + 1) * CARD_SHAPE[1] + (CARD_SHAPE[1] + 1) * CARD_SHAPE[2], cN = CARD_SHAPE[2] + 1; // the output layer's weights start here; each output has N2 weights then its bias
  for (const j of [0, 1]) card[cOut + j * cN + CARD_SHAPE[2]] -= b; // buy, sell
  const bOut = (BOT_SHAPE[0] + 1) * BOT_SHAPE[1], bN = BOT_SHAPE[1] + 1;
  for (const j of [3, 10, 11, 12, 13]) bot[bOut + j * bN + BOT_SHAPE[1]] -= b; // borrow, the four pack types
}
function randomBrain(W) { const card = randomNet(W, CARD_SHAPE), bot = randomNet(W, BOT_SHAPE); startBias(W, card, bot); return { nn: true, card, bot, w: { ...FLAT, __nn: true }, err: W.cfg.nnResearchError, targets: [], book: [], keep: 0.2, lev: 0, lendShare: 0, lendRate: 0.004, maxRate: 0.006, passBid: 100, passAsk: 100, ticketBid: 20, ticketAsk: 20 }; }
function mutateBrain(W, g) {
  const s = W.cfg.nnMutation, o = { ...g, card: Float64Array.from(g.card), bot: Float64Array.from(g.bot), w: { ...g.w }, targets: [], book: [] };
  for (const net of [o.card, o.bot]) for (let i = 0; i < net.length; i++) { net[i] += W.gauss() * s; if (W.rand() < W.cfg.nnReset) net[i] = W.gauss(); }
  return o;
}
let CUR_T = -1;
function marketCtx(W) {
  CUR_T = W.t;
  const ph = W.hist.p; return { drop: clamp(mood.drop * 3, 0, 1), m4: ph.length > 4 ? clamp((ph[ph.length - 1] / ph[ph.length - 5] - 1) * 3, -1, 1) : 0, phase: (W.t % W.cfg.weeksPerGeneration) / W.cfg.weeksPerGeneration };
}
// What the card market shows everyone this week, kept for each card in one flat array per world and filled at the card's
// first look of the week (as the per-card cache always was), so each bot's look reads numbers instead of the card
// object (each card inherits from its own player, so its properties are slow to reach). Also its fixed facts (player,
// design, finish, premium) and the week's games on its position (topicCount is itself fixed for the week once read).
const CWN = 16;
function cardWeek(W, c, id) {
  let T = W._cwT; if (!T || id >= T.length) { const n = Math.max(W.cards.length, id + 1), A = new Float64Array(n * CWN), T2 = new Int32Array(n).fill(-1); if (T) { A.set(W._cw); T2.set(T); } W._cw = A; W._cwT = T = T2; }
  const o = id * CWN; if (T[id] === W.t) return o;
  const m = W._cw, P = Math.max(0.01, c.P);
  m[o + 5] = clamp(ret(c, 1), -0.5, 0.5) * 2; m[o + 6] = clamp(ret(c, 4), -0.5, 0.5) * 2; m[o + 7] = clamp(ret(c, 12), -1, 1); m[o + 8] = clamp(1 - P / ma(c, 12), -0.5, 0.5) * 2; m[o + 9] = Math.log1p(recentVol(c, 4)) / 3; m[o + 10] = Math.log1p(c.circ) / 4; m[o + 11] = Math.log1p(c.pool || 0) / 5; m[o + 2] = Math.log(c.mult) / 2; m[o + 1] = Math.log10(P) / 5;
  m[o] = c.pid; m[o + 3] = c.d / 3; m[o + 4] = c.f / 3; m[o + 12] = c.mult; m[o + 13] = (topicCount(W)[c.pos] || 0) / 4; // games whose topic is this card's position, this week and next
  T[id] = W.t; return o;
}
// The card network's inputs for one bot and one card (or one-of-a-kind item), into x from offset xo
function cardInputs(W, b, c, nw, ctx, it, x = XC, xo = 0, id = c.id) {
  const o = cardWeek(W, c, id), m = W._cw, pid = m[o], cm = m[o + 12];
  const S = SNAP && id < SNAP.n ? SNAP : null, n = b.notes.get(pid), q = b.h.get(id) || 0, P = Math.max(0.01, S ? S.P[id] : c.P), mult = it ? it.mult : cm, price = it ? markItem(W, it) : P, fr = fresh(W, n);
  x[xo] = 1; x[xo + 1] = it ? Math.log10(price) / 5 : m[o + 1]; x[xo + 2] = it ? Math.log(mult) / 2 : m[o + 2]; x[xo + 3] = m[o + 3]; x[xo + 4] = m[o + 4];
  x[xo + 5] = m[o + 5]; x[xo + 6] = m[o + 6]; x[xo + 7] = m[o + 7]; x[xo + 8] = m[o + 8]; x[xo + 9] = m[o + 9]; x[xo + 10] = m[o + 10]; x[xo + 11] = m[o + 11];
  x[xo + 12] = fr ? 1 : 0; x[xo + 13] = fr ? clamp((n.est * mult - price) / price, -1, 1) : 0; x[xo + 14] = n ? clamp((W.t - n.week) / W.cfg.knowledgeWeeks, 0, 2) : 1; x[xo + 15] = fr && n.ovr ? (n.ovr - 80) / 20 : 0;
  x[xo + 16] = it ? 1 : Math.log1p(q) / 2; const ac = q ? avgCost(b, id) : null; x[xo + 17] = it ? clamp(it.cost ? price / it.cost - 1 : 0, -1, 1) : ac ? clamp(P / ac - 1, -1, 1) : 0; x[xo + 18] = clamp(((it ? 1 : q) * price) / nw, 0, 1);
  x[xo + 19] = clamp(b.cash / nw, -1, 1); x[xo + 20] = clamp((b.debt || 0) / nw, 0, 2); x[xo + 21] = ctx.drop; x[xo + 22] = ctx.m4; x[xo + 23] = ctx.phase;
  x[xo + 24] = it ? 1 : 0; x[xo + 25] = it ? Math.log(it.mult / cm) / 2 : 0; x[xo + 26] = fr && n.risk != null ? (n.risk - 80) / 20 : 0;
  x[xo + 27] = W.cfg.royalties && !W.cfg.priceOnly ? clamp(W.cfg.royaltyRate * 10 * (fr ? (n.est * mult) / price : 1), 0, 3) : 0; // what holding it pays each generation, against its price
  x[xo + 28] = b._life ?? 1; x[xo + 29] = Math.log1p(b.owed?.get(id) || 0); x[xo + 30] = Math.log1p(W.lendable?.get(id) || 0) / 3; x[xo + 31] = W.cfg.shorting ? W.cfg.cardLendFee * 100 : 0;
  const N = S ? S.news : playerNews(W, W.players[pid], NEWS1, 0), no = S ? pid * NWN : 0;
  if (S && !it) { const k = id * 4, X = S.cx; x[xo + 32] = X[k]; x[xo + 33] = m[o + 13]; x[xo + 34] = X[k + 1]; x[xo + 35] = X[k + 2]; if (SHAPE_G) x[xo + 41] = X[k + 3]; } // the same for every bot in a snapshot phase
  else { cardMarketInputs(it ? it.lastRoy : S ? S.roy[id] : c.lastRoy, S ? S.bb[id] : c.bb, S ? S.ba[id] : c.ba, price, P, N, no, mult, x, xo); x[xo + 33] = m[o + 13]; }
  x[xo + 36] = N[no]; x[xo + 37] = N[no + 1]; x[xo + 38] = N[no + 2]; x[xo + 39] = N[no + 3]; x[xo + 40] = N[no + 4];
  if (SHAPE_G) x[xo + 42] = N[no + 5] === 1 ? N[no + 7] : 0;
  return x;
}
// Inputs 32, 34, 35 and 41 (with the guide): royalty yield, last week's book and the guide, each against the price
function cardMarketInputs(roy, bb, ba, price, P, N, no, mult, x, xo) {
  x[xo + 32] = roy ? clamp((roy / price) * 5, 0, 3) : 0; // what one copy paid holders at the last generation's end, against its price now
  x[xo + 34] = bb > 0 ? clamp(Math.log(bb / P), -1, 1) : -1.5; x[xo + 35] = ba > 0 ? clamp(Math.log(ba / P), -1, 1) : 1.5; // last week's best unfilled bid and ask (none = off the scale)
  if (SHAPE_G) x[xo + 41] = N[no + 5] === 1 ? clamp(Math.log((N[no + 6] * mult) / price), -1, 1) : 0; // the public price guide: everyone sees it
}
// What everyone sees about a player: the league's public news (hidden value itself stays hidden) and the price guide
const NWN = 8, NEWS1 = new Float64Array(NWN);
function playerNews(W, pl, a, o) {
  const lg = pl?.lg, L = W.L;
  if (lg && L) { const out = lg.out && L.week >= lg.out[0] && L.week <= lg.out[1] ? lg.out[1] - L.week + 1 : 0;
    a[o] = out / L.full; a[o + 1] = lg.active ? clamp(Math.log(Math.max(0.05, lg.formRatio ?? 1)), -1.5, 1.5) : 0; a[o + 2] = lg.awardSeason != null && lg.awardSeason === L.season ? 1 : 0; a[o + 3] = lg.active ? 0 : 1; a[o + 4] = pl.rookie && lg.seasons <= 1 ? 1 : 0; }
  else { a[o] = 0; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; }
  const on = guideOn(W.cfg) && pl?.guide > 0; a[o + 5] = on ? 1 : 0; a[o + 6] = on ? pl.guide : 0; a[o + 7] = on ? clamp((W.t - pl.guideT) / 4, 0, 2) : 0;
  return a;
}
const cardNet = (W, b, c, nw, ctx, it) => forward(CARD_SHAPE, b.g.card, cardInputs(W, b, c, nw, ctx, it), CB);
function nnThink(W, b, med) {
  const g = b.g, x = XB, nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W), lw = W.cfg.loanWeeks;
  const mine = (W.loans || []).filter((L) => L.borrower === b), lent = (W.loans || []).filter((L) => L.lender === b);
  x[0] = 1; x[1] = clamp(b.cash / nw, -1, 1); x[2] = clamp((b.debt || 0) / nw, 0, 2); x[3] = clamp((b.lent || 0) / nw, 0, 2); x[4] = clamp(Math.log(nw / Math.max(1, med)) / 3, -2, 2);
  x[5] = b.nwh.length > 4 ? clamp(b.nwh[b.nwh.length - 1] / b.nwh[b.nwh.length - 5] - 1, -1, 1) : 0; x[6] = b.lifespan ? clamp(b.seasons / b.lifespan, 0, 1.5) : 0;
  x[7] = clamp((W.credit?.rate || 0) * 100, 0, 3); x[8] = mine.length ? clamp((Math.min(...mine.map((L) => L.due)) - W.t) / lw, -1, 1) : 1; x[9] = lent.length ? clamp((Math.min(...lent.map((L) => L.due)) - W.t) / lw, -1, 1) : 1;
  x[10] = Math.log1p(W.passPrice || 0) / 5; x[11] = Math.log1p(W.ticketPrice || 0) / 5; x[12] = Math.log1p((W.prizePool || 0) / Math.max(1, W.bots.length)) / 5;
  let fr = 0; for (const n of b.notes.values()) if (fresh(W, n)) fr++;
  x[13] = b.notes.size / W.cfg.memoryCap; x[14] = fr / W.cfg.memoryCap; x[15] = clamp((b.flaggedBy || 0) / 5, 0, 2); x[16] = clamp(b.friends.size / 10, 0, 2);
  x[17] = ctx.drop; x[18] = ctx.m4; x[19] = ctx.phase; const pk = packInfo(W); x[20] = clamp(pk.evMarket / Math.max(0.01, pk.price) - 1, -1, 1);
  x[21] = clamp((b.gameResults || []).reduce((s, r) => s + (r.net || 0), 0) / Math.max(1, W.cfg.gameStake * 3), -2, 2);
  const cfg = W.cfg, gw = cfg.weeksPerGeneration, life = cfg.mortality ? ((b.lifespan ?? (cfg.lifespan[0] + cfg.lifespan[1]) / 2) - b.seasons) * gw - (W.t % gw) : 400;
  b._life = clamp(life / 200, 0, 2);
  x[22] = cfg.royalties && !cfg.priceOnly ? cfg.royaltyRate * 10 : 0; x[23] = clamp(((cfg.livingCost + cfg.lifestyle * nw) / nw) * 10, 0, 3); x[24] = b._life; x[25] = clamp(((cfg.allowance * (W.fillK ?? 1) / (W.botK ?? 1)) / nw) * 10, 0, 3);
  x[26] = cfg.fee * 10; x[27] = cfg.packEdge; x[28] = cfg.shorting ? cfg.cardLendFee * 100 : 0; x[29] = cfg.shorting ? cfg.shortMargin : 0;
  x[30] = clamp(owedValue(W, b) / nw, 0, 3); x[31] = clamp(lentValue(W, b) / nw, 0, 3);
  { const tc = W.cfg.games ? topicCount(W) : {}; TOPICS.forEach((t, i) => { x[32 + i] = (tc[t] || 0) / 4; }); }
  if (g.bot.length !== netSize(BOT_SHAPE)) g.bot = widenBot(W, g.bot);
  const o = forward(BOT_SHAPE, g.bot, x, BB);
  g.lendCards = Math.max(0, Math.tanh(o[27]));
  g.keep = (W.cfg.keepMax ?? 0.95) * sigm(o[0]); g.lendShare = Math.max(0, Math.tanh(o[1])) * 0.7; g.lendRate = nnRate(W, o[2]); g.lev = Math.max(0, Math.tanh(o[3])) * 1.5; g.maxRate = nnRate(W, o[4]);
  { const D = W.limDiag, rm = W.cfg.rateMax ?? 0.05, wall = (v) => (W.cfg.rateMap === 'log' ? v >= (W.cfg.rateClamp ?? 10) * 0.999 : (v - 0.001) / (rm - 0.001) > 0.95); // measurement only: is each output at its wall?
    if (D) { D.bots++; if (sigm(o[0]) > 0.95) D.keep++; if (wall(g.lendRate)) D.lendRate++; if (wall(g.maxRate)) D.maxRate++; if (g.lendRate > 0.05) D.lendOver++; if (g.maxRate > 0.05) D.maxOver++; if (Math.tanh(o[1]) > 0.9) D.lendShare++; if (Math.tanh(o[3]) > 0.9) D.lev++; } }
  const K = W.cfg.coinScale, lpc = Math.log(W.cfg.priceClamp ?? 50), plog = W.cfg.priceMap === 'log';
  // Pass and ticket prices: 'range' a sigmoid up to a wall (30, 15, 10, 5 coins); 'log' the last clearing price (before any
  // trade, the range's midpoint) × exp(output), held only at the safety clamp, as card and pack bids are
  const tok = (v, wall, last) => (plog ? (last > 0 ? last : wall * K / 2) * Math.exp(clamp(v, -lpc, lpc)) : wall * K * sigm(v));
  g.passBid = tok(o[5], 30, W.passPrice); g.passAsk = tok(o[6], 15, W.passPrice); g.ticketBid = tok(o[7], 10, W.ticketPrice); g.ticketAsk = tok(o[8], 5, W.ticketPrice);
  b._nnResearch = Math.round(sigm(o[9]) * W.cfg.maxResearchPerWeek);
  b._nnPacks = Object.keys(PACK_TYPES).map((t, i) => [t, o[10 + i] > 0 ? 1 + (o[10 + i] > 1.5 ? 1 : 0) : 0]);
  b.social = o[15] > Math.max(o[14], 0) ? 'thief' : o[14] > 0 ? 'sharer' : 'reciprocator'; b._nnAccept = o[16] > 0; // the label is its dominant wish; each act below is its own output
  b._nnShare = o[14] > 0; b._nnSteal = o[15] > 0; b._nnShareW = [o[OUT_SHARE_W], o[OUT_SHARE_W + 1], o[OUT_SHARE_W + 2]]; b._nnStealW = [o[OUT_STEAL_W], o[OUT_STEAL_W + 1], o[OUT_STEAL_W + 2]];
  const aim0 = 17 + GKEYS.length + 1; b._nnAim = Object.fromEntries(TOPICS.map((t, i) => [t, Math.tanh(o[aim0 + i])])); // added to each card's research score by position
  b._nnQuit = sigm(o[OUT_QUIT]); // its own wish to leave the market (quitRule 'network')
  b._nnPackBid = Object.fromEntries(Object.keys(PACK_TYPES).map((t, i) => { const v = o[aim0 + TOPICS.length + i]; if (W.limDiag) { W.limDiag.packBid++; if (plog ? Math.abs(v) >= lpc : Math.abs(Math.tanh(v)) > 0.9) W.limDiag.packBidEdge++; } return [t, Math.exp(plog ? clamp(v, -lpc, lpc) : Math.tanh(v))]; })); // its bid: ×0.37 to ×2.7 the last clearing price ('range'), or as far as the safety clamp ('log')
  b._nnGames = GKEYS.map((k, i) => [k, o[17 + i]]).filter(([, v]) => v > 0).sort((p, q) => q[1] - p[1]).map(([k]) => k);
}
// A loan-rate output as a weekly rate: 'range' a sigmoid between 0.1% and rateMax; 'log' rateLogMid × exp(output), held only at rateClamp
const nnRate = (W, v) => (W.cfg.rateMap === 'log' ? Math.min(W.cfg.rateClamp ?? 10, (W.cfg.rateLogMid ?? 0.025) * Math.exp(Math.min(v, 50))) : 0.001 + ((W.cfg.rateMax ?? 0.05) - 0.001) * sigm(v));
// Every card's price, last week's best unfilled bid and ask, and last royalty, read once at the start of a phase in which
// none of them can change (the bots' research wishes; the weekly orders) instead of once per card per bot. The check at
// the phase's end makes sure of it: a rule that changes one of them inside such a phase must clear SNAP before it does.
let SNAP = null;
function snapCards(W) {
  const n = W.cards.length, S = { n, P: new Float64Array(n), bb: new Float64Array(n), ba: new Float64Array(n), roy: new Float64Array(n), off: new Uint8Array(n) };
  for (const c of W.cards) { const id = c.id; S.P[id] = c.P; S.bb[id] = c.bb; S.ba[id] = c.ba; S.roy[id] = c.lastRoy; S.off[id] = c.on === false ? 1 : 0; } // undefined is stored as NaN: both read as "none"
  S.news = new Float64Array(W.players.length * NWN); W.players.forEach((pl, i) => playerNews(W, pl, S.news, i * NWN)); // (players are indexed by id)
  S.cx = new Float64Array(n * 4); const T = new Float64Array(43); // each plain card's inputs 32, 34, 35, 41, as cardInputs reads them
  for (const c of W.cards) { const id = c.id, P = Math.max(0.01, S.P[id]); cardMarketInputs(S.roy[id], S.bb[id], S.ba[id], P, P, S.news, c.pid * NWN, c.mult, T, 0); S.cx[id * 4] = T[32]; S.cx[id * 4 + 1] = T[34]; S.cx[id * 4 + 2] = T[35]; S.cx[id * 4 + 3] = T[41]; }
  return S;
}
function endSnap(W, S) {
  if (SNAP !== S) return; SNAP = null; const same = (a, v) => Object.is(a, v) || (Number.isNaN(a) && v == null) || (a === 0 && v === null); // null and undefined were stored as 0 and NaN
  for (const c of W.cards) { const id = c.id; if (id >= S.n) continue; if (!same(S.P[id], c.P) || !same(S.bb[id], c.bb) || !same(S.ba[id], c.ba) || !same(S.roy[id], c.lastRoy) || S.off[id] !== (c.on === false ? 1 : 0)) throw new Error(`card ${c.key}: price, quotes, royalty or status changed during a phase that reads them from a snapshot`); }
  for (let i = 0; i < W.players.length && (i + 1) * NWN <= S.news.length; i++) { playerNews(W, W.players[i], NEWS1, 0); for (let k = 0; k < NWN; k++) if (!Object.is(NEWS1[k], S.news[i * NWN + k])) throw new Error(`player ${W.players[i].key}: league news or guide changed during a phase that reads them from a snapshot`); }
}
// Row buffers for scoring many cards for one bot at once (reused, grown when needed)
let ROW_X = new Float64Array(0), ROW_O = new Float64Array(0), ROW_C = [], ROW_I = new Int32Array(0), ROW_ID = new Int32Array(0);
function rowBufs(n) { const NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3]; if (ROW_X.length < n * NI) ROW_X = new Float64Array(n * NI); if (ROW_O.length < n * N3) ROW_O = new Float64Array(n * N3); if (ROW_I.length < n) { ROW_I = new Int32Array(n); ROW_ID = new Int32Array(n); } }
// Research: the players whose cards most make the network want to look them up (players it has no fresh note on)
function nnResearchWish(W, b) {
  const want = b._nnResearch || 0; if (!want) return [];
  const nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W), seen = new Set(), NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3];
  const pidOf = cardIndex(W), live = W._live, lid = W._liveId, ids = [];
  const S = SNAP, look = (id) => { const pid = pidOf[id]; if (seen.has(pid) || (S && id < S.n ? S.off[id] === 1 : W.players[pid].on === false)) return; seen.add(pid); if (!fresh(W, b.notes.get(pid))) ids.push(id); }; // a card's status is its player's
  if (W.cfg.attention > 0) { for (const c of attended(W, b)) if (c) look(c.id); } // (attention budget) only the cards it looks at this week, in that order
  else { for (const id of b.h.keys()) look(id); for (let i = 0; i < live.length; i++) look(lid[i]); } // the cards it holds first, then every live card
  rowBufs(ids.length); for (let r = 0; r < ids.length; r++) cardInputs(W, b, W.cards[ids[r]], nw, ctx, undefined, ROW_X, r * NI, ids[r]); // nothing changes while it looks, so all its cards are scored in one batch
  scoreRows(b.g.card, ROW_X, ROW_O, 0, ids.length);
  const sc = ids.map((id, r) => { const pl = W.players[pidOf[id]]; return [pl, ROW_O[r * N3 + 4] + (b._nnAim?.[pl.pos] || 0)]; });
  return sc.filter((x) => x[1] > 0).sort((p, q) => q[1] - p[1]).slice(0, want).map((x) => x[0]);
}
// Attention budget (cfg.attention > 0): each week every neural bot gets K live cards drawn at random (uniformly, or by public
// trade volume), never by its own network or by hidden values; with its holdings and watchlist they are all it looks at.
function attendWeek(W, nn) { W.attDiag = { bots: 0, cards: 0, sampled: 0, watch: 0, live: W._live.length }; W._attCum = null; for (const b of nn) attendBot(W, b); }
function attendBot(W, b) {
  const cfg = W.cfg, live = W._live, N = live.length, K = cfg.attention, mem = cfg.attentionMemory ?? 8;
  let cum = W._attCum; if (cfg.attentionSample === 'volume' && !cum) { cum = W._attCum = new Float64Array(N); let s = 0; for (let i = 0; i < N; i++) cum[i] = s += 1 + recentVol(live[i], 4); }
  const pick = () => { if (!cum) return live[Math.floor(W.rand() * N)]; const r = W.rand() * cum[N - 1]; let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; cum[m] > r ? (hi = m) : (lo = m + 1); } return live[lo]; };
  const w = new Set(); if (b._attTr) for (const [id, t] of [...b._attTr]) W.t - t > mem ? b._attTr.delete(id) : w.add(id); // traded lately
  for (const a of W.auctions) if (a.seller === b) w.add(a.cardId); if (b.owed) for (const id of b.owed.keys()) w.add(id); for (const it of itemsOf(W, b)) w.add(mktId(it.pid, it.d === 4 ? 0 : it.d, it.f));
  const s = new Set(); if (N) { const k = Math.min(K, N); for (let tries = 0; s.size < k && tries < 20 * k; tries++) { const c = pick(); if (!b.h.has(c.id) && !b.notes.has(c.pid) && !w.has(c.id)) s.add(c.id); } }
  b._attW = w; b._attS = s; b._attT = W.t; const A = W.attDiag; if (A) { A.bots++; A.sampled += s.size; A.watch += w.size; }
}
// A bot that arrived after this week's draw (a newcomer or an heir) gets its own draw on first look
const attNow = (W, b) => { if (b._attT !== W.t) attendBot(W, b); };
// Does a neural bot look at this card this week? (always, with no attention budget)
const attends = (W, b, c) => { if (!(W.cfg.attention > 0)) return true; attNow(W, b); return b.h.has(c.id) || b.notes.has(c.pid) || b._attS.has(c.id) || b._attW.has(c.id); };
// The cards a neural bot scores this week: every live card, or (attention budget) its holdings, noted players' live cards, watchlist and sample
function attended(W, b) {
  if (!(W.cfg.attention > 0)) { const cand = new Set(W._live); for (const id of b.h.keys()) cand.add(W.cards[id]); for (const pid of b.notes.keys()) cand.add(W.cards[mktId(pid, 0, 0)]); return cand; }
  attNow(W, b); const cand = new Set(); for (const id of b.h.keys()) cand.add(W.cards[id]);
  for (const pid of b.notes.keys()) { cand.add(W.cards[mktId(pid, 0, 0)]); for (let j = 0; j < 16; j++) { const c = W.cards[pid * 16 + j]; if (c && c.on !== false && c.circ > 0) cand.add(c); } }
  for (const id of b._attW) cand.add(W.cards[id]); for (const id of b._attS) cand.add(W.cards[id]);
  return cand;
}
// Each card's player (fixed), and this week's live cards' ids, read once instead of once per bot
function cardIndex(W) {
  if (!W._cpid || W._cpid.length !== W.cards.length) { const a = (W._cpid = new Int32Array(W.cards.length)); for (const c of W.cards) a[c.id] = c.pid; }
  if (W._liveM !== W._live) { const m = (W._inLive = new Uint8Array(W.cards.length + 1)), l = (W._liveId = new Int32Array(W._live.length)); W._live.forEach((c, i) => { l[i] = c.id; m[c.id] = 1; }); W._liveM = W._live; }
  return W._cpid;
}
// Every live card, then the cards a bot holds or has notes on that aren't live (or missing: -1), each once, in that order
function candidates(W, b) {
  cardIndex(W); const lid = W._liveId, m = W._inLive, ex = new Set(), cand = Array.from(lid), add = (id) => { const c = W.cards[id]; if (c && m[id]) return; const k = c ? id : -1; if (!ex.has(k)) { ex.add(k); cand.push(k); } };
  for (const id of b.h.keys()) add(id); for (const pid of b.notes.keys()) add(mktId(pid, 0, 0));
  return cand;
}
const ROW_OUT = new Float64Array(16);
function nnAct(W, b) {
  const pend = new Map(), g = b.g, nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W);
  const att = W.cfg.attention > 0 ? attended(W, b) : null, cand = att ? Array.from(att, (c) => (c ? c.id : -1)) : candidates(W, b), NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3], CH = 256; if (att && W.attDiag) W.attDiag.cards += att.size;
  const buys = [], D = W.limDiag; let listed = 0, shorts = 0, lBlock = 0, sBlock = 0, oBlock = 0, iBlock = 0;
  // The cards are scored in batches of up to CH. Only a short sale changes what the bot sees of its later cards (its
  // cash), so after one the rest of the batch is scored again from that state: every score is the one it saw before.
  const pidOf = W._cpid, qMax = W.cfg.maxOrderQty ?? 3, S = SNAP; rowBufs(CH); let ci = 0, BX = new Float64Array(64 * NI), nB = 0;
  while (ci < cand.length) {
    let nR = 0, j = ci; for (; j < cand.length && nR < CH; j++) { const id = cand[j]; if (id < 0 || (S && id < S.n ? S.off[id] === 1 : W.players[pidOf[id]].on === false)) continue; const c = W.cards[id]; ROW_C[nR] = c; ROW_I[nR] = j; ROW_ID[nR] = id; cardInputs(W, b, c, nw, ctx, undefined, ROW_X, nR * NI, id); nR++; }
    scoreRows(g.card, ROW_X, ROW_O, 0, nR); ci = j;
    for (let r = 0; r < nR; r++) {
      const c = ROW_C[r], id = ROW_ID[r], o = ROW_OUT; for (let k = 0; k < N3; k++) o[k] = ROW_O[r * N3 + k];
      const q = b.h.get(id) || 0, px = nnPrice(W, b, c, o, undefined, undefined, id), pEdge = NP.edge, pFar = NP.far;
      if (o[0] > 0 && o[0] > o[1]) { if (BX.length < (nB + 1) * NI) { const B2 = new Float64Array(BX.length * 2); B2.set(BX); BX = B2; } BX.set(ROW_X.subarray(r * NI, r * NI + NI), nB * NI); // its inputs, kept in one buffer and copied out only for the orders it places
        buys.push([c, o[0], px, 1 + Math.floor((qMax - 1) * sigm(o[3])), nB++, Math.tanh(o[2]), pEdge, pFar, sigm(o[3]) > 0.95]); }
      else if (q && o[1] > 0) { const x = ROW_X.slice(r * NI, r * NI + NI); (W.offDiag ||= { bid: [], ask: [] }).ask.push(Math.tanh(o[2])); if (D) { D.ask++; if (pEdge) D.askEdge++; if (pFar) D.askFar++; D.qty++; if (sigm(o[3]) > 0.95) D.qtyEdge++; } for (let k = 0; k < Math.min(q, 1 + Math.floor((qMax - 1) * sigm(o[3]))); k++) ask(b, c, px, pend, x); }
      if (q && o[5] > 1 && W.cfg.auctions && (b.h.get(id) || 0) - (pend.get(id) || 0) > 0) { if (listed < (W.cfg.maxListings ?? 1)) { listAuction(W, b, c, nnPrice(W, b, c, o, undefined, undefined, id)); listed++; } else lBlock = 1; }
      if (W.cfg.shorting && !q && o[6] > 0.5 && o[6] > o[0] && (W.lendable?.get(id) || 0) > 0) { if (shorts < (W.cfg.maxShorts ?? 3)) { if (borrowCard(W, b, c)) { ask(b, c, px, pend); shorts++; ci = ROW_I[r] + 1; break; } } else sBlock = 1; }
    }
  }
  let spare = b.cash - g.keep * nw, n = 0;
  for (const [c, , px, qn, xi, off, pEdge, pFar, qE] of buys.sort((p, q) => q[1] - p[1])) { if (n >= W.cfg.deployOrders) { if (spare > px) oBlock = 1; break; } const x = BX.slice(xi * NI, xi * NI + NI); if (spare > px) { (W.offDiag ||= { bid: [], ask: [] }).bid.push(off); if (D) { D.bid++; if (pEdge) D.bidEdge++; if (pFar) D.bidFar++; D.qty++; if (qE) D.qtyEdge++; } } for (let k = 0; k < qn && spare > px; k++) { bid(b, c, px, x); spare -= px; } n++; }
  for (const it of itemsOf(W, b)) { const c = W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)], o = cardNet(W, b, c, nw, ctx, it); if (o[1] > 0 && o[5] > 0) { if (listed >= (W.cfg.maxListings ?? 1) + 1) { iBlock = 1; break; } listItem(W, b, it, nnPrice(W, b, c, o, it)); listed++; } }
  let packs = 0, want = 0; for (const [, k] of b._nnPacks || []) want += k;
  for (const [t, k] of b._nnPacks || []) for (let i = 0; i < k && packs < (W.cfg.maxPacks ?? 3); i++, packs++) { const pm = b._nnPackBid?.[t] ?? 1, pp = packInfo(W, t).price * (W.cfg.packSale === 'auction' ? pm : 1); if (!(spare >= pp) || !buyPack(W, b, t, pm)) break; spare -= pp; } // packs spend the same spare cash (above its 'cash target') as its card bids
  if (D) { D.acts++; D.orders += oBlock; D.listings += lBlock; D.items += iBlock; D.shorts += sBlock; if (want > (W.cfg.maxPacks ?? 3)) D.packs++; }
}
// A sealed bid: the card network's view of the card, or of the one-of-a-kind card, in plain-card coins
// A neural bot's price for a card: a base between the current price and its own fresh research estimate (the 'anchor'
// output chooses how far toward the estimate), then moved up to ±priceRange by the 'price offset' output
const NP = { edge: false, far: false }; // the last nnPrice call: at its wall, and beyond the default range's edge (×0.46 or ×1.54); measurement only
function nnPrice(W, b, c, o, it, base0, id) { // id: a plain card cardInputs read this week (its player and premium are in the week's array)
  const k = id != null && !it ? id * CWN : -1, pid = k >= 0 ? W._cw[k] : c.pid, cm = k >= 0 ? W._cw[k + 12] : c.mult;
  const P = base0 ?? (it ? markItem(W, it) : k >= 0 && SNAP && id < SNAP.n ? SNAP.P[id] : c.P), n = b.notes.get(pid), est = fresh(W, n) && n.est > 0 ? n.est * (it ? it.mult : cm) : null;
  let base = P; const pl = W.players[pid];
  if (SHAPE_G && guideOn(W.cfg) && pl?.guide > 0) { const a = sigm(o[8]); base += (pl.guide * (it ? it.mult : cm) - base) * a; const U = (W.guideUse ||= { s: 0, n: 0 }); U.s += a; U.n++; } // first toward the public guide
  if (est != null && W.cfg.priceAnchor !== false) base += (est - base) * sigm(o[7]); // then toward its own research
  if (W.cfg.priceMap === 'log') { const lc = Math.log(W.cfg.priceClamp ?? 50), z = (W.cfg.priceLogK ?? 0.6) * o[2]; NP.edge = Math.abs(z) >= lc; NP.far = z > 0.4318 || z < -0.7765; return base * Math.exp(clamp(z, -lc, lc)); } // ln 1.54 and ln 0.46: the edges of the default range at |tanh| 0.9
  const t = Math.tanh(o[2]); NP.edge = Math.abs(t) > 0.9; NP.far = NP.edge; return base * (1 + (W.cfg.priceRange ?? 0.6) * t);
}
function nnAuctionBid(W, b, c, it, nw, ctx) { if (!attends(W, b, c)) return null; nw ??= Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)); ctx ??= marketCtx(W); const o = cardNet(W, b, c, nw, ctx, it); return o[0] > 0 && o[0] > o[1] ? nnPrice(W, b, c, o, null, c.P) : null; }
// What the population learned: how much each input moves "buy minus sell", averaged over sample cards, for the
// richest 10% and for everyone (finite differences on each bot's own card network)
export function nnSensitivity(W, k = 24) {
  const nn = W.bots.filter((b) => b.g?.nn); if (!nn.length || !W._live?.length) return null;
  const top = nn.slice().sort((x, y) => worth(W, y) - worth(W, x)).slice(0, Math.max(1, Math.round(nn.length * 0.1)));
  const cards = Array.from({ length: k }, (_, i) => W._live[Math.floor((i * W._live.length) / k)]), ctx = marketCtx(W);
  const sens = (bots) => { const s = new Float64Array(CARD_IN.length); let m = 0;
    for (const b of bots) { const nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)); for (const c of cards) { const x0 = Float64Array.from(cardInputs(W, b, c, nw, ctx)); const base = forward(CARD_SHAPE, b.g.card, x0, CB); const y0 = base[0] - base[1];
      for (let i = 1; i < x0.length; i++) { const x1 = Float64Array.from(x0); x1[i] += 0.25; const o = forward(CARD_SHAPE, b.g.card, x1, CB); s[i] += (o[0] - o[1] - y0) / 0.25; } m++; } }
    return [...s].map((v) => Math.round((v / Math.max(1, m)) * 100) / 100); };
  const sample = nn.length > 60 ? nn.filter((_, i) => i % Math.ceil(nn.length / 60) === 0) : nn;
  return { inputs: CARD_IN, top: sens(top), all: sens(sample), week: W.t };
}
// Random names: a given name and a surname; an heir keeps the family name
function randomName(W, parent) {
  const N = W.library.names; if (!N) return null;
  const used = W.usedNames ||= new Set(W.bots.map((b) => b.name));
  for (let k = 0; k < 40; k++) { const nm = `${W.pick(N.first)} ${parent?.surname || W.pick(N.last)}`; if (!used.has(nm)) { used.add(nm); return nm; } }
  const base = `${W.pick(N.first)} ${parent?.surname || W.pick(N.last)}`; let i = 2; while (used.has(`${base} ${ROMAN[i] || i}`)) i++; const nm = `${base} ${ROMAN[i] || i}`; used.add(nm); return nm;
}

/* ---------- Credit between bots ---------- */
// There is no bank. Bots with idle cash offer loans at the rate they ask; bots with an appetite for leverage request
// them up to the most they will pay. Offers and requests clear once a week at one rate. Loans are secured by the
// borrower's cards: past the margin line the borrower must sell; at maturity it must repay or sell; an insolvent
// borrower defaults and its lenders lose what can't be recovered. No coins are created: credit only moves them.
function holdingsValue(W, b) { let v = 0; for (const [id, q] of b.h) v += q * W.cards[id].P; for (const uid of b.items || []) { const it = W.items.get(uid); if (it) v += markItem(W, it) * 0.9; } return v; }
function repayLoan(W, L, amt) { const x = Math.min(amt, L.amount); L.amount -= x; L.borrower.debt -= x; L.borrower.cash -= x; L.lender.cash += x; L.lender.lent -= x; return x; }
function creditMarket(W) {
  const cfg = W.cfg, C = (W.credit ||= {}); Object.assign(C, { lent: 0, repaid: 0, repaidForced: 0, offered: 0, asked: 0, calls: 0, defaults: 0, writtenOff: 0, rate: C.rate ?? null });
  if (!cfg.credit) return;
  const bot = new Set(W.bots); W.loans = (W.loans || []).filter((L) => L.amount > 0.01 && bot.has(L.borrower) && bot.has(L.lender));
  // Interest, maturity
  for (const L of W.loans) {
    const i = L.amount * L.rate, b = L.borrower;
    if (b.cash >= i) { b.cash -= i; L.lender.cash += i; } else { L.amount += i - b.cash; b.debt += i - b.cash; L.lender.lent += i - b.cash; L.lender.cash += b.cash; b.cash = 0; }
    if (L.due <= W.t) { const paid = repayLoan(W, L, b.cash); C.repaid += paid; if (L.amount > 0.01) { forceSale(b, 'loan default', L.amount / (W.cfg.forcedSale === 'discount' ? 0.88 : 1)); L.due = W.t + 1; L.late = (L.late || 0) + 1; } }
  }
  // Margin calls and defaults
  for (const b of W.bots) {
    if (!(b.debt > 0)) continue;
    const hv = holdingsValue(W, b);
    if (b.debt > b.cash + hv || W.loans.some((L) => L.borrower === b && L.late >= 3)) { // default: lenders recover the cash, lose the rest
      const mine = W.loans.filter((L) => L.borrower === b), tot = mine.reduce((s, L) => s + L.amount, 0);
      for (const L of mine) { const rec = tot ? (b.cash * L.amount) / tot : 0; L.lender.cash += rec; L.lender.lent -= L.amount; C.writtenOff += L.amount - rec; L.amount = 0; }
      for (const [id, q] of b.h) toLiq(W, id, q);
      for (const uid of b.items || []) { const it = W.items.get(uid); if (it) { it.owner = null; W.liqItems.push(uid); } } b.items = new Set();
      b.h.clear(); b.n = 0; b.lots = new Map(); b.cash = 0; b.debt = 0; C.defaults++; jot(W, { type: 'default', bot: b.name, debt: r2(tot) }); continue;
    }
    if (b.debt > cfg.marginCall * hv) { forceSale(b, 'margin call', (b.debt - cfg.maxLTV * hv) / (cfg.forcedSale === 'discount' ? 0.88 : 1)); C.calls++; if (!b.calledAt || W.t - b.calledAt > 8) { b.calledAt = W.t; jot(W, { type: 'marginCall', bot: b.name, debt: r2(b.debt), cards: r2(hv) }); } }
  }
  // New loans: one weekly call auction for credit
  const offers = [], asks2 = [];
  for (const b of W.bots) {
    const hv = holdingsValue(W, b), eq = b.cash + hv + (b.lent || 0) - b.debt;
    if (b.kind === 'ai') {
      const o = b.pending?.lend; if (o && Number(o.amount) > 0) offers.push({ b, amt: Math.min(Number(o.amount), b.cash), rate: Math.max(0, Number(o.rate) || 0) });
      const q = b.pending?.borrowReq; if (q && Number(q.amount) > 0) asks2.push({ b, amt: Math.min(Number(q.amount), Math.max(0, cfg.maxLTV * hv - b.debt)), rate: Math.max(0, Number(q.maxRate) || 0) });
      continue;
    }
    const idle = b.cash - b.g.keep * Math.max(0, eq); if (b.g.lendShare > 0 && idle > 10 * W.cfg.coinScale) offers.push({ b, amt: idle * b.g.lendShare, rate: b.g.lendRate });
    const want = Math.min(b.g.lev * Math.max(0, eq), cfg.maxLTV * hv) - b.debt; if (b.g.lev > 0 && want > 5 * W.cfg.coinScale) asks2.push({ b, amt: want, rate: b.g.maxRate });
  }
  C.offered = offers.reduce((a, o) => a + o.amt, 0); C.asked = asks2.reduce((a, o) => a + o.amt, 0);
  asks2.sort((x, y) => y.rate - x.rate); offers.sort((x, y) => x.rate - y.rate);
  const fills = []; let i = 0, j = 0;
  while (i < asks2.length && j < offers.length && asks2[i].rate >= offers[j].rate) {
    if (asks2[i].b === offers[j].b) { j++; continue; }
    if (blocked(asks2[i].b, offers[j].b)) { let k = j + 1; while (k < offers.length && offers[k].rate <= asks2[i].rate && (blocked(asks2[i].b, offers[k].b) || asks2[i].b === offers[k].b)) k++; if (k < offers.length && offers[k].rate <= asks2[i].rate) [offers[j], offers[k]] = [offers[k], offers[j]]; else { i++; continue; } }
    const x = Math.min(asks2[i].amt, offers[j].amt); if (x > 0.5) fills.push([asks2[i], offers[j], x]);
    asks2[i].amt -= x; offers[j].amt -= x; if (asks2[i].amt <= 0.5) i++; if (offers[j].amt <= 0.5) j++;
  }
  if (fills.length) {
    const [lb, lo] = fills[fills.length - 1], rate = (lb.rate + lo.rate) / 2; C.rate = rate;
    for (const [rq, of, x] of fills) { const amt = Math.min(x, of.b.cash); if (amt <= 0.5) continue; of.b.cash -= amt; of.b.lent = (of.b.lent || 0) + amt; rq.b.cash += amt; rq.b.debt += amt; tkAdd(W, of.b, 'lend', amt); tkAdd(W, rq.b, 'borrow', amt); W.loans.push({ lender: of.b, borrower: rq.b, amount: amt, rate, due: W.t + cfg.loanWeeks }); C.lent += amt; jot(W, { type: 'loan', lender: of.b.name, borrower: rq.b.name, amount: r2(amt), rate: Math.round(rate * 10000) / 10000 }); }
  }
  if (C.defaults >= 2) log(W, 'margin', `${C.defaults} bots default: their lenders lose ${Math.round(C.writtenOff).toLocaleString()} coins and the cards are dumped.`);
  if (C.calls >= 5) log(W, 'margin', `Margin calls: ${C.calls} borrowers are forced to sell cards at a discount.`);
}
// Living costs are a law of the world: every bot pays to stay in the market, richer bots more
function livingAndCredit(W) {
  const cfg = W.cfg; W.living = { spent: 0, broke: 0 };
  for (const b of W.bots) {
    b.forced = 0; b.forcedBy = {};
    const eq = b.cash + holdingsValue(W, b) + (b.lent || 0) - b.debt, cost = cfg.livingCost + cfg.lifestyle * Math.max(0, eq);
    const paidC = Math.min(cost, Math.max(0, b.cash)); b.exo = (b.exo || 0) - paidC;
    { const paidL = Math.min(cost, Math.max(0, b.cash)); (W.house.mint ||= {}).living = (W.house.mint.living || 0) + paidL; }
    if (b.cash >= cost) { b.cash -= cost; W.living.spent += cost; } else { W.living.spent += Math.max(0, b.cash); forceSale(b, 'living costs', cost - Math.max(0, b.cash)); b.cash = 0; W.living.broke++; }
  }
  creditMarket(W);
  // AI repayments
  for (const b of W.bots) { const r = Number(b.pending?.repay) || 0; if (b.kind === 'ai' && r > 0) for (const L of W.loans.filter((L) => L.borrower === b)) repayLoan(W, L, Math.min(r, b.cash)); }
}
export function totalDebt(W) { return W.bots.reduce((s, b) => s + (b.debt || 0), 0); }
// The population's genome, one vote per bot: what selection and inheritance are spreading
function genomeMix(W) {
  const rule = W.bots.filter((b) => b.kind === 'rule'), ws = rule.map(() => 1), tot = ws.length || 1; // every bot counts once: genes spread by being copied, not by wealth
  const out = SIGNALS.map((k) => rule.reduce((s, b, i) => s + b.g.w[k] * ws[i], 0) / tot);
  out.push(rule.reduce((s, b, i) => s + Math.min(2, b.g.lev) * ws[i], 0) / tot, rule.reduce((s, b, i) => s + b.g.lendShare * ws[i], 0) / tot);
  return out.map((x) => Math.round(x * 1000) / 1000);
}

/* ---------- AI bots: apply their parsed actions ---------- */
// actions: { research: [playerKey], orders: [{player, side, price, qty}], packs, passOrders: [{side, price, qty}],
//            notes: [{player, estimate}], share: [botName], steal: botName|null, acceptShares: [botName] | 'all', memo }
export function setActions(W, b, a = {}) {
  const byName = (n) => W.bots.find((x) => x.name === n);
  b.pending = {
    research: Array.isArray(a.research) ? a.research.slice(0, W.cfg.maxResearchPerWeek) : [],
    orders: Array.isArray(a.orders) ? a.orders.slice(0, 30) : [],
    packs: Array.isArray(a.packs) ? a.packs.filter((x) => PACK_TYPES[x?.type]).map((x) => ({ type: x.type, count: clamp(Math.floor(Number(x.count) || 0), 0, 5), ...(Number(x.price) > 0 ? { price: Number(x.price) } : {}) })).slice(0, 4) : [{ type: 'standard', count: clamp(Math.floor(Number(a.packs) || 0), 0, 5) }],
    passOrders: Array.isArray(a.passOrders) ? a.passOrders.slice(0, 4) : [],
    ticketOrders: Array.isArray(a.ticketOrders) ? a.ticketOrders.slice(0, 4) : [],
    auction: Array.isArray(a.auction) ? a.auction.slice(0, 2) : [],
    auctionBids: Array.isArray(a.auctionBids) ? a.auctionBids.slice(0, 10) : [],
    short: Array.isArray(a.short) ? a.short.slice(0, 3) : [],
    lendCards: clamp(Number(a.lendCards) || 0, 0, 1),
  };
  // Credit between bots: offer a loan, request one, or repay
  b.pending.lend = a.lend && typeof a.lend === 'object' ? a.lend : null;
  b.pending.borrowReq = a.borrow && typeof a.borrow === 'object' ? a.borrow : null;
  b.pending.repay = Number(a.repay) || 0;
  jot(W, { t: W.t + 1, type: 'aiActions', bot: b.name, actions: a });
  if (W.cfg.messages) {
    const lim = W.cfg.messageLimits, cut = (x) => String(x ?? '').slice(0, lim.chars).trim();
    const post = cut(a.post);
    if (post) { W.board.push({ t: W.t + 1, from: b.name, text: post }); if (W.board.length > 40) W.board.shift(); jot(W, { t: W.t + 1, type: 'post', from: b.name, text: post }); }
    for (const m of (Array.isArray(a.messages) ? a.messages : []).slice(0, lim.direct)) {
      const to = byName(m?.to), text = cut(m?.text);
      if (!to || to === b || !text) continue;
      (to.mailbox ||= []).push({ t: W.t + 1, from: b.name, text });
      jot(W, { t: W.t + 1, type: 'message', from: b.name, to: to.name, text });
    }
  }
  const acc = Array.isArray(a.acceptShares) ? a.acceptShares : a.acceptShares === 'all' ? ['all'] : [];
  b.pendingShares = acc.map(byName).filter(Boolean).map((x) => x.id);
  b.acceptAll = acc.includes('all');
  for (const n of Array.isArray(a.notes) ? a.notes.slice(0, 12) : []) { const c = W.mktByKey.get(n.player) || resolvePlayer(W, n.player); const e = Number(n.estimate); if (c && e > 0) writeNote(W, b, c, e, 'own analysis', n.facts); }
  b.marketPage = Math.max(0, Math.floor(Number(a.marketPage) || 0)); // which page of the most-traded list it sees next week
  b.gameAnswers = Array.isArray(a.games) ? a.games.slice(0, W.cfg.maxGamesPerWeek) : [];
  b.socialOut = { share: (Array.isArray(a.share) ? a.share.slice(0, 2) : []).map(byName).filter(Boolean), steal: a.steal ? byName(a.steal) : null };
  if (typeof a.memo === 'string') b.memo = a.memo.slice(0, 600);
}
function aiSocial(W) {
  for (const b of W.bots) {
    if (b.kind !== 'ai' || !b.socialOut) continue;
    for (const p of b.socialOut.share) {
      if (b.flags.has(p.id) || p.flags.has(b.id)) continue;
      if (willing(W, p, b)) swap(W, b, p); // the partner accepts through its own decision-maker
    }
    if (b.socialOut.steal && W.cfg.stealing) b.lastSteal = steal(W, b, b.socialOut.steal);
    b.socialOut = null;
  }
}
function aiOrders(W, b) {
  const pend = new Map(), p = b.pending || {};
  // a pack bid at its own price (bounded only by its cash), or the last clearing price when it names none
  let nPacks = 0; for (const x of p.packs || []) { const last = packInfo(W, x.type).price, m = x.price > 0 && last > 0 ? x.price / last : 1; for (let k = 0; k < x.count && nPacks < 5; k++, nPacks++) if (!buyPack(W, b, x.type, m)) break; }
  for (const o of p.orders || []) {
    const c = resolveMarket(W, o.player); const price = Number(o.price);
    if (!c || !(price > 0)) continue;
    for (let k = 0; k < clamp(Math.floor(Number(o.qty) || 1), 1, 5); k++) o.side === 'sell' ? ask(b, c, price, pend) : bid(b, c, price);
  }
}

/* ---------- One week ---------- */
export function step(W) {
  const cfg = W.cfg;
  W.t++; packCache = null; W_ = W; useShape(W); SNAP = null; W.shockWeek = 0; W.aucWeek = 0; W.aucStats = { sold: 0, coins: 0, free: 0, vs: [] };
  for (const p of W.players) p.Fpub = p.F; // last week's value: what the public (and the value collectors) know this week
  W.guideUse = { s: 0, n: 0 }; W.offDiag = { bid: [], ask: [] }; W.limDiag = { bots: 0, keep: 0, lendRate: 0, maxRate: 0, lendOver: 0, maxOver: 0, lendShare: 0, lev: 0, packBid: 0, packBidEdge: 0, acts: 0, orders: 0, listings: 0, items: 0, shorts: 0, packs: 0, bid: 0, bidEdge: 0, bidFar: 0, ask: 0, askEdge: 0, askFar: 0, qty: 0, qtyEdge: 0 };
  if (guideOn(cfg)) priceGuide(W);
  if (W.timeline && W.t % cfg.seasonWeeks === 0) nextSeason(W);
  if (cfg.lossRate > 0 && W.t % cfg.seasonWeeks === 0) { // card loss: each copy in a bot's hands (not lent out) is lost with chance lossRate, never picked by value
    let lost = 0; for (const b of W.bots) for (const [id, q] of [...b.h]) { const free = q - (b.lentOut?.get(id) || 0); let k = 0; for (let j = 0; j < free; j++) if (W.rand() < cfg.lossRate) k++;
      if (k) { const c = W.cards[id]; give(b, c, -k); c.circ = Math.max(0, c.circ - k); const L = b.lots?.get(id); if (L) L.splice(0, k); lost += k; } }
    W.lostSeason = lost; if (lost) jot(W, { type: 'lost', count: lost }); (W.house.mint ||= {}).lostCards = (W.house.mint.lostCards || 0) + lost; }
  if (cfg.valueModel === 'league') { // the simulated league takes over after the last real season
    if (!W.L && W.timeline && W.seasonIx >= W.timeline.seasons.length - 1) leagueStart(W);
    if (W.L) { if (W.t % cfg.seasonWeeks === 0 && W.seasonIx >= W.timeline.seasons.length) leagueSeasonEnd(W); leagueWeek(W); leagueValues(W); }
  } else if (cfg.valueModel === 'ovrWalk') ovrWalk(W); else if (cfg.valueModel === 'factors') factorValues(W);
  if (cfg.royalties && !cfg.priceOnly && cfg.royaltyEvery !== 'generation') payRoyalties(W, 1 / cfg.weeksPerGeneration);
  W.flow = { net: GROUPS.map(() => 0), realized: GROUPS.map(() => 0), trips: GROUPS.map(() => 0), tax: 0, paidOut: 0 };
  assignGroups(W);
  W.week = { shares: 0, thefts: 0, caught: 0, researched: new Map() };
  W.ord = { bids: 0, asks: 0, pullUp: 0, pullDown: 0, coins: 0, minted: 0, packs: W.house.packs };
  W.journal = W.journal.filter((j) => j.t === W.t); // keep this week's decisions, logged before the week ran
  for (const b of W.bots) {
    b.passes = b.passes.filter((e) => e > W.t); for (let k = 0; k < cfg.passesPerWeek; k++) b.passes.push(W.t + cfg.passLife);
    b.tickets = b.tickets.filter((e) => e > W.t); if (cfg.games) for (let k = 0; k < cfg.gameTickets; k++) b.tickets.push(W.t + cfg.ticketLife);
    b.inbox = [];
  }
  // Allowance: printed each week, or (closed economy) paid out of the treasury, at most half of it a week
  const lastBub = W.hist.bub[W.hist.bub.length - 1] ?? 1;
  W.bankRate = cfg.centralBank ? clamp(1 + cfg.bankGain * (cfg.bankTarget - lastBub), 0, 4) : 1;
  const want = cfg.allowance * (W.fillK ?? 1) / (W.botK ?? 1) * W.bots.length * W.bankRate, pay = cfg.closedEconomy ? Math.min(want, W.treasury) : want;
  if (cfg.closedEconomy) W.treasury -= pay; else W.treasury = 0; // without a closed economy, the house's takings leave circulation
  for (const b of W.bots) { b.cash += pay / W.bots.length; b.exo = (b.exo || 0) + pay / W.bots.length; } (W.house.mint ||= {}).allowance = (W.house.mint.allowance || 0) + pay;
  W.flow.paidOut = pay;
  if (cfg.wealthTax > 0 && W.t % 4 === 0) {
    const ws = W.bots.map((b) => [b, worth(W, b)]), med = ws.map((x) => x[1]).sort((a, b) => a - b)[Math.floor(ws.length / 2)] || 0;
    for (const [b, w] of ws) { if (w <= med * 2) continue; const full = (w - med * 2) * cfg.wealthTax * 4, t = Math.min(Math.max(0, b.cash), full); b.cash -= t; if (cfg.wealthTaxTo === 'house') W.treasury += t; else W.taxPot = (W.taxPot || 0) + t; W.flow.tax += t; flowOut(W, b, t); (W.house.mint ||= {}).wealthTax = (W.house.mint.wealthTax || 0) + t; if (cfg.wealthTaxForced && full > t) forceSale(b, 'wealth tax', full - t); }
    if (W.taxPot > 0 && cfg.wealthTaxTo !== 'house') { // paid back out: to every bot equally, or to the bots below the median worth
      const to = cfg.wealthTaxTo === 'belowMedian' ? ws.filter(([, w]) => w < med).map(([b]) => b) : W.bots; const each = to.length ? W.taxPot / to.length : 0;
      for (const b of to) { b.cash += each; flowIn(W, b, each); } (W.house.mint ||= {}).taxBack = (W.house.mint.taxBack || 0) + W.taxPot; W.taxPot = 0; }
  }
  if (cfg.leagueUpdates && W.t % cfg.updateEvery === 0) leagueUpdate(W);
  { const ph = W.hist.p, peak = Math.max(...ph.slice(-8)); mood.drop = ph.length ? 1 - ph[ph.length - 1] / peak : 0; }
  if (W.fullL) dormancy(W);
  W._live = W.cards.filter((c) => c.on !== false && c.circ > 0);
  { const hw = cfg.hotWeeks ?? 20, mo = cfg.hotRank === 'momentum', hs = (c) => recentVol(c, hw) * (mo ? Math.max(0.2, 1 + ret(c, 4)) : 1); hot = W._live.slice().sort((x, y) => hs(y) - hs(x)); } // the most-traded list (hotRank)
  for (const b of W.bots) if (b.kind === 'rule') b.a = styleOf(b.g.w); // a style is just the dominant weight, which mutation can change
  { const nn = W.bots.filter((b) => b.g?.nn); if (nn.length) { const ws = nn.map((b) => worth(W, b)).sort((x, y) => x - y), med = ws[Math.floor(ws.length / 2)]; for (const b of nn) nnThink(W, b, med); if (cfg.attention > 0) attendWeek(W, nn); } }
  livingAndCredit(W); peopleChange(W); fashionStep(W);
  if (cfg.holdCost > 0) for (const b of W.bots) { // a cost per card held, a share of its mark a week, to the house: a cash squeeze shows up as selling
    let cost = 0; for (const [id, q] of b.h) cost += q * W.cards[id].P * cfg.holdCost; if (!(cost > 0)) continue;
    const paidH = Math.min(cost, Math.max(0, b.cash)); b.cash -= paidH; W.treasury += paidH; (W.house.mint ||= {}).holding = (W.house.mint.holding || 0) + paidH; if (cost > paidH) forceSale(b, 'holding costs', cost - paidH); }
  { const ch = cfg.cashShockChance ?? cfg.cashShocks?.chance ?? 0, sz = cfg.cashShockSize ?? cfg.cashShocks?.size ?? 0; if (ch > 0 && sz > 0) for (const b of W.bots) { if (!(W.rand() < ch)) continue; // a life event: a need for cash that doesn't come from the market
    const need = sz * Math.max(0, worth(W, b)), paidS = Math.min(need, Math.max(0, b.cash)); b.cash -= paidS; (W.house.mint ||= {}).shocks = (W.house.mint.shocks || 0) + paidS; if (need > paidS) forceSale(b, 'cash shock', need - paidS); jot(W, { type: 'shock', bot: b.name, need: r2(need), short: r2(need - paidS) }); (W.shockWeek ||= 0); W.shockWeek++; } }
  liftFlags(W);
  socialPhase(W); aiSocial(W);
  passPhase(W);
  if (cfg.games) { tokenMarket(W, 'ticket'); gamePhase(W); }
  auctionPhase(W);
  bids = W.cards.map(() => []); asks = W.cards.map(() => []);
  if (cfg.shorting) shortUpkeep(W);
  const order = W.bots.slice().sort(() => W.rand() - 0.5);
  { const S = (SNAP = snapCards(W)); for (const b of order) b.kind === 'ai' ? aiOrders(W, b) : b.g.nn ? nnAct(W, b) : act(W, b); endSnap(W, S); }
  if (cfg.packSale === 'auction') packAuction(W);
  if (cfg.outsideCollectors && cfg.outsideMode === 'band') for (const c of W.cards) { if (c.on === false) continue; const fx = W.fashion ? W.fashion[c.fam] || 0 : 0; if (W.rand() < 0.05 * Math.exp(fx)) (c.dorm && wakePlayer(W, W.players[c.pid]), bids[c.id]).push({ b: null, p: c.F * lerp(0.85, 1.08, W.rand()) * Math.exp(0.5 * fx) }); }
  if (cfg.liquidation !== 'auction') for (const [id, q] of W.liq) { const p = cfg.liquidation === 'chase' ? W.cards[id].P * 0.8 : liqAsk(W, id); for (let k = 0; k < Math.min(q, 4); k++) asks[id].push({ b: 'liq', p }); }
  // Forced sellers (margin calls, bills they can't pay) dump cards at a discount
  if (cfg.forcedSale === 'discount') for (const b of W.bots) if (b.forced > 0) { const pend = new Map(); let need = b.forced; for (const id of [...b.h.keys()].sort((x, y) => W.cards[y].P - W.cards[x].P)) { if (need <= 0) break; const c = W.cards[id]; const q = b.h.get(id); for (let k = 0; k < q && need > 0; k++) { ask(b, c, c.P * 0.88, pend); need -= c.P * 0.88; } }
    for (const uid of [...(b.items || [])]) { if (need <= 0) break; const it = W.items.get(uid); if (!it) continue; const r = markItem(W, it) * 0.7; if (listItem(W, b, it, r)) need -= r; } }
  clear(W);
  if (cfg.outsideCollectors && cfg.outsideMode === 'value') valueCollectors(W); else if (cfg.outsideCollectors && cfg.outsideMode === 'budget') outsideFlow(W);
  if (cfg.forcedSale !== 'discount') forcedSales(W);
  if (cfg.shorting || W.cardLoans?.length) settleShorts(W);
  liqCut(W);
  repayForced(W);
  for (const b of W.bots) { b.nwh.push(worth(W, b)); (b.exoh ||= []).push(b.exo || 0); if (b.nwh.length > 12) b.nwh.shift(); if (b.exoh.length > 12) b.exoh.shift(); b.pending = null; b.pendingShares = []; b.acceptAll = false; }
  detect(W);
  adaptStep(W);
  if (W.t % cfg.weeksPerGeneration === 0) generationEnd(W);
  for (const b of W.bots.slice()) if (b.kind === 'ai' && b.lifespanW && W.t - b.born >= b.lifespanW) aiSuccession(W, b);
  record(W);
}
// What its forced sales raised this week for a margin call or a loan default goes to its lenders; proceeds raised for other
// causes (living costs, holding costs, taxes, shocks) and the rest of its cash stay its own (repaying early is its choice)
function repayForced(W) {
  const cfg = W.cfg;
  for (const b of W.bots) if (b.forced > 0) { if (b.debt > 0) { const by = b.forcedBy || {}, sh = ((by['margin call'] || 0) + (by['loan default'] || 0)) / b.forced; let left = Math.min(b.cash, cfg.forcedSale === 'discount' ? b.cash : (b._fsRaised || 0) * sh); // (the legacy 'discount' sale keeps the old sweep)
    for (const L of (W.loans || []).filter((L) => L.borrower === b)) { if (left <= 0) break; const x = repayLoan(W, L, left); left -= x; W.credit.repaidForced = (W.credit.repaidForced || 0) + x; } } b.forced = 0; b.forcedBy = {}; b._fsRaised = 0; }
}
// One copy changes hands at a price outside the weekly cross (outside collectors, forced sellers hitting bids)
// A card traded at this price: remember it (for comparable-sales marks), and pair it with the card's previous trade (for
// the repeat-sales Vault index). A card's opening price counts as its first trade.
// Comparable sales: a player's 16 card markets differ only by their rarity multiplier, so a trade in any of them is news
// about all of them. A market that didn't trade this week is marked at the median of the player's trades in the last
// compsWeeks weeks (each brought back to a base card by its multiplier), times its own multiplier. A market that traded
// keeps its own price; a player none of whose cards traded keeps his old marks.
function compsMark(W) {
  const k = W.cfg.compsWeeks ?? 4;
  for (const p of W.players) { if (p.dorm) continue;
    const base = []; for (let j = 0; j < 16; j++) { const m = W.cards[p.id * 16 + j]; const tradeT = m.lastTradeT ?? -1, bookT = m.bookT ?? -1; if (bookT > tradeT && W.t - bookT < k) base.push(m.bookP / m.mult); else if (tradeT > 0 && W.t - tradeT < k) base.push(m.lastTradeP / m.mult); }
    if (!base.length) continue; base.sort((a, b) => a - b); const med = base.length % 2 ? base[base.length >> 1] : (base[base.length / 2 - 1] + base[base.length / 2]) / 2;
    for (let j = 0; j < 16; j++) { const m = W.cards[p.id * 16 + j]; if (m.lastTradeT === W.t) continue; m.P = med * m.mult; if (m.Ph.length) m.Ph[m.Ph.length - 1] = m.P; }
  }
}
// Why a neural bot made a trade: the card-network input that pushed hardest toward it (setting that input to zero lowers
// "buy minus sell", or "sell minus buy", the most). Worked out only for orders that filled.
function tradeWhy(b, x, side) {
  if (!x || !b?.g?.nn) return null;
  const score = (v) => { const o = forward(CARD_SHAPE, b.g.card, v, CB); return side === 'buy' ? o[0] - o[1] : o[1] - o[0]; };
  const base = score(x), v = Float64Array.from(x); let best = -Infinity, at = -1;
  for (let i = 1; i < x.length; i++) { if (x[i] === 0) continue; const keep = v[i]; v[i] = 0; const d = base - score(v); v[i] = keep; if (d > best) { best = d; at = i; } }
  return at > 0 ? CARD_IN[at] : null;
}
function noteWhy(W, j, bd, ak) {
  const wb = bd ? tradeWhy(bd.b, bd.x, 'buy') : null, ws = ak ? tradeWhy(ak.b, ak.x, 'sell') : null; const w = (W.whyWeek ||= { buy: {}, sell: {} });
  if (wb) { j.buyerWhy = wb; w.buy[wb] = (w.buy[wb] || 0) + 1; } if (ws) { j.sellerWhy = ws; w.sell[ws] = (w.sell[ws] || 0) + 1; }
}
// Repeat-sales pairs come from one chain per kind of sale (kind 0: order-book and dealer trades; 1: sealed-auction sales),
// since the two clear at different levels (auction sales ran a median ~40% above trades of the same card). Mixing them
// made the index drift up on flat prices: rises came as trade→auction pairs over longer gaps, falls as auction→trade
// pairs a week later, and least squares gives long-gap pairs more weight. Within a chain the first sale of a week is
// paired with the chain's last sale of an earlier week (at most 52 weeks back); a card's opening price starts chain 0.
function noteTrade(W, c, price, kind = 0) {
  const R = (c.rs ||= [{ t0: null, p0: null, wt: 0, wp: c.P0 }, { t0: null, p0: null, wt: null, wp: null }]), r = R[kind];
  if (r.wt !== W.t) { if (r.wt != null) { r.t0 = r.wt; r.p0 = r.wp; } if (r.t0 != null && W.t - r.t0 <= 52 && r.p0 > 0 && price > 0) (W.rsPairs ||= []).push([r.t0, Math.log(price / r.p0)]); r.wt = W.t; r.wp = price; } else r.wp = price;
  if (c.lastTradeT !== W.t) { c.lastTradeT = W.t; c.lastTradeP = price; } else c.lastTradeP = price;
}
// A forced sale is owed: remember why (margin call, loan default, living costs, holding costs, wealth tax, estate, cash shock)
function attTraded(W, c, ...xs) { for (const x of xs) if (x && typeof x === 'object' && x.g?.nn) (x._attTr ||= new Map()).set(c.id, W.t); } // the watchlist's "traded lately"
function forceSale(b, cause, amount) { if (!(amount > 0)) return; if (b._tk) b._tk.forced += amount; b.forced = (b.forced || 0) + amount; (b.forcedBy ||= {})[cause] = (b.forcedBy[cause] || 0) + amount; }
function xfer(W, c, buyer, seller, price, bd = null, ak = null) {
  const cfg = W.cfg;
  if (buyer !== 'out' && buyer && buyer.cash < price) return false;
  if (buyer !== 'out' && (seller === 'out' || seller === 'liq' || seller === 'store')) { const m = (W.house.mint ||= {}); m.outsideOut = (m.outsideOut || 0) + price; if (seller !== 'out') m[seller === 'liq' ? 'liqOut' : 'storeOut'] = (m[seller === 'liq' ? 'liqOut' : 'storeOut'] || 0) + price; } // a bot pays someone outside the economy (the ledger splits the liquidator and the Vault store out)
  if (buyer && buyer !== 'out' && buyer.cash < price) return false;
  if (seller === 'out') { const q = W.outside.get(c.id) || 0; if (!q) return false; q > 1 ? W.outside.set(c.id, q - 1) : W.outside.delete(c.id); c.circ++; W.house.outside -= price; }
  else if (seller === 'liq') { const q = W.liq.get(c.id) || 0; if (!q) return false; q > 1 ? W.liq.set(c.id, q - 1) : (W.liq.delete(c.id), W.liqPrice?.delete(c.id)); (W.liqSold ||= new Set()).add(c.id); }
  else if (seller === 'store') { if (c.pool < 1) return false; c.pool--; c.circ++; W.house.store = (W.house.store || 0) + price; W.treasury += price; packCache = null; }
  else { if ((seller.h.get(c.id) || 0) < 1) return false; give(seller, c, -1); seller.cash += price * (1 - cfg.fee); W.house.fees += price * cfg.fee; W.treasury += price * cfg.fee; flowIn(W, seller, price * (1 - cfg.fee)); sellLot(W, seller, c, price * (1 - cfg.fee)); }
  if (buyer === 'out') { W.outside.set(c.id, (W.outside.get(c.id) || 0) + 1); c.circ--; W.house.outside += price; (W.house.mint ||= {}).outsideIn = (W.house.mint.outsideIn || 0) + price * (seller === 'liq' || seller === 'store' ? 0 : 1); }
  else { buyer.cash -= price; give(buyer, c, 1); flowOut(W, buyer, price); addLot(buyer, c, price, W.t); }
  tkTrade(W, buyer, seller, c, price, c.P, 'x'); if (cfg.attention > 0) attTraded(W, c, buyer, seller);
  c.P = price; noteTrade(W, c, price); if (c.Ph.length) c.Ph[c.Ph.length - 1] = price; if (c.volH.length) c.volH[c.volH.length - 1]++; W.lastTrades = (W.lastTrades || 0) + 1; if (W.ord) W.ord.coins += price;
  { const j = { type: 'trade', card: c.key, price: r2(price), buyer: buyer === 'out' ? 'outside collector' : buyer.name, seller: seller === 'out' ? 'outside collector' : seller === 'liq' ? 'liquidator' : seller === 'store' ? 'Vault store' : seller.name }; noteWhy(W, j, bd, ak); jot(W, j); }
  return true;
}
const leftBids = (c) => (bids[c.id] || []).filter((o) => !o.used && o.b && o.b !== 'liq').sort((x, y) => y.p - x.p);
const leftAsks = (c) => (asks[c.id] || []).filter((o) => !o.used).sort((x, y) => x.p - y.p);
// 1. Outside collectors: a budget of coins, spread by real popularity, buys the lowest asks; a share of what they hold
// goes back into the best bids. They never name a price.
function outsideFlow(W) {
  const cfg = W.cfg, out = (W.outside ||= new Map()), news = cfg.outsideNews !== false; // outsideNews: budget follows the public news too (an assumption, not measured)
  const pops = W.players.filter((p) => p.on !== false).map((p) => [p, Math.max(0, W.era?.[p.id]?.legacy ?? W.library.players[p.id].careerLegacy ?? 0) * (news && p.lg?.active ? Math.max(0, p.lg.formRatio ?? 1) : 1)]);
  const tot = pops.reduce((a, x) => a + x[1], 0) || 1; let spent = 0;
  for (const [p, w] of pops) {
    const share = (cfg.outsideBudget * (W.fillK ?? 1) * w) / tot, save = (W.outsideSave ||= new Map()); let coins = Math.min(4 * share, (save.get(p.id) || 0) + share); if (coins <= 0) continue; // unspent money waits, up to 4 weeks' worth
    const book = []; for (let j = 0; j < 16; j++) { const c = W.cards[p.id * 16 + j]; for (const o of leftAsks(c)) book.push([c, o]); }
    book.sort((x, y) => x[1].p - y[1].p);
    for (const [c, o] of book) { if (o.p > coins) break; if (xfer(W, c, 'out', o.b, o.p, null, o)) { o.used = true; coins -= o.p; spent += o.p; } }
    save.set(p.id, coins);
  }
  let sold = 0;
  for (const [id, q] of [...out]) {
    const want = q * cfg.outsideResale, k = Math.floor(want) + (W.rand() < want - Math.floor(want) ? 1 : 0), c = W.cards[id];
    for (const o of leftBids(c).slice(0, k)) if (xfer(W, c, o.b, 'out', o.p, o)) { o.used = true; sold++; }
  }
  W.outsideWeek = { spent: Math.round(spent), resold: sold, held: [...out.values()].reduce((a, b) => a + b, 0) };
}
// Value collectors (outsideMode 'value', the default): `collectors` outside dealers who know last week's value from the
// site formula (never this week's, so a bot that reads the news can be earlier). Each has its own error (a fixed bias drawn
// from collectorError, plus a per-card wobble half that size) and a share of outsideBudget a week (savings capped at 4
// weeks). They start out holding collectorStart of every card's copies (outside the market), so they can sell into any
// card priced above value, and hold at most collectorPerCard copies of any one card, so a full card never stops them
// buying others. Both ways: they buy asks at or below their reference and sell to bids within collectorSpread of it. A
// bubble can still outrun them: their stock of a card and their money run out.
// The public price guide: every `every` weeks it publishes each player's value as of `lag` weeks earlier (the site's
// formula, from the values stored each week), and holds it in between. Everyone, the page included, sees the same number.
// Its settings: flat keys from the Rules panel (guideOn, guideEvery, guideLag) or the priceGuide object
const guideOn = (cfg) => !!(cfg.guideOn ?? cfg.priceGuide?.on);
function priceGuide(W) {
  const cfg = W.cfg, every = cfg.guideEvery ?? cfg.priceGuide?.every ?? 4, lag = Math.max(1, cfg.guideLag ?? cfg.priceGuide?.lag ?? 1);
  if (!W.guideNet) { W.guideNet = true; useShape(W); }
  for (const b of W.bots) if (b.g?.nn) { b.g.card = widenCard(W, b.g.card); if (b._ad?.saved) b._ad.saved.card = widenCard(W, b._ad.saved.card); }
  for (const p of W.players) { (p.Fq ||= []).push(p.F); if (p.Fq.length > lag) p.Fq.shift(); } // values at the ends of the last `lag` weeks
  if (W.guideT != null && W.t - W.guideT < every) return;
  W.guideT = W.t; for (const p of W.players) { p.guide = p.Fq[0]; p.guideT = W.t; }
}
function valueCollectors(W) {
  const cfg = W.cfg, N = cfg.collectors ?? 25, share = ((cfg.outsideBudget || 0) * (W.fillK ?? 1)) / Math.max(1, N), err = cfg.collectorError ?? 0.15;
  if (!W.coll || W.coll.length !== N) {
    const old = W.coll || []; W.coll = Array.from({ length: N }, (_, i) => old[i] || { cash: 0, stock: new Map(), n: 0, err: W.gauss() * err });
    if (!W.collSeeded) { W.collSeeded = true; const out = (W.outside ||= new Map()); let k = 0; // starting stock: a share of every card's copies
      for (const c of W.cards) { if (!(c.circ > 0) || c.on === false) continue; const q = Math.ceil((cfg.collectorStart ?? 0.1) * c.circ); for (let j = 0; j < q; j++) { const C = W.coll[k++ % N]; C.stock.set(c.id, (C.stock.get(c.id) || 0) + 1); C.n++; out.set(c.id, (out.get(c.id) || 0) + 1); } } }
  }
  const wob = (i, id) => { const h = Math.sin((i + 1) * 12.9898 + (id + 1) * 78.233) * 43758.5453; return ((h - Math.floor(h)) * 2 - 1) * err * 0.5; };
  const gd = guideOn(cfg); // with the guide on, dealers see what bots see: the guide, not last week's value
  const ref = (k, c) => { const p = W.players[c.pid], v = gd ? p.guide : p.Fpub ?? p.F; return v > 0 ? v * c.mult * Math.exp(W.coll[k].err + wob(k, c.id)) : null; };
  const per = cfg.collectorPerCard ?? 4, spread = cfg.collectorSpread ?? 0.05; let bought = 0, sold = 0, spent = 0;
  const askBook = []; for (const c of W.cards) { if (c.on === false) continue; for (const o of asks[c.id] || []) if (!o.used && o.b !== 'store') askBook.push([c, o]); }
  for (let k = 0; k < N; k++) {
    const C = W.coll[k], capC = (cfg.collectorSaveWeeks ?? 26) * share; C.cash = Math.min(capC, C.cash + share);
    // sell: any card they hold, to the best bids within `spread` of their reference
    for (const [id, q] of [...C.stock]) { const c = W.cards[id]; let left = q; const r = ref(k, c);
      for (const o of r == null ? [] : leftBids(c)) { if (left <= 0 || o.p < r * (1 - spread)) break; if (xfer(W, c, o.b, 'out', o.p, o)) { o.used = true; left--; C.cash += o.p; C.n--; sold++; const m = (W.house.mint ||= {}); m.outsideOut -= o.p; m.dealerOut = (m.dealerOut || 0) + o.p; } }
      left > 0 ? C.stock.set(id, left) : C.stock.delete(id); }
    C.cash = Math.min(capC, C.cash);
    // buy: the asks furthest below their reference, at most `per` copies of any one card, while money lasts
    const cand = askBook.filter(([c, o]) => !o.used && ref(k, c) != null && o.p <= ref(k, c) && (C.stock.get(c.id) || 0) < per).sort((a, b) => a[1].p / ref(k, a[0]) - b[1].p / ref(k, b[0]));
    for (const [c, o] of cand) { if (o.p > C.cash || o.used || (C.stock.get(c.id) || 0) >= per) continue; if (xfer(W, c, 'out', o.b, o.p, null, o)) { const m = (W.house.mint ||= {}); m.outsideIn -= o.p; m.dealerIn = (m.dealerIn || 0) + o.p; o.used = true; C.cash -= o.p; C.n++; C.stock.set(c.id, (C.stock.get(c.id) || 0) + 1); bought++; spent += o.p; } }
  }
  W.outsideWeek = { spent: Math.round(spent), bought, resold: sold, held: W.coll.reduce((a, C) => a + C.n, 0) };
}
// 3. Forced sellers: sell into the best bids until the debt is covered; whatever is left goes to auction with no minimum
// One order for both stages, the bot's own: a neural bot's card network ranks its cards and its one-of-a-kind cards by its
// wish to sell (sell − buy output; forcedOrder 'price': dearest first, as for every other bot). It sells into the best bids
// in that order, then lists what is still needed at auction with no minimum in the same order, then its items.
function forcedSales(W) {
  const tally = (W.forcedWeek ||= {});
  for (const b of W.bots) {
    if (!(b.forced > 0)) continue; let need = b.forced; const cash0 = b.cash, cause = Object.entries(b.forcedBy || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || 'other', count = () => { tally[cause] = (tally[cause] || 0) + 1; };
    const nwF = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctxF = marketCtx(W), rankF = new Map(), net = W.cfg.forcedOrder !== 'price' && b.g?.nn;
    if (net) for (const id of b.h.keys()) { const o = cardNet(W, b, W.cards[id], nwF, ctxF); rankF.set(id, o[1] - o[0]); } // its network's wish to sell
    const ids = [...b.h.keys()].sort((x, y) => net ? rankF.get(y) - rankF.get(x) : W.cards[y].P - W.cards[x].P);
    for (const id of ids) {
      const c = W.cards[id];
      for (const o of leftBids(c)) { if (need <= 0 || !(b.h.get(id) > 0)) break; if (o.b === b || blocked(o.b, b)) continue; if (xfer(W, c, o.b, b, o.p, o)) { o.used = true; need -= o.p * (1 - W.cfg.fee); count(); } }
      if (need <= 0) break;
    }
    for (const id of ids) { const c = W.cards[id]; while (need > 0 && (b.h.get(id) || 0) > 0) { if (!listAuction(W, b, c, NO_MIN)) break; need -= c.P; count(); } if (need <= 0) break; }
    const its = [...(b.items || [])].map((uid) => W.items.get(uid)).filter(Boolean), rk = new Map(its.map((it) => { const c = W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)]; if (!net) return [it, markItem(W, it)]; const o = cardNet(W, b, c, nwF, ctxF, it); return [it, o[1] - o[0]]; }));
    for (const it of its.sort((x, y) => rk.get(y) - rk.get(x))) { if (need <= 0) break; if (listItem(W, b, it, NO_MIN)) { need -= markItem(W, it); count(); } }
    b._fsRaised = (b._fsRaised || 0) + Math.max(0, b.cash - cash0); // what its forced sales into bids raised this week (auction sales settle later, as ordinary income)
  }
}
const NO_MIN = 0.01; // an auction with no minimum price (the reserve must be above zero)
function clear(W) {
  const cfg = W.cfg; let trades = 0; W.whyWeek = { buy: {}, sell: {} }; W.forcedWeek = {}; W.bookDiag = { n: 0, both: 0, onlyBid: 0, onlyAsk: 0, neither: 0, gap: [], bidD: [], askD: [] };
  W.arcsWeek = [];
  W.fills = new Map(); // bot id -> [{player, side, price}] this week (AI observations)
  const fill = (b, c, side, price) => { if (!b || b === 'liq' || b.kind !== 'ai') return; if (!W.fills.has(b.id)) W.fills.set(b.id, []); W.fills.get(b.id).push({ player: c.key, side, price: +price.toFixed(2) }); };
  for (const c of W.cards) {
    const B = bids[c.id], A = asks[c.id]; let done = 0;
    if (c.dorm) continue; // set aside (dormantAfter): no orders, no holders; wakePlayer() fills in the weeks it skipped
    if (W.fullL && (B.length || A.length || c.circ)) W.players[c.pid].actT = W.t;
    if (!B.length && !A.length && !c.circ) { c.volH.push(0); if (c.volH.length > 60) c.volH.shift(); continue; } // a card nobody holds or trades
    const P0 = c.P, lim = cfg.priceLimit > 0 ? [P0 * (1 - cfg.priceLimit), P0 * (1 + cfg.priceLimit)] : [0, Infinity];
    if (cfg.store && c.pool > 0) for (let k = 0; k < Math.min(3, c.pool); k++) A.push({ b: 'store', p: c.F * (1 + cfg.storePremium) });
    c.wk = { o: P0, h: P0, l: P0, v: 0 };
    B.sort((x, y) => y.p - x.p); A.sort((x, y) => x.p - y.p);
    if (c.on !== false && c.circ > 0 && P0 > 0) { const D = W.bookDiag, pr = cfg.priceRange ?? 0.6; for (const o of B) if (o.b && typeof o.b === 'object') D.bidD.push((o.p / P0 - 1) / pr); for (const o of A) if (o.b && typeof o.b === 'object') D.askD.push((o.p / P0 - 1) / pr); } // distance of bots' orders from the mark, in priceRange units
    c.book = { bids: B.slice(0, 6).map((o) => [r2(o.p), o.b ? (o.b === 'liq' ? 'liquidator' : o.b.name) : 'outside']), asks: A.slice(0, 6).map((o) => [r2(o.p), o.b === 'store' ? 'Vault store' : o.b === 'liq' ? 'liquidator' : o.b.name]) };
    if (B.length && A.length) {
      const m = []; let i = 0, j = 0;
      while (i < B.length && j < A.length && B[i].p >= A[j].p) {
        if (B[i].b && B[i].b === A[j].b) { j++; continue; }
        if (blocked(B[i].b, A[j].b)) { let k = j + 1; while (k < A.length && A[k].p <= B[i].p && (blocked(B[i].b, A[k].b) || B[i].b === A[k].b)) k++; if (k < A.length && A[k].p <= B[i].p) [A[j], A[k]] = [A[k], A[j]]; else { i++; continue; } } // a flagged pair can't trade: the next ask, or the next bid
        m.push([B[i], A[j]]); i++; j++;
      }
      if (m.length) {
        const last = m[m.length - 1], price = clamp((last[0].p + last[1].p) / 2, lim[0], lim[1]);
        for (const [bd, ak] of m) {
          if (bd.p < price || ak.p > price) continue; // the price limit kept this pair from crossing
          const buyer = bd.b, seller = ak.b; bd.used = ak.used = true;
          if (buyer && buyer.cash < price) continue;
          if (seller === 'liq') { const q = W.liq.get(c.id) || 0; if (!q) continue; q > 1 ? W.liq.set(c.id, q - 1) : (W.liq.delete(c.id), W.liqPrice?.delete(c.id)); (W.liqSold ||= new Set()).add(c.id); }
          else if (seller === 'store') { if (c.pool < 1) continue; c.pool--; c.circ++; W.house.store = (W.house.store || 0) + price; W.treasury += price; packCache = null; }
          else { if ((seller.h.get(c.id) || 0) < 1) continue; give(seller, c, -1); seller.cash += price * (1 - cfg.fee); W.house.fees += price * cfg.fee; W.treasury += price * cfg.fee; fill(seller, c, 'sell', price); flowIn(W, seller, price * (1 - cfg.fee)); sellLot(W, seller, c, price * (1 - cfg.fee)); }
          if (buyer) { buyer.cash -= price; give(buyer, c, 1); fill(buyer, c, 'buy', price); flowOut(W, buyer, price); addLot(buyer, c, price, W.t); } else { c.circ--; W.house.outside += price; }
          c.wk.h = Math.max(c.wk.h, price); c.wk.l = Math.min(c.wk.l, price); c.wk.v++;
          if (W.ord) W.ord.coins += price; tkTrade(W, buyer, seller, c, price, P0, 'x');
          { const j = { type: 'trade', card: c.key, price: r2(price), buyer: buyer ? buyer.name : 'outside collector', seller: seller === 'liq' ? 'liquidator' : seller === 'store' ? 'Vault store' : seller.name }; noteWhy(W, j, bd, ak); jot(W, j); }
          done++;
          if (W.arcsWeek.length < 60 && buyer && seller !== 'liq' && seller !== 'store' && W.rand() < 0.5) W.arcsWeek.push([seller.id, buyer.id]);
        }
        if (done) { c.P = price; noteTrade(W, c, price); }
      }
    }
    // Quote pressure: unfilled bids above the price (or asks below it) move the quote even without a trade.
    let topBid = 0, lowAsk = Infinity;
    for (const o of B) if (!o.used && o.p > topBid) topBid = o.p;
    for (const o of A) if (!o.used && o.p < lowAsk) lowAsk = o.p;
    const O = W.ord; if (O) { O.bids += B.length; O.asks += A.length; }
    c.bb = topBid; c.ba = lowAsk < Infinity ? lowAsk : 0;
    if (c.on !== false && c.circ > 0 && P0 > 0) { const D = W.bookDiag; let bb = 0, ba = Infinity; for (const o of B) if (!o.used && o.b && typeof o.b === 'object' && o.p > bb) bb = o.p; for (const o of A) if (!o.used && o.b && typeof o.b === 'object' && o.p < ba) ba = o.p; // the bots' own standing book after the cross
      D.n++; if (bb > 0 && ba < Infinity) { D.both++; D.gap.push((ba - bb) / P0); } else if (bb > 0) D.onlyBid++; else if (ba < Infinity) D.onlyAsk++; else D.neither++; }
    { // the book's levels for markRule 'book': the median of the markDepth best standing orders (fewer if fewer exist)
      const k = cfg.markDepth ?? 3, med = (xs) => xs.length % 2 ? xs[xs.length >> 1] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
      const a = A.filter((o) => !o.used && o.b && o.b !== 'liq' && o.b !== 'store').map((o) => o.p).sort((x, y) => x - y).slice(0, k), bq = B.filter((o) => !o.used && o.b && o.b !== 'liq').map((o) => o.p).sort((x, y) => y - x).slice(0, k);
      c.askLvl = a.length ? med(a) : null; c.bidLvl = bq.length ? med(bq) : null; } // the book's best bid and ask: shown and seen, never moving the price under 'lastTrade'
    if (cfg.priceRule !== 'quotes') { /* last trade only */ } else if (cfg.twoSidedQuotes) {
      // Marked to the spread: only a two-sided book (an unfilled bid and an unfilled offer) moves the quote, toward the
      // nearest edge of the spread when the last price sits outside it. Offers with no bids (or bids with no offers) don't.
      if (topBid > 0 && lowAsk < Infinity) { const tgt = clamp(c.P, topBid, lowAsk); if (tgt > c.P) { c.P = lerp(c.P, tgt, cfg.quotePull); if (O) O.pullUp++; } else if (tgt < c.P) { c.P = lerp(c.P, tgt, cfg.quotePull); if (O) O.pullDown++; } }
    } else if (topBid > c.P) { c.P = lerp(c.P, topBid, cfg.quotePull); if (O) O.pullUp++; } else if (lowAsk < c.P) { c.P = lerp(c.P, lowAsk, cfg.quotePull); if (O) O.pullDown++; }
    c.P = clamp(c.P, lim[0], lim[1]);
    (c.ohlc ||= []).push([r2(c.wk.o), r2(Math.max(c.wk.h, c.P)), r2(Math.min(c.wk.l, c.P)), r2(c.P), c.wk.v]); if (c.ohlc.length > 120) c.ohlc.shift();
    c.volH.push(done + (c.aucT === W.t ? c.aucN : 0)); if (c.volH.length > 60) c.volH.shift();
    c.Ph.push(c.P); if (c.Ph.length > 80) c.Ph.shift();
    trades += done;
  }
  W.lastTrades = trades + (W.aucWeek || 0); // auction sales count as trades
  if (cfg.priceRule === 'comps') compsMark(W);
  if (cfg.markRule === 'book' && cfg.priceRule !== 'quotes') { // the last trade (or comparable-sales mark), kept inside the standing book
    const fade = cfg.markHalfLife > 0 ? 1 - 0.5 ** (1 / cfg.markHalfLife) : 0, need = cfg.markWeeks ?? 2;
    for (const c of W.cards) { if (!(c.circ > 0)) continue; const to = bookMark(c, W.t, fade, need); if (to !== c.P) { c.P = to; c.bookT = W.t; c.bookP = to; if (c.Ph.length) c.Ph[c.Ph.length - 1] = to; } } }
  impliedPrices(W); if (W.fullL) W._cleared = W.t; // a player woken after this has missed this week's upkeep too
}
// markRule 'book': where the book leaves a card's mark this week (exported for the unit check)
export function bookMark(c, t, fade, need) {
  // persistence: count the weeks running that the ask median sat below the mark (or the bid median above it)
  c.askBelow = c.askLvl != null && c.askLvl < c.P ? (c.askBelow || 0) + 1 : 0; c.bidAbove = c.bidLvl != null && c.bidLvl > c.P ? (c.bidAbove || 0) + 1 : 0;
  let to = c.P; if (c.askBelow >= need) to = c.askLvl; else if (c.bidAbove >= need) to = c.bidLvl;
  if (fade && c.lastTradeT !== t) { // the appraiser: an old sale counts for less as it ages. Asks only pull a mark down, bids only push it up
    const A = c.askLvl, B = c.bidLvl, last = c.lastTradeP ?? c.P0; let target = null;
    if (A != null && B != null) { if (to < Math.min(A, B) || to > Math.max(A, B)) target = (A + B) / 2; } // both: only a mark outside the spread moves (toward the middle); inside it neither order tests it, so it holds
    else if (A != null) { const tg = Math.min(A, last); if (tg < to) target = tg; } // only asks: down toward the lower of the ask level and the last trade
    else if (B != null) { const tg = Math.max(B, last); if (tg > to) target = tg; } // only bids: up toward the higher of the bid level and the last trade
    if (target != null) to += (target - to) * fade; } // neither: it holds
  return to;
}
function leagueUpdate(W) {
  const moved = [];
  for (const c of W.players) if (W.rand() < 0.12) { const k = Math.exp(W.gauss() * 0.3); c.F = Math.max(0.05 * W.cfg.coinScale, c.F * k); moved.push([c, k]); }
  moved.sort((a, b) => b[1] - a[1]);
  const up = moved[0], dn = moved[moved.length - 1];
  log(W, 'update', `League update (test): ${moved.length} players' values moved${up ? `, led by ${up[0].pos} ${up[0].name} up ${Math.round((up[1] - 1) * 100)}%` : ''}${dn ? ` and ${dn[0].pos} ${dn[0].name} down ${Math.round((1 - dn[1]) * 100)}%` : ''}. Every note on them is now out of date.`);
}
// Royalties: a card pays its holders royaltyRate of its hidden value per weeksPerGeneration weeks. 'week' (default) pays
// each week a 1/weeksPerGeneration share, scaled under the league by that week's game: his production ÷ his career pace
// (a big game pays more, an injured, idle or retired player pays nothing). 'generation': the old lump at each generation's end.
function payRoyalties(W, share) {
  const cfg = W.cfg, league = cfg.valueModel === 'league' && W.L;
  const gameK = (p) => { if (!league || !p.lg) return 1; if (!p.lg.active || !p._game || p._gameT !== W.t) return 0; const g = p.lg.tot.g || 0, cpg = g ? lgProduction(p.pos, p.lg.tot) / g : 0; return cpg > 0 ? Math.max(0, lgProduction(p.pos, p._game) / cpg) : 1; };
  const k = new Map(W.players.map((p) => [p.id, gameK(p)]));
  const perCard = (c) => cfg.royaltyRate * share * c.F * (k.get(c.pid) ?? 1), perItem = (it) => cfg.royaltyRate * share * intrinsicItem(W, it) * (k.get(it.pid) ?? 1);
  let owed = 0; for (const b of W.bots) { for (const [id, q] of b.h) owed += perCard(W.cards[id]) * q; for (const uid of b.items || []) { const it = W.items.get(uid); if (it) owed += perItem(it); } }
  const house = cfg.royaltyFunding === 'house', scaleR = house ? Math.min(1, Math.max(0, W.treasury) / Math.max(1, owed)) : cfg.closedEconomy ? Math.min(1, (W.treasury * 0.5) / Math.max(1, owed)) : 1; let paid = 0;
  for (const b of W.bots) { let d = 0; for (const [id, q] of b.h) d += perCard(W.cards[id]) * q * scaleR; for (const uid of b.items || []) { const it = W.items.get(uid); if (it) d += perItem(it) * scaleR; } b.cash += d; flowIn(W, b, d); paid += d; } // royalties count in a bot's return: what it holds is its choice
  for (const L of W.cardLoans || []) { const amt = perCard(W.cards[L.id]) * scaleR; L.borrower.cash -= amt; L.lender.cash += amt; } // a short seller pays the lender what the card would have earned
  if (cfg.closedEconomy || house) W.treasury -= paid; else (W.house.mint ||= {}).royalties = (W.house.mint.royalties || 0) + paid; W.house.royalties += paid; W.royGen = (W.royGen || 0) + paid;
  // what each card paid over the last weeksPerGeneration weeks, per copy (public: every holder saw it)
  const n = cfg.weeksPerGeneration; for (const p of W.players) { const r = (p.royWin ||= []); r.push(cfg.royaltyRate * share * p.F * (k.get(p.id) ?? 1) * scaleR); if (r.length > (share >= 1 ? 1 : n)) r.shift(); p.roySum = r.reduce((a, b) => a + b, 0); }
  for (const c of W.cards) c.lastRoy = (W.players[c.pid].roySum || 0) * c.mult; for (const it of W.items.values()) it.lastRoy = (W.players[it.pid]?.roySum || 0) * (it.mult / Math.max(1e-9, W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)]?.mult || 1));
}
// Learning within a lifetime (adapt): every `every` weeks each neural bot scores the period just ended exactly as fitness
// (fitnessValue applies; allowance and the like excluded). If it was running a trial (its networks plus W.gauss() × size),
// it keeps the trial when that score beat the one before, else restores the saved networks. Then it starts a new trial.
// Nothing says what to learn: its own results decide. Adopting another's networks (evolution, inheritance) resets it.
function adaptStep(W) {
  const cfg = W.cfg, on = cfg.adaptOn ?? cfg.adapt?.on, every = cfg.adaptEvery ?? cfg.adapt?.every ?? 10, size = cfg.adaptSize ?? cfg.adapt?.size ?? 0.05, bar = cfg.adaptBar || 'kept';
  if (!on || W.t % every) return; const st = (W.adaptStats ||= { run: 0, kept: 0 }), bidFit = cfg.fitnessValue === 'bid';
  // every score this period first, so each can also be read against the period's median (the market's common move)
  const sc = new Map(); for (const b of W.bots) { if (!b.g?.nn || !b._ad) continue; const A = b._ad, val = bidFit ? realValue(W, b) : worth(W, b); sc.set(b, [val, (val - ((b.exo || 0) - A.exo)) / Math.max(50 * cfg.coinScale, A.start) - 1]); }
  const all = [...sc.values()].map((v) => v[1]).sort((x, y) => x - y), mid = all.length ? all[all.length >> 1] : 0;
  for (const b of W.bots) { if (!b.g?.nn) continue;
    const A = b._ad;
    if (!A) { const val = bidFit ? realValue(W, b) : worth(W, b); b._ad = { start: val, exo: b.exo || 0 }; continue; } // first period: just measure
    const [val, raw] = sc.get(b), rel = raw - mid, score = bar === 'market' ? rel : raw; let base = score;
    if (A.keptScore != null) { (W.adaptPairs ||= []).push([A.keptScore, raw]); (W.adaptPairsM ||= []).push([A.keptRel, rel]); } else if (A.rejected) (W.adaptRej ||= []).push(raw); // diagnostics: how the period after a kept (or rejected) trial scored, raw and against the median
    let kept = null, keptRel = null, rejected = false;
    if (A.saved) { st.run++; if (score > A.saved.score) { st.kept++; kept = raw; keptRel = rel; } else { b.g.card = A.saved.card; b.g.bot = A.saved.bot; base = A.saved.score; rejected = true; } }
    if (bar === 'fresh' && rejected) { b._ad = { start: val, exo: b.exo || 0, saved: null, keptScore: null, rejected, fresh: true }; continue; } // the restored networks run one period untouched: that score becomes the bar
    const saved = { card: Float64Array.from(b.g.card), bot: Float64Array.from(b.g.bot), score: base };
    for (const net of [b.g.card, b.g.bot]) for (let i = 0; i < net.length; i++) net[i] += W.gauss() * size; // the trial
    b._ad = { start: val, exo: b.exo || 0, saved, keptScore: kept, keptRel, rejected }; }
}
// Where the networks press against their limits this week (measurement only): price offsets at the wall (range: |tanh| > 0.9;
// log: at the safety clamp) and beyond the default range's edge; bots whose cash target, loan rates, lending share or leverage
// output sits in the top 5% (sigmoid > 0.95, tanh > 0.9) of its range, or at rateMax; order sizes at the top; and the share of
// acting bots that had one more order, auction listing, item listing or short they wanted to place but the weekly count stopped
// (packs: wanted more than maxPacks)
function limitsSummary(W) {
  const D = W.limDiag; if (!D || !D.bots) return null; const sh = (a, n) => (n ? r2x(a / n) : null);
  return { bots: D.bots, keep: sh(D.keep, D.bots), lendRate: sh(D.lendRate, D.bots), maxRate: sh(D.maxRate, D.bots), lendOver5: sh(D.lendOver, D.bots), maxOver5: sh(D.maxOver, D.bots), lendShare: sh(D.lendShare, D.bots), lev: sh(D.lev, D.bots),
    bids: D.bid, bidEdge: sh(D.bidEdge, D.bid), bidFar: sh(D.bidFar, D.bid), asks: D.ask, askEdge: sh(D.askEdge, D.ask), askFar: sh(D.askFar, D.ask), qtyEdge: sh(D.qtyEdge, D.qty), packBidEdge: sh(D.packBidEdge, D.packBid),
    acts: D.acts, orders: sh(D.orders, D.acts), listings: sh(D.listings, D.acts), items: sh(D.items, D.acts), shorts: sh(D.shorts, D.acts), packs: sh(D.packs, D.acts) };
}
// The bots' book this week (4c): spread between their best bid and best ask (share of the mark) over cards with both,
// cards with only bids, only asks or neither, and where their orders sit: distance from the mark in priceRange units, and
// the price-offset output itself (tanh, −1…1; at ±1 an order is at the edge of the range its network allows)
function bookSummary(W) {
  const D = W.bookDiag, O = W.offDiag; if (!D) return null; const med = (xs) => { if (!xs.length) return null; const s2 = xs.slice().sort((a, b) => a - b); return r2x(s2[s2.length >> 1]); }, edge = (xs) => (xs.length ? r2x(xs.filter((v) => Math.abs(v) > 0.9).length / xs.length) : null), n = Math.max(1, D.n);
  return { cards: D.n, gap: med(D.gap), both: r2x(D.both / n), onlyBid: r2x(D.onlyBid / n), onlyAsk: r2x(D.onlyAsk / n), neither: r2x(D.neither / n), bidDist: med(D.bidD), askDist: med(D.askD), bidOff: med(O?.bid || []), askOff: med(O?.ask || []), bidEdge: edge(O?.bid || []), askEdge: edge(O?.ask || []), bids: D.bidD.length, asks: D.askD.length };
}
/* ---------- Diagnostics (round 3): measurement only. No W.rand, nothing in the world changes ---------- */
const prng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function spearman(xs, ys) { const n = xs.length; if (n < 5) return null; const rank = (a) => { const s2 = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(n); s2.forEach(([, i], k) => (r[i] = k)); return r; }, a = rank(xs), b = rank(ys); let d = 0; for (let k = 0; k < n; k++) d += (a[k] - b[k]) ** 2; return Math.round((1 - (6 * d) / (n * (n * n - 1))) * 1000) / 1000; }
const pctl = (xs) => { const s = xs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b), at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return s.length ? [r2x(s.reduce((a, b) => a + b, 0) / s.length), r2x(at(0.1)), r2x(at(0.5)), r2x(at(0.9))] : null; };
function cosDist(a, b) { const n = Math.min(a.length, b.length); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? 1 - ab / Math.sqrt(aa * bb) : 0; }
// 24 fixed sample cards (inputs drawn once from a private generator, the same in every run), for the strategy clusters
let PROBES = null;
function probeCards() { const n = CARD_SHAPE[0]; if (PROBES && PROBES[0].length === n) return PROBES; const r = prng(24601); PROBES = Array.from({ length: 24 }, () => { const x = new Float64Array(n); x[0] = 1; for (let i = 1; i < n; i++) x[i] = r() < 0.25 ? 0 : (r() * 2 - 1) * 0.8; return x; }); return PROBES; }
// Strategy clusters: each bot's card-network outputs on the sample cards (z-scored per output), k-means for k = 2..8
// (k-means++ starts from the private generator), k chosen by the mean silhouette
function strategyClusters(bots) {
  const P = probeCards(), buf = bufs(CARD_SHAPE), V = bots.map((b) => { const v = []; for (const x of P) { const o = forwardCard(b.g.card, x, buf); for (let j = 0; j < o.length; j++) v.push(o[j]); } return v; }); foldKey = null;
  const n = V.length, d = n ? V[0].length : 0; if (n < 12) return null;
  for (let j = 0; j < d; j++) { let m = 0, q = 0; for (const v of V) m += v[j]; m /= n; for (const v of V) q += (v[j] - m) ** 2; const sd = Math.sqrt(q / n) || 1; for (const v of V) v[j] = (v[j] - m) / sd; }
  const D = Array.from({ length: n }, () => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let s2 = 0; const a = V[i], b = V[j]; for (let k = 0; k < d; k++) s2 += (a[k] - b[k]) ** 2; D[i][j] = D[j][i] = Math.sqrt(s2); }
  let best = null;
  for (let k = 2; k <= Math.min(8, n - 1); k++) {
    const r = prng(1000 + k), C = [V[Math.floor(r() * n)].slice()];
    while (C.length < k) { const w = V.map((v) => Math.min(...C.map((c) => { let s2 = 0; for (let j = 0; j < d; j++) s2 += (v[j] - c[j]) ** 2; return s2; }))), tot = w.reduce((a, b) => a + b, 0); let u = r() * tot, i = 0; while (i < n - 1 && (u -= w[i]) > 0) i++; C.push(V[i].slice()); }
    const lab = new Int32Array(n);
    for (let it = 0; it < 30; it++) { let moved = false;
      for (let i = 0; i < n; i++) { let bi = 0, bd = Infinity; for (let c = 0; c < k; c++) { let s2 = 0; for (let j = 0; j < d; j++) s2 += (V[i][j] - C[c][j]) ** 2; if (s2 < bd) { bd = s2; bi = c; } } if (lab[i] !== bi) { lab[i] = bi; moved = true; } }
      for (let c = 0; c < k; c++) { const m = new Float64Array(d); let cnt = 0; for (let i = 0; i < n; i++) if (lab[i] === c) { cnt++; for (let j = 0; j < d; j++) m[j] += V[i][j]; } if (cnt) for (let j = 0; j < d; j++) C[c][j] = m[j] / cnt; }
      if (!moved) break; }
    const size = new Array(k).fill(0); for (let i = 0; i < n; i++) size[lab[i]]++;
    let sil = 0; for (let i = 0; i < n; i++) { const sum = new Array(k).fill(0); for (let j = 0; j < n; j++) if (j !== i) sum[lab[j]] += D[i][j]; const own = size[lab[i]] > 1 ? sum[lab[i]] / (size[lab[i]] - 1) : 0; let other = Infinity; for (let c = 0; c < k; c++) if (c !== lab[i] && size[c]) other = Math.min(other, sum[c] / size[c]); sil += size[lab[i]] > 1 && other < Infinity ? (other - own) / Math.max(own, other) : 0; }
    sil /= n; if (!best || sil > best.sil) best = { k, sil, top: Math.max(...size) / n };
  }
  return best && { clusters: best.k, clusterTop: r2x(best.top), clusterSil: r2x(best.sil) };
}
/* ---------- Tactic tracker: measurement only. No W.rand, nothing in the world changes ---------- */
// What each bot actually did this generation is tallied as it happens (b._tk); at the generation end the profiles are
// z-scored and clustered (k-means, k = 2..8 by silhouette, private generator), each cluster is named by its most
// distinctive features, and matched to the last generation's tactics by centroid distance, so a tactic keeps its id
// for as long as bots keep doing it. Hidden value never enters a profile: prices are compared with the mark, the public
// price guide and the bot's own research note, all things the bot sees.
const tkNew = () => ({ b: [0, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0, 0], bot: 0, auc: 0, hold: 0, holdN: 0, lend: 0, borrow: 0, shorts: 0, cardsLent: 0, packs: 0, lists: 0, sealed: 0, forced: 0 });
const tk = (W, b) => (W.cfg.tactics && b && typeof b === 'object' && b.kind === 'rule' ? (b._tk ||= tkNew()) : null);
// one side of a trade: [count, coins, Σ log(price ÷ mark), Σ log(price ÷ guide), guide n, Σ log(price ÷ own note), note n]
function tkSide(W, b, side, c, price, mark, it, other, via) {
  const T = tk(W, b); if (!T || !(price > 0)) return; const s = T[side], mult = it ? it.mult : c.mult, pl = W.players[c.pid], n = b.notes?.get(c.pid);
  s[0]++; s[1] += price; if (mark > 0) s[2] += Math.log(price / mark);
  if (guideOn(W.cfg) && pl?.guide > 0) { s[3] += Math.log(price / (pl.guide * mult)); s[4]++; }
  if (fresh(W, n) && n.est > 0) { s[5] += Math.log(price / (n.est * mult)); s[6]++; }
  if (other && typeof other === 'object') T.bot++; if (via === 'auc') T.auc++;
}
function tkTrade(W, buyer, seller, c, price, mark, via, it) { if (!W.cfg.tactics) return; tkSide(W, buyer, 'b', c, price, mark, it, seller, via); tkSide(W, seller, 's', c, price, mark, it, buyer, via); }
const tkAdd = (W, b, k, x = 1) => { const T = tk(W, b); if (T) T[k] += x; };
// the profile: raw values in plain units (for the names), then the transform the clustering uses
const TAC_F = ['buys', 'sells', 'turn', 'netBuy', 'bMark', 'sMark', 'bGuide', 'sGuide', 'bEst', 'sEst', 'hold', 'cash', 'conc', 'lend', 'borrow', 'shorts', 'cardsLent', 'packs', 'lists', 'sealed', 'botShare', 'aucShare', 'forced'];
const TAC_GRP = { buys: 'act', sells: 'act', turn: 'act', bMark: 'bp', bGuide: 'bp', bEst: 'bp', sMark: 'sp', sGuide: 'sp', sEst: 'sp' }; // a name uses one feature per group
const lg1 = (v) => Math.log1p(Math.max(0, v)), lg10 = (v) => Math.log1p(10 * Math.max(0, v)), cl1 = (v) => clamp(v, -1, 1);
const TAC_X = { buys: lg1, sells: lg1, turn: lg1, bMark: cl1, sMark: cl1, bGuide: cl1, sGuide: cl1, bEst: cl1, sEst: cl1, hold: lg1, lend: lg10, borrow: lg10, forced: lg10, shorts: lg1, cardsLent: lg1, packs: lg1, lists: lg1, sealed: lg1 };
function tacProfile(W, b) {
  const T = b._tk || tkNew(), B = T.b, S = T.s, cs = W.cfg.coinScale, base = Math.max(50 * cs, ((b.genStart ?? 0) + Math.max(0, worth(W, b))) / 2), avg = (s, n) => (n ? s / n : null);
  let hv = 0; const byP = new Map(); for (const [id, q] of b.h) { const c = W.cards[id], v = q * c.P; hv += v; byP.set(c.pid, (byP.get(c.pid) || 0) + v); }
  for (const uid of b.items || []) { const it = W.items.get(uid); if (it) { const v = markItem(W, it); hv += v; byP.set(it.pid, (byP.get(it.pid) || 0) + v); } }
  let hold = T.hold, holdN = T.holdN; if (b.lots) for (const l of b.lots.values()) for (const x of l) { hold += W.t - x[1]; holdN++; } // sold copies and the ones still held
  const tr = B[0] + S[0], cn = B[1] + S[1], cash = Math.max(0, b.cash);
  return { buys: B[0], sells: S[0], turn: cn / base, netBuy: cn ? (B[1] - S[1]) / cn : null, bMark: avg(B[2], B[0]), sMark: avg(S[2], S[0]), bGuide: avg(B[3], B[4]), sGuide: avg(S[3], S[4]), bEst: avg(B[5], B[6]), sEst: avg(S[5], S[6]),
    hold: holdN ? hold / holdN : null, cash: cash + hv > 0 ? cash / (cash + hv) : null, conc: hv > 0 ? Math.max(...byP.values()) / hv : null, lend: T.lend / base, borrow: T.borrow / base, shorts: T.shorts, cardsLent: T.cardsLent, packs: T.packs, lists: T.lists, sealed: T.sealed,
    botShare: tr ? T.bot / tr : null, aucShare: tr ? T.auc / tr : null, forced: T.forced / base };
}
const tP = (x) => `${Math.round(Math.abs(x) * 100)}%`, tN = (x) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10)), tRel = (lg) => { const r = Math.exp(lg) - 1; return Math.abs(r) < 0.005 ? 'at' : `${tP(r)} ${r < 0 ? 'below' : 'above'}`; };
// a feature below the average reads as "never" when it is about zero, else "less than most"
const tLo = (v, none, less, ratio) => (v < (ratio ? 0.005 : 0.5) ? none : `${less} (~${ratio ? tP(v) + ' of its worth' : tN(v)} a gen)`);
const TAC_SAY = {
  buys: (v, z) => (z > 0 ? `buys a lot (~${tN(v)} a gen)` : tLo(v, 'hardly buys', 'buys less than most')), sells: (v, z) => (z > 0 ? `sells a lot (~${tN(v)} a gen)` : tLo(v, 'hardly sells', 'sells less than most')),
  turn: (v, z) => (z > 0 ? `trades ${tN(v)}× its worth a gen` : `barely trades (${tP(v)} of its worth a gen)`), netBuy: (v) => { const x = (1 + Math.abs(v)) / Math.max(0.02, 1 - Math.abs(v)); return v >= 0 ? `net buyer (buys ${tN(x)}× the coins it sells)` : `net seller (sells ${tN(x)}× the coins it buys)`; },
  bMark: (v) => `buys ${tRel(v)} the mark`, sMark: (v) => `sells ${tRel(v)} the mark`, bGuide: (v) => `buys ${tRel(v)} the price guide`, sGuide: (v) => `sells ${tRel(v)} the price guide`,
  bEst: (v) => `buys ${tRel(v)} its own research estimate`, sEst: (v) => `sells ${tRel(v)} its own research estimate`, hold: (v) => `holds ~${tN(v)} weeks`, cash: (v) => `keeps ${tP(v)} in cash`,
  conc: (v, z) => (z > 0 ? `concentrated (top player ${tP(v)} of its cards)` : `spread out (top player ${tP(v)} of its cards)`),
  lend: (v, z) => (z > 0 ? `lends coins (${tP(v)} of its worth a gen)` : tLo(v, 'never lends coins', 'lends less than most', true)), borrow: (v, z) => (z > 0 ? `borrows (${tP(v)} of its worth a gen)` : tLo(v, 'never borrows', 'borrows less than most', true)),
  shorts: (v, z) => (z > 0 ? `sells short (~${tN(v)} a gen)` : tLo(v, 'never shorts', 'shorts less than most')), cardsLent: (v, z) => (z > 0 ? `lends cards to short sellers (~${tN(v)} a gen)` : tLo(v, 'never lends cards', 'lends fewer cards than most')),
  packs: (v, z) => (z > 0 ? `opens packs (~${tN(v)} a gen)` : tLo(v, 'opens no packs', 'opens fewer packs than most')),
  lists: (v, z) => (z > 0 ? `sells into auctions (~${tN(v)} listings a gen)` : tLo(v, 'never lists at auction', 'lists at auction less than most')), sealed: (v, z) => (z > 0 ? `bids in sealed auctions (~${tN(v)} bids a gen)` : tLo(v, 'never bids at auction', 'bids at auction less than most')),
  botShare: (v) => (v >= 0.5 ? `trades with other bots (${tP(v)} of its trades)` : `trades with dealers and outsiders (${tP(1 - v)} of its trades)`), aucShare: (v, z) => (z > 0 ? `trades at auction (${tP(v)} of its trades)` : `rarely trades at auction (${tP(v)} of its trades)`),
  forced: (v, z) => (z > 0 ? `forced to sell (${tP(v)} of its worth a gen)` : tLo(v, 'never forced to sell', 'forced to sell less than most', true)),
};
// k-means (k-means++ starts from the private generator) for k = 2..kMax, k by the mean silhouette
function kmeansSil(V, kMax, seed) {
  const n = V.length, d = n ? V[0].length : 0; if (n < 12) return null;
  const D = Array.from({ length: n }, () => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let s2 = 0; const a = V[i], b = V[j]; for (let k = 0; k < d; k++) s2 += (a[k] - b[k]) ** 2; D[i][j] = D[j][i] = Math.sqrt(s2); }
  const d2 = (v, c) => { let s2 = 0; for (let j = 0; j < d; j++) s2 += (v[j] - c[j]) ** 2; return s2; }; let best = null;
  for (let k = 2; k <= Math.min(kMax, n - 1); k++) {
    const r = prng(seed + k), C = [V[Math.floor(r() * n)].slice()];
    while (C.length < k) { const w = V.map((v) => Math.min(...C.map((c) => d2(v, c)))), tot = w.reduce((a, b) => a + b, 0); let u = r() * tot, i = 0; while (i < n - 1 && (u -= w[i]) > 0) i++; C.push(V[i].slice()); }
    const lab = new Int32Array(n);
    for (let it = 0; it < 40; it++) { let moved = false;
      for (let i = 0; i < n; i++) { let bi = 0, bd = Infinity; for (let c = 0; c < k; c++) { const s2 = d2(V[i], C[c]); if (s2 < bd) { bd = s2; bi = c; } } if (lab[i] !== bi) { lab[i] = bi; moved = true; } }
      for (let c = 0; c < k; c++) { const m = new Float64Array(d); let cnt = 0; for (let i = 0; i < n; i++) if (lab[i] === c) { cnt++; for (let j = 0; j < d; j++) m[j] += V[i][j]; } if (cnt) for (let j = 0; j < d; j++) C[c][j] = m[j] / cnt; }
      if (!moved) break; }
    const size = new Array(k).fill(0); for (let i = 0; i < n; i++) size[lab[i]]++;
    let sil = 0; for (let i = 0; i < n; i++) { const sum = new Array(k).fill(0); for (let j = 0; j < n; j++) if (j !== i) sum[lab[j]] += D[i][j]; const own = size[lab[i]] > 1 ? sum[lab[i]] / (size[lab[i]] - 1) : 0; let other = Infinity; for (let c = 0; c < k; c++) if (c !== lab[i] && size[c]) other = Math.min(other, sum[c] / size[c]); sil += size[lab[i]] > 1 && other < Infinity ? (other - own) / Math.max(own, other) : 0; }
    sil /= n; if (!best || sil > best.sil) best = { k, sil, lab: Array.from(lab) };
  }
  return best;
}
const tMean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null), tMed = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function tacticTrack(W, rule, gen) {
  const cfg = W.cfg, wpg = cfg.weeksPerGeneration, S = (W.tac ||= { next: 1, live: new Map(), of: new Map(), prevT: null }), win = Math.max(1, Math.round(cfg.tacticWindow ?? 2)), thr = cfg.tacticMatch ?? 1;
  const bots = rule.filter((b) => W.t - (b.joined ?? b.born ?? 0) >= wpg / 2); // in the market at least half the generation (a newcomer's half-week says nothing)
  const R = bots.map((b) => tacProfile(W, b)), F = TAC_F, nf = F.length;
  const X = R.map((r) => F.map((k) => (r[k] == null ? null : TAC_X[k] ? TAC_X[k](r[k]) : r[k])));
  const mu = new Array(nf).fill(0), sd = new Array(nf).fill(0);
  for (let j = 0; j < nf; j++) { const xs = X.map((x) => x[j]).filter((v) => v != null); mu[j] = tMean(xs) ?? 0; sd[j] = xs.length > 1 ? Math.sqrt(xs.reduce((a, v) => a + (v - mu[j]) ** 2, 0) / xs.length) : 0; }
  const Z = X.map((x) => x.map((v, j) => (v == null || !(sd[j] > 1e-9) ? 0 : (v - mu[j]) / sd[j]))); // a missing value sits at the mean
  for (const b of W.bots) b._tk = null; // the next generation's tally starts now
  const km = kmeansSil(Z, cfg.tacticKMax ?? 8, 7000); if (!km) return null;
  // clusters, largest first: centroid (z and the transformed scale), raw means, members
  let cl = Array.from({ length: km.k }, (_, c) => ({ c, idx: [] })); km.lab.forEach((c, i) => cl[c].idx.push(i)); cl = cl.filter((x) => x.idx.length).sort((a, b) => b.idx.length - a.idx.length || a.c - b.c);
  for (const x of cl) { x.z = F.map((_, j) => tMean(x.idx.map((i) => Z[i][j]))); x.cx = F.map((_, j) => tMean(x.idx.map((i) => X[i][j]).filter((v) => v != null))); x.raw = F.map((k) => tMean(x.idx.map((i) => R[i][k]).filter((v) => v != null)));
    const used = new Set(), top = []; for (const j of F.map((_, j) => j).sort((a, b) => Math.abs(x.z[b]) - Math.abs(x.z[a]) || a - b)) { if (top.length >= 3 || Math.abs(x.z[j]) < 0.4) break; const g = TAC_GRP[F[j]]; if (g && used.has(g)) continue; if (g) used.add(g); if (x.raw[j] != null) top.push(j); }
    x.top = top; x.name = top.length ? top.map((j) => TAC_SAY[F[j]](x.raw[j], x.z[j])).join(', ') : 'close to the market average on every count'; }
  // match to the last generation's tactics: centroid distance (RMS over features, in this generation's spread), greedy, one to one
  const dist = (a, b) => { let s2 = 0, m = 0; for (let j = 0; j < nf; j++) { if (a[j] == null || b[j] == null || !(sd[j] > 1e-9)) continue; s2 += ((a[j] - b[j]) / sd[j]) ** 2; m++; } return m ? Math.sqrt(s2 / m) : Infinity; };
  const prev = [...S.live.values()], pairs = []; cl.forEach((x, i) => prev.forEach((p, q) => pairs.push([dist(x.cx, p.cx), i, q]))); pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const gotC = new Map(), gotP = new Set(); for (const [d, i, q] of pairs) { if (d > thr) break; if (gotC.has(i) || gotP.has(q)) continue; gotC.set(i, [prev[q], d]); gotP.add(q); }
  const live = new Map(), alive = new Map(W.bots.map((b) => [b.id, b])), of = new Map(), n = bots.length;
  cl.forEach((x, i) => { const m = gotC.get(i); let t;
    if (m) { t = m[0]; x.d = m[1]; } else { let near = null; for (const p of prev) { const d = dist(x.cx, p.cx); if (!near || d < near[1]) near = [p, d]; } t = { id: S.next++, born: gen, parent: near ? near[0].id : null, pd: near ? near[1] : null, hist: [] }; x.d = null; }
    t.cx = x.cx; t.name = x.name; x.t = t; live.set(t.id, t); for (const k of x.idx) of.set(bots[k].id, t.id); });
  // where each tactic's bots came from: stayed, switched from another tactic, copied a bot's networks (evolution), heir, new
  for (const x of cl) { const fr = { stay: 0, switch: 0, copy: 0, heir: 0, new: 0 }, src = new Map();
    for (const k of x.idx) { const b = bots[k], was = S.of.get(b.id), net = b.srcT != null && S.prevT != null && b.srcT >= S.prevT, from = net ? S.of.get(b.src) : null; let o, s = null;
      if (was != null) { if (net && b.adopted && from != null) { o = 'copy'; s = from; } else if (was === x.t.id) o = 'stay'; else { o = 'switch'; s = was; } } else if (net && from != null) { o = b.offspring ? 'copy' : 'heir'; s = from; } else o = 'new';
      fr[o]++; if (s != null && s !== x.t.id) src.set(s, (src.get(s) || 0) + 1); }
    x.from = fr; x.src = [...src].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3);
    const ret = x.idx.map((k) => bots[k].roc).filter(Number.isFinite), retM = x.idx.map((k) => bots[k].rocMark).filter(Number.isFinite), fit = x.idx.map((k) => bots[k].fit).filter(Number.isFinite);
    x.ret = [tMean(ret), tMed(ret)]; x.retM = [tMean(retM), tMed(retM)]; x.fit = tMed(fit); x.share = x.idx.length / n;
    x.t.hist.push({ gen, share: x.share, ret: x.ret[0] }); if (x.t.hist.length > 12) x.t.hist.shift(); }
  // crowding: share up and mean return down in each of the last `win` generations. Cannibalized: share and return both
  // down while the tactic nearest it (centroid) has risen over the same stretch
  const run = (t) => { const h = t.hist; if (h.length < win + 1) return null; const w = h.slice(-win - 1); for (let i = 1; i < w.length; i++) if (w[i].gen !== w[i - 1].gen + 1) return null; return w; };
  const up = (w, k) => w.every((v, i) => !i || v[k] > w[i - 1][k]), down = (w, k) => w.every((v, i) => !i || v[k] < w[i - 1][k]);
  const rose = (t) => { const w = run(t); if (w) return up(w, 'share'); return t.born > gen - win && t.hist.length >= 1 && t.hist.every((v, i) => !i || v.share > t.hist[i - 1].share); }; // a tactic born inside the window rose from nothing
  for (const x of cl) { const w = run(x.t); x.crowd = !!(w && up(w, 'share') && down(w, 'ret')); x.cannibal = null;
    if (w && down(w, 'share') && w[w.length - 1].ret < w[0].ret) { let near = null; for (const y of cl) { if (y === x) continue; const d = dist(x.cx, y.cx); if (!near || d < near[1]) near = [y, d]; } if (near && rose(near[0].t)) x.cannibal = near[0].t.id; } }
  const died = prev.filter((p) => !live.has(p.id)).map((p) => { let near = null; for (const y of cl) { const d = dist(p.cx, y.cx); if (!near || d < near[1]) near = [y.t.id, d]; } const L = p.hist[p.hist.length - 1]; return { id: p.id, name: p.name, age: gen - p.born, lastShare: L ? r2x(L.share) : null, into: near ? near[0] : null }; });
  S.live = live; S.of = of; S.prevT = W.t;
  const r3x = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const list = cl.map((x) => ({ id: x.t.id, name: x.name, n: x.idx.length, share: r3x(x.share), ret: x.ret.map(r3x), retMark: x.retM.map(r3x), fit: r3x(x.fit), age: gen - x.t.born, born: x.t.born, parent: x.t.parent, parentDist: x.t.born === gen && x.t.pd != null && Number.isFinite(x.t.pd) ? r2(x.t.pd) : null, dist: x.d == null ? null : r2(x.d),
    from: x.from, src: x.src, crowding: x.crowd, cannibalizedBy: x.cannibal, top: x.top.map((j) => [F[j], r2(x.z[j]), r3x(x.raw[j])]) }));
  const out = { k: km.k, sil: r3x(km.sil), bots: n, unprofiled: rule.length - n, list, died, born: list.filter((t) => t.born === gen).map((t) => t.id) };
  (W.tacticHist ||= []).push({ gen, t: W.t, k: km.k, sil: out.sil, tactics: list.map((t) => [t.id, t.n, t.share, t.ret[0], t.retMark[0], t.crowding ? 1 : 0, t.cannibalizedBy]), born: out.born, died: died.map((d) => d.id) });
  return out;
}
// Exits and entries between generation ends (population diagnostics)
function noteExit(W, b, cause) { const io = (W.genIO ||= { exits: [], newcomers: 0, heirs: 0 }); const ws = W.bots.map((x) => x.nwh?.[x.nwh.length - 1] ?? 0).sort((a, b) => a - b), w = b.nwh?.[b.nwh.length - 1] ?? 0; let lo = 0; while (lo < ws.length && ws[lo] < w) lo++; io.exits.push([cause, W.t - (b.joined ?? b.born ?? 0), Math.min(9, Math.floor((10 * lo) / Math.max(1, ws.length)))]); }
const AGE_BINS = [20, 40, 100, 200, Infinity], AGE_LABELS = ['<20', '20–40', '40–100', '100–200', '200+'];
function genDiag(W, rule) {
  const cfg = W.cfg, G = { gen: W.t / cfg.weeksPerGeneration, t: W.t }, nn = rule.filter((b) => b.g?.nn);
  // returns at marks and at selling value (whatever fitnessValue is), and how each carries over between generations
  for (const b of rule) { const rb = (realValue(W, b) - (b.exo || 0)) / Math.max(50 * cfg.coinScale, b.genStartBid ?? b.genStart ?? realValue(W, b)) - 1; b.rocM = [...(b.rocM || []), b.rocMark].slice(-2); b.rocB = [...(b.rocB || []), rb].slice(-2); }
  const both = (k) => rule.filter((b) => b[k]?.length === 2), pm = both('rocM'), pb = both('rocB');
  G.persistMark = pm.length > 10 ? spearman(pm.map((b) => b.rocM[0]), pm.map((b) => b.rocM[1])) : null;
  G.persistBid = pb.length > 10 ? spearman(pb.map((b) => b.rocB[0]), pb.map((b) => b.rocB[1])) : null;
  // crowding: the share of the population that got its networks (copied or inherited) from the last generation's top 10%
  const prevTop = W.genTop || null, since = W.genPrevT ?? 0;
  G.fromTop = prevTop && rule.length ? r2x(rule.filter((b) => b.srcT != null && b.srcT >= since && prevTop.has(b.src)).length / rule.length) : null;
  { const lin = new Map(); for (const b of rule) lin.set(b.lineage, (lin.get(b.lineage) || 0) + 1); G.lineTop = rule.length ? r2x(Math.max(...lin.values()) / rule.length) : null; }
  // how alike the card networks are: mean pairwise cosine distance on 50 bots spread evenly by id; copies against their sources
  if (nn.length > 2) { const byId = nn.slice().sort((a, b) => a.id - b.id), m = Math.min(50, byId.length), smp = Array.from({ length: m }, (_, i) => byId[Math.floor((i * byId.length) / m)]); let s2 = 0, c = 0; for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) { s2 += cosDist(smp[i].g.card, smp[j].g.card); c++; } G.netDist = c ? r2x(s2 / c) : null;
    const alive = new Map(W.bots.map((b) => [b.id, b])), pairs = nn.filter((b) => b.srcT != null && b.srcT >= since && alive.get(b.src)?.g?.nn); G.netDistCopies = pairs.length ? r2x(pairs.reduce((a, b) => a + cosDist(b.g.card, alive.get(b.src).g.card), 0) / pairs.length) : null; G.copies = pairs.length; }
  Object.assign(G, strategyClusters(nn) || { clusters: null, clusterTop: null, clusterSil: null });
  { // behaviour distance (the one fitness sharing uses): median RMS distance between bots' responses, all pairs on the sample and copies vs sources
    const P = probeCards(), buf = bufs(CARD_SHAPE), resp = (b) => { const v = []; for (const x of P) { const o = forwardCard(b.g.card, x, buf); for (let j = 0; j < o.length; j++) v.push(Math.tanh(o[j])); } return v; }, rms = (a, c) => { let s2 = 0; for (let k = 0; k < a.length; k++) s2 += (a[k] - c[k]) ** 2; return Math.sqrt(s2 / a.length); }, med = (xs) => (xs.length ? r2x(xs.sort((a, b) => a - b)[xs.length >> 1]) : null);
    const byId = nn.slice().sort((a, b) => a.id - b.id), m = Math.min(50, byId.length), smp = Array.from({ length: m }, (_, i) => byId[Math.floor((i * byId.length) / m)]).map(resp), ds = []; for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) ds.push(rms(smp[i], smp[j]));
    const alive = new Map(W.bots.map((b) => [b.id, b])), cp = nn.filter((b) => b.srcT != null && b.srcT >= since && alive.get(b.src)?.g?.nn).map((b) => rms(resp(b), resp(alive.get(b.src)))); foldKey = null;
    G.respDist = med(ds); G.respDistCopies = med(cp); G.respNear = ds.length ? r2x(ds.filter((d) => d < (W.cfg.sharingRadius ?? 0.5)).length / ds.length) : null; }
  // learning within a lifetime: trials kept, and whether a kept trial's score predicts the next period's
  const ad = W.adaptGen && W.adaptGen.gen === G.gen ? W.adaptGen : null, AP = W.adaptPairs || [];
  G.adaptKept = ad && ad.run ? r2x(ad.kept / ad.run) : null; G.adaptRun = ad ? ad.run : 0;
  G.adaptFollow = AP.length >= 10 ? spearman(AP.map((x) => x[0]), AP.map((x) => x[1])) : null; G.adaptPairs = AP.length; { const AM = W.adaptPairsM || []; G.adaptFollowMkt = AM.length >= 10 ? spearman(AM.map((x) => x[0]), AM.map((x) => x[1])) : null; W.adaptPairsM = []; }
  { const RJ = W.adaptRej || [], mean = (xs) => (xs.length ? r2x(xs.reduce((a, b) => a + b, 0) / xs.length) : null); G.adaptNextKept = mean(AP.map((x) => x[1])); G.adaptNextRejected = mean(RJ); }
  W.adaptPairs = []; W.adaptRej = [];
  // the wish to leave (quit output), everyone and bots under 40 weeks in the market
  G.quitAll = pctl(nn.map((b) => b._nnQuit)); G.quitNew = pctl(nn.filter((b) => W.t - (b.joined ?? b.born ?? 0) < 40).map((b) => b._nnQuit));
  // the next generation's top 10% by this generation's return
  if (cfg.tactics) G.tactics = tacticTrack(W, rule, G.gen); // what the bots actually did, clustered into tactics followed across generations
  const ranked = rule.slice().sort((x, y) => y.roc - x.roc); W.genTop = new Set(ranked.slice(0, Math.max(1, Math.round(ranked.length / 10))).map((b) => b.id)); W.genPrevT = W.t;
  return G;
}
// Fitness sharing: fitness (shifted positive) ÷ niche count^strength, the niche count = Σ max(0, 1 − d/0.3) over bots
// (itself included), d the RMS distance between two card networks' responses (tanh) to the 24 sample cards
function sharedFitness(rule, strength, radius = 0.5) {
  const P = probeCards(), buf = bufs(CARD_SHAPE), R = rule.map((b) => { if (!b.g?.nn) return null; const v = []; for (const x of P) { const o = forwardCard(b.g.card, x, buf); for (let j = 0; j < o.length; j++) v.push(Math.tanh(o[j])); } return v; }); foldKey = null;
  const fs = rule.map((b) => (Number.isFinite(b.fit) ? b.fit : 0)), lo = Math.min(...fs), hi = Math.max(...fs), eps = 0.01 * Math.max(1e-9, hi - lo), out = new Map();
  rule.forEach((b, i) => { let m = 1; const a = R[i]; if (a) for (let j = 0; j < rule.length; j++) { if (j === i || !R[j]) continue; const c = R[j]; let s2 = 0; for (let k = 0; k < a.length; k++) s2 += (a[k] - c[k]) ** 2; const d = Math.sqrt(s2 / a.length); if (d < radius) m += 1 - d / radius; }
    b._niche = Math.round(m * 100) / 100; out.set(b, (fs[i] - lo + eps) / m ** strength); });
  return out;
}
// A newcomer: a brand-new random network, or (entrants 'offspring') a mutated copy of a parent from the last generation's top
function newcomer(W) {
  const cfg = W.cfg; let parent = null;
  if (cfg.entrants === 'offspring' && W.parentIds?.length) { const alive = new Map(W.bots.map((b) => [b.id, b])), ps = W.parentIds.map((id) => alive.get(id)).filter((b) => b?.g?.nn); if (ps.length) parent = W.pick(ps); }
  const b = parent ? newBot(W, null, parent) : newBot(W, null); if (parent) { b.src = parent.id; b.srcT = W.t; b.offspring = true; }
  b.cash = cfg.startCash * Math.exp(W.gauss() * 0.5); (W.house.mint ||= {}).newcomers = (W.house.mint.newcomers || 0) + b.cash; b.nwh = [b.cash]; b.joined = W.t; W.bots.push(b); (W.genIO ||= { exits: [], newcomers: 0, heirs: 0 }).newcomers++;
  jot(W, { type: 'entered', bot: b.name, kind: ARCH[b.a].label, cash: r2(b.cash), ...(parent ? { parent: parent.name } : {}) }); return b;
}
function genIOClose(W, G) {
  const io = W.genIO || { exits: [], newcomers: 0, heirs: 0 }, cause = {}, age = Object.fromEntries(AGE_LABELS.map((l) => [l, 0])), dec = new Array(10).fill(0);
  for (const [c, a, d] of io.exits) { cause[c] = (cause[c] || 0) + 1; age[AGE_LABELS[AGE_BINS.findIndex((x) => a < x)]]++; dec[d]++; }
  G.exits = io.exits.length; G.exitCause = cause; G.exitAge = age; G.exitDecile = dec; G.entries = io.newcomers; G.heirs = io.heirs; G.population = W.bots.filter((b) => b.kind === 'rule').length;
  W.genIO = { exits: [], newcomers: 0, heirs: 0 };
}
function generationEnd(W) {
  const cfg = W.cfg, gen = W.t / cfg.weeksPerGeneration;
  if (cfg.royalties && !cfg.priceOnly && cfg.royaltyEvery === 'generation') payRoyalties(W, 1);
  if (W.adaptStats) { W.adaptGen = { gen, ...W.adaptStats }; if (W.adaptStats.run) log(W, 'gen', `Generation ${gen}: bots kept ${W.adaptStats.kept} of ${W.adaptStats.run} trial changes to their own networks.`); W.adaptStats = { run: 0, kept: 0 }; }
  if (cfg.royalties && !cfg.priceOnly) { let held = 0; for (const b of W.bots) for (const [id, q] of b.h) held += q * W.cards[id].P; W.royYield = held > 0 ? (W.royGen || 0) / held / cfg.weeksPerGeneration : 0; // the weekly yield actually paid, against marked value
    log(W, 'gen', `Generation ${gen} royalties: ${Math.round(W.royGen || 0).toLocaleString()} coins to card holders (${(W.royYield * 100).toFixed(3)}% of marked value a week).`); W.royGen = 0; }
  for (const b of W.bots) b.seasons++;
  // Fitness: return on the capital the bot started the generation with, from its own decisions only (allowance,
  // royalties and living costs are removed, since no bot chose them)
  const rule = W.bots.filter((b) => b.kind === 'rule');
  const bidFit = cfg.fitnessValue === 'bid', fst = { copies: 0, noBid: 0 };
  for (const b of rule) { const start = Math.max(50 * W.cfg.coinScale, bidFit ? b.genStartBid ?? b.genStart ?? worth(W, b) : b.genStart ?? worth(W, b)); b.roc = ((bidFit ? realValue(W, b, fst) : worth(W, b)) - (b.exo || 0)) / start - 1; b.rocHist = [...(b.rocHist || []), b.roc].slice(-10); const h = b.rocHist.slice(-cfg.nnFitnessGens); b.fit = b.g.nn ? h.reduce((x, y) => x + y, 0) / h.length : b.roc; }
  { // measurement: rank correlation of bots' returns this generation against the last, over bots alive for both
    const xs = rule.filter((b) => b.rocHist?.length >= 2).map((b) => [b.rocHist[b.rocHist.length - 2], b.rocHist[b.rocHist.length - 1]]);
    if (xs.length > 10) { const rank = (a) => { const s2 = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; s2.forEach(([, i], k) => (r[i] = k)); return r; }, r1 = rank(xs.map((x) => x[0])), r2_ = rank(xs.map((x) => x[1])), n = xs.length; let dd = 0; for (let k = 0; k < n; k++) dd += (r1[k] - r2_[k]) ** 2; W.genPersist = Math.round((1 - (6 * dd) / (n * (n * n - 1))) * 1000) / 1000; } }
  for (const b of rule) b.rocMark = bidFit ? (worth(W, b) - (b.exo || 0)) / Math.max(50 * W.cfg.coinScale, b.genStart ?? worth(W, b)) - 1 : b.roc;
  const G = genDiag(W, rule);
  const shF = (cfg.fitnessSharing || 0) > 0 ? sharedFitness(rule, cfg.fitnessSharing, cfg.sharingRadius ?? 0.5) : null, fitOf = (b) => (shF ? shF.get(b) : b.fit);
  if (shF) G.sharing = { strength: cfg.fitnessSharing, niche: pctl(rule.map((b) => b._niche ?? 1)) };
  { const rk = rule.slice().sort((x, y) => fitOf(y) - fitOf(x)); W.parentIds = rk.slice(0, Math.max(1, Math.round(rk.length * cfg.evolveShare))).map((b) => b.id); } // the parents newcomers come from (entrants 'offspring')
  if (cfg.evolve && rule.length > 4) {
    const ranked = rule.slice().sort((x, y) => fitOf(y) - fitOf(x)), n = Math.max(1, Math.round(ranked.length * cfg.evolveShare));
    const best = ranked.slice(0, n), worst = ranked.slice(-n);
    for (const b of worst) { const m = W.pick(best); const before = ARCH[b.a].label; b.g = mutate(W, m.g); b._ad = null; b.a = styleOf(b.g.w); b.gen = m.gen + 1; b.lineage = m.lineage ?? m.id; b.adopted = (b.adopted || 0) + 1; b.src = m.id; b.srcT = W.t; jot(W, { type: 'adopted', bot: b.name, from: m.name, before, after: ARCH[b.a].label, roc: r2(b.roc), mentorRoc: r2(m.roc) }); }
    const kinds = (xs) => Object.entries(xs.reduce((o, b) => ((o[ARCH[b.a].label] = (o[ARCH[b.a].label] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
    log(W, 'evolve', `Generation ${gen}: best returns ${best.slice(0, 3).map((b) => `${b.name} ${b.roc >= 0 ? '+' : ''}${Math.round(b.roc * 100)}%`).join(', ')}. The ${n} worst-returning bots adopt their strategies and keep their own capital (now ${kinds(worst)}).`);
  }
  if (cfg.mortality) {
    let died = 0, born = 0;
    for (const b of rule) {
      if (b.lifespan == null) b.lifespan = cfg.lifespan[0] + Math.floor(W.rand() * (cfg.lifespan[1] - cfg.lifespan[0] + 1));
      if (b.seasons < b.lifespan) continue;
      const heirs = Array.from({ length: cfg.heirs }, () => { const h = newBot(W, null, b); h.cash = 0; h.lineage = b.lineage ?? b.id; h.src = b.id; h.srcT = W.t; h.lifespan = cfg.lifespan[0] + Math.floor(W.rand() * (cfg.lifespan[1] - cfg.lifespan[0] + 1)); return h; });
      const lots = cfg.estateSale > 0 ? estateSale(W, b) : [];
      noteExit(W, b, 'died (heirs took over)'); (W.genIO ||= { exits: [], newcomers: 0, heirs: 0 }).heirs += heirs.length; settleEstate(W, b, heirs); died++; born += heirs.length;
      for (const [id, q] of lots) { const c = W.cards[id]; give(heirs[0], c, q); for (let k = 0; k < q; k++) { if (!listAuction(W, heirs[0], c, NO_MIN)) break; (W.forcedWeek ||= {}).estate = (W.forcedWeek.estate || 0) + 1; } }
    }
    // OLD RULE capPoorest: too many heirs and the poorest leave the market (their cards are sold, their loans settled)
    const cap = cfg.capPoorest ? Math.round(popOf(W) * cfg.populationCap) : Infinity;
    const poorest = W.bots.filter((b) => b.kind === 'rule').map((b) => [b, worth(W, b)]).sort((x, y) => x[1] - y[1]);
    let out = 0; while (W.bots.filter((b) => b.kind === 'rule').length > cap && poorest.length) { removeBot(W, poorest.shift()[0], 'priced out'); out++; }
    if (died) log(W, 'evolve', `Generation ${gen}: ${died} bots die of old age; their estates pass to ${born} heirs carrying their strategies${out ? `, and ${out} of the poorest bots leave the market` : ''}.`);
  }
  for (const b of W.bots) { b.genStart = worth(W, b); b.genStartBid = realValue(W, b); b.exo = 0; } // the selling-value start is kept whatever fitnessValue is (diagnostics); only 'bid' fitness reads it
  genIOClose(W, G); W.genRec = G;
  if (bidFit) W.fitStats = { gen, copies: fst.copies, noBid: fst.noBid, shareNoBid: fst.copies ? fst.noBid / fst.copies : 0 };
}
// Estate sale: estateSale of each holding (an even share, the fraction rounded with W.rand, so no card is picked) is sold
// before the heirs inherit: into the best standing bids, the proceeds joining the estate's cash; what doesn't sell is
// returned for the heir to put up at auction with no minimum
function estateSale(W, b) {
  const unsold = [];
  for (const [id, q] of [...b.h]) { const want = q * W.cfg.estateSale, k = Math.floor(want) + (W.rand() < want - Math.floor(want) ? 1 : 0); if (!k) continue; const c = W.cards[id]; let left = k;
    for (const o of leftBids(c)) { if (left <= 0) break; if (o.b === b || blocked(o.b, b)) continue; if (xfer(W, c, o.b, b, o.p, o)) { o.used = true; left--; (W.forcedWeek ||= {}).estate = (W.forcedWeek.estate || 0) + 1; } }
    if (left > 0) { const have = b.h.get(id) || 0, take = Math.min(left, have); if (take) { give(b, c, -take); unsold.push([id, take]); } } }
  return unsold;
}
// An estate passes to heirs in equal shares: cash, every card copy (with its cost), loans in both directions, notes
function settleEstate(W, b, heirs) {
  const k = heirs.length;
  for (const h of heirs) { h.cash = b.cash / k; h.notes = new Map(b.notes); h.friends = new Set(b.friends); h.flags = new Set(b.flags); h.social = b.social; h.gen = b.gen + 1; W.bots.push(h); }
  let i = 0;
  for (const [id, q] of b.h) { const lots = b.lots?.get(id) || []; for (let u = 0; u < q; u++) { const h = heirs[i++ % k]; give(h, W.cards[id], 1); addLot(h, W.cards[id], lots[u]?.[0] ?? W.cards[id].F, lots[u]?.[1] ?? W.t); } }
  for (const uid of b.items || []) { const it = W.items.get(uid), h = heirs[i++ % k]; if (!it) continue; it.owner = h; (h.items ||= new Set()).add(uid); }
  for (const L of W.loans || []) {
    if (L.lender === b) { const h = heirs[i++ % k]; L.lender = h; h.lent = (h.lent || 0) + L.amount; }
    if (L.borrower === b) { const h = heirs[i++ % k]; L.borrower = h; h.debt = (h.debt || 0) + L.amount; }
  }
  { const h = heirs[0]; for (const L of W.cardLoans || []) { if (L.lender === b) { L.lender = h; bump(h, 'lentOut', L.id, 1); } if (L.borrower === b) { L.borrower = h; bump(h, 'owed', L.id, 1); } } h.shortColl = (h.shortColl || 0) + (b.shortColl || 0); }
  for (const h of heirs) { h.nwh = [worth(W, h)]; h.genStart = h.nwh[0]; h.genStartBid = realValue(W, h); }
  W.bots = W.bots.filter((x) => x !== b);
  for (const x of W.bots) { if (x.flags.delete(b.id)) for (const h of heirs) { x.flags.add(h.id); h.flaggedBy = (h.flaggedBy || 0) + 1; h.lastCaught = b.lastCaught ?? W.t; } if (x.friends.delete(b.id)) for (const h of heirs) x.friends.add(h.id); }
  jot(W, { type: 'died', bot: b.name, age: b.seasons, estate: r2(heirs.reduce((s, h) => s + worth(W, h), 0)), heirs: heirs.map((h) => h.name) });
}
// A bot leaving the market: its cards go to the liquidator; loans it made are forgiven, loans it owes default
export function removeBot(W, b, reason) {
  noteExit(W, b, reason);
  const w = worth(W, b); (W.house.mint ||= {}).leavers = (W.house.mint.leavers || 0) + Math.max(0, b.cash);
  for (const [id, q] of b.h) toLiq(W, id, q);
  for (const uid of b.items || []) { const it = W.items.get(uid); if (it) { it.owner = null; W.liqItems.push(uid); } }
  for (const L of W.loans || []) {
    if (L.lender === b && L.amount > 0) { L.borrower.debt -= L.amount; L.amount = 0; }
    if (L.borrower === b && L.amount > 0) { L.lender.lent -= L.amount; L.amount = 0; }
  }
  for (const L of (W.cardLoans || []).slice()) { if (L.lender === b) closeLoan(W, L, 'lender left', W.cards[L.id].P, true); else if (L.borrower === b) closeLoan(W, L, 'borrower left', W.cards[L.id].P, false); }
  W.bots = W.bots.filter((x) => x !== b);
  for (const x of W.bots) { x.flags.delete(b.id); x.friends.delete(b.id); }
  jot(W, { type: 'exited', bot: b.name, kind: ARCH[b.a].label, worth: r2(w), reason });
}
function detect(W) {
  const p = W.hist.p;
  if (p.length > 5) {
    const now = p[p.length - 1], past = p[p.length - 5]; // the Vault index against its own value 4 weeks earlier (like with like)
    if (now < past * 0.88 && !(W.cool.crash > W.t)) { log(W, 'crash', `Crash: the price index fell ${Math.round((1 - now / past) * 100)}% in four weeks.`); W.cool.crash = W.t + 12; }
    if (now > past * 1.15 && !(W.cool.boom > W.t)) { log(W, 'bubble', `Rally: the price index rose ${Math.round((now / past - 1) * 100)}% in four weeks.`); W.cool.boom = W.t + 12; }
  }
  const pm = W.hist.pMark || []; if (pm.length > 5) { const now = pm[pm.length - 1], past = pm[pm.length - 5]; // the same detector on the marks index
    if (now < past * 0.88 && !(W.cool.crashM > W.t)) { log(W, 'crash', `Crash in marks: every card's mark fell ${Math.round((1 - now / past) * 100)}% in four weeks.`); W.cool.crashM = W.t + 12; }
    if (now > past * 1.15 && !(W.cool.boomM > W.t)) { log(W, 'bubble', `Rally in marks: every card's mark rose ${Math.round((now / past - 1) * 100)}% in four weeks.`); W.cool.boomM = W.t + 12; } }
  const bub = bubble(W);
  if (bub > 1.3 && !W.bubbleOn) { W.bubbleOn = true; log(W, 'bubble', `Bubble: cards trade at ${bub.toFixed(2)}× their hidden value on average.`); }
  if (bub < 1.12) W.bubbleOn = false;
  if (W.t % 4 === 0) for (const b of W.bots) for (const [id, q] of b.h) {
    const c = W.cards[id], key = b.id + ':' + id;
    if (c.circ >= 8 && q / c.circ > 0.5 && !W.cornered.has(key)) { W.cornered.add(key); log(W, 'corner', `Corner: ${b.name} (${ARCH[b.a].label}) holds ${q} of the ${c.circ} ${c.name} cards in circulation (${Math.round((q / c.circ) * 100)}%).`); }
  }
}

/* ---------- Metrics ---------- */
// The Vault index, repeat-sales (as house-price indices are built): every card that traded is paired with its own previous
// trade. Each week the last 104 weeks of the index are estimated together from all their pairs by least squares (each pair:
// log index then − log index at the earlier trade = that card's log change), with the weeks before fixed. A very small
// smoothness term bridges weeks without trades; the pairs decide everything else. Cards that didn't trade drop out instead of
// holding it flat. Earlier weeks are revised as new pairs arrive; the chart shows each week's value as it was published.
function repeatSales(W) {
  const L = (W.rsLog ||= [0]), WIN = 104, all = (W.rsAll ||= []);
  for (const [t0, d] of W.rsPairs || []) all.push([t0, W.t, Math.max(-2, Math.min(2, d))]); W.rsPairs = [];
  W.rsAll = all.filter((x) => x[1] > W.t - WIN);
  const start = Math.max(1, W.t - WIN + 1), n = W.t - start + 1; if (n <= 0) return 100 * Math.exp(L[W.t] ?? 0);
  const A = Array.from({ length: n }, () => new Float64Array(n)), rhs = new Float64Array(n), known = (t) => L[t] ?? L[L.length - 1] ?? 0;
  for (const [t0, t1, d] of W.rsAll) { const i1 = t1 - start; if (i1 < 0) continue;
    if (t0 >= start) { const i0 = t0 - start; A[i1][i1] += 1; A[i0][i0] += 1; A[i1][i0] -= 1; A[i0][i1] -= 1; rhs[i1] += d; rhs[i0] -= d; }
    else { A[i1][i1] += 1; rhs[i1] += d + known(t0); } }
  const lam = 1e-3; // smoothness between neighbouring weeks
  for (let i = 0; i < n; i++) { if (i === 0) { A[0][0] += lam; rhs[0] += lam * known(start - 1); } else { A[i][i] += lam; A[i - 1][i - 1] += lam; A[i][i - 1] -= lam; A[i - 1][i] -= lam; } }
  for (let c = 0; c < n; c++) { let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; [rhs[c], rhs[piv]] = [rhs[piv], rhs[c]];
    const d = A[c][c] || 1e-12; for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; rhs[r] -= f * rhs[c]; } }
  const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let v = rhs[r]; for (let k = r + 1; k < n; k++) v -= A[r][k] * x[k]; x[r] = v / (A[r][r] || 1e-12); }
  for (let i = 0; i < n; i++) L[start + i] = x[i];
  return 100 * Math.exp(L[W.t]);
}
export function idx(W, which) { let a = 0, b = 0; for (const c of W.cards) { a += (which === 'P' ? c.P : c.F) * c.S0; b += c.P0 * c.S0; } return (100 * a) / b; }
export function bubble(W) { let a = 0, b = 0; for (const c of W.cards) { a += c.P * c.circ; b += c.F * c.circ; } return b ? a / b : 1; }
export function gini(xs) { const s = xs.slice().sort((a, b) => a - b), n = s.length, tot = s.reduce((a, b) => a + b, 0); if (!tot) return 0; let g = 0; s.forEach((x, i) => (g += (2 * (i + 1) - n - 1) * x)); return g / (n * tot); }
function record(W) {
  const nws = W.bots.map((b) => worth(W, b)), tot = nws.reduce((a, b) => a + b, 0) || 1;
  assignGroups(W); const share = GROUPS.map(() => 0); W.bots.forEach((b, i) => (share[b._grp] += nws[i] / tot));
  const h = W.hist;
  h.p.push(W.cfg.vaultIndex === 'basket' ? idx(W, 'P') : repeatSales(W)); (h.pMark ||= []).push(idx(W, 'P')); /* the marks index: a basket of every card's mark */ h.f.push(idx(W, 'F')); h.bub.push(bubble(W)); h.gini.push(gini(nws)); h.share.push(share); h.trades.push(W.lastTrades);
  h.money.push(W.bots.reduce((s, b) => s + b.cash, 0));
  { // what the bots chose about cash and credit this week (network outputs), and what the credit market did
    const nn = W.bots.filter((b) => b.g?.nn), byW = nn.map((b) => [b, worth(W, b)]).sort((a, b) => b[1] - a[1]), top = byW.slice(0, Math.max(1, Math.round(byW.length / 10))).map((x) => x[0]);
    const q = (xs) => { const s = xs.slice().sort((a, b) => a - b), at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return s.length ? [r2x(s.reduce((a, b) => a + b, 0) / s.length), r2x(at(0.1)), r2x(at(0.5)), r2x(at(0.9))] : null; };
    const stat = (bs) => Object.fromEntries(['keep', 'lendShare', 'lendRate', 'lev', 'maxRate'].map((k) => [k, q(bs.map((b) => b.g[k] ?? 0))]));
    const C = W.credit || {}; W.creditLog = { all: stat(nn), top: stat(top), offered: Math.round(C.offered || 0), asked: Math.round(C.asked || 0), lent: Math.round(C.lent || 0), repaidMaturity: Math.round(C.repaid || 0), repaidForced: Math.round(C.repaidForced || 0) };
  }
  { // coins created and removed this week (bots' cash), by kind; "other" is whatever no tag covers, so the totals add up
    const m = W.house.mint || {}, now = { allowance: m.allowance || 0, royalties: m.royalties || 0, outsideIn: m.outsideIn || 0, prizes: m.prizes || 0, newcomers: m.newcomers || 0, taxBack: m.taxBack || 0, dealerNet: (m.dealerIn || 0) - (m.dealerOut || 0),
      living: m.living || 0, fees: W.house.fees || 0, packs: W.house.packRevenue || 0, outsideOut: (m.outsideOut || 0) - (m.liqOut || 0) - (m.storeOut || 0), liqOut: m.liqOut || 0, storeOut: m.storeOut || 0, holding: m.holding || 0, wealthTax: m.wealthTax || 0, shocks: m.shocks || 0, leavers: m.leavers || 0 };
    const pv = W._mPrev || now, d = Object.fromEntries(Object.entries(now).map(([k, v]) => [k, v - (pv[k] || 0)])); W._mPrev = now;
    const created = { allowance: d.allowance, royalties: d.royalties, 'outside buyers': d.outsideIn, prizes: d.prizes, newcomers: d.newcomers, 'wealth tax paid back': d.taxBack, 'dealers (net)': d.dealerNet };
    const removed = { 'living costs': d.living, 'trade fees': d.fees, packs: d.packs, 'liquidator sales': d.liqOut, 'Vault store': d.storeOut, 'outside sellers': d.outsideOut, 'holding costs': d.holding, 'wealth tax': d.wealthTax, 'cash shocks': d.shocks, 'bots that left': d.leavers };
    const c = Object.values(created).reduce((a, b) => a + b, 0), r = Object.values(removed).reduce((a, b) => a + b, 0), cashNow = h.money[h.money.length - 1], cashPrev = h.money.length > 1 ? h.money[h.money.length - 2] : cashNow;
    W.moneyWeek = { created, removed, other: cashNow - cashPrev - (c - r), net: cashNow - cashPrev, totalIn: c, totalOut: r };
  } h.pass.push(W.passPrice); h.shares.push(W.week.shares); h.thefts.push(W.week.thefts); h.gamePacks.push(W.gamePacksWeek || 0);
  let known = 0; for (const b of W.bots) for (const n of b.notes.values()) if (fresh(W, n)) known++;
  h.informed.push(known / Math.max(1, W.bots.length)); h.flags.push(W.bots.reduce((s, b) => s + b.flags.size, 0));
}
export function log(W, kind, text) { if (W.t > 0 && LEAGUE_NEWS.has(kind)) (W.newsWk ||= [])[W.t] = ((W.newsWk[W.t]) || 0) + 1; W.events.unshift({ t: W.t, kind, text }); if (W.events.length > 160) W.events.pop(); }

/* ---------- Observation for an AI bot ---------- */
export function observe(W, b, { marketRows = W.cfg.marketRows ?? 40, marketPage = b.marketPage || 0 } = {}) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const row = (c) => { const n = b.notes.get(c.pid); return [c.key, c.team, r2(c.P), r2(ret(c, 4) * 100), recentVol(c, 4), c.circ, b.h.get(c.id) || 0, r2(c.mult), n ? r2(n.est * c.mult) : null]; };
  const notes = {}; for (const [pid, n] of b.notes) { const p = W.players[pid]; if (p) notes[p.key] = { estimatePrizmBase: r2(n.est), weeksOld: W.t - n.week, from: n.from, ...(n.facts ? { facts: n.facts } : {}) }; }
  const ids = new Set([...hot.slice(marketPage * marketRows, (marketPage + 1) * marketRows).map((c) => c.id), ...b.h.keys(), ...[...b.notes.keys()].map((pid) => mktId(pid, 0, 0))].filter((id) => W.cards[id] && W.cards[id].on !== false));
  const packs = Object.fromEntries(Object.keys(PACK_TYPES).map((t) => { const pk = packInfo(W, t), P = PACK_TYPES[t], dt = P.des.reduce((a, x) => a + x, 0); return [t, { name: P.label, price: r2(pk.price), cards: P.size, playerTierOdds: Object.fromEntries(TIERS.map((x, i) => [x, P.tiers[i] + '%'])), designOdds: Object.fromEntries(DESIGNS.map((x, i) => [x, r2((P.des[i] / dt) * 100) + '%'])), altKitChance: P.kit[0], throwbackKitChance: P.kit[1], prizmParallelOdds: Object.fromEntries(PRIZM.map((z, i) => [`${z.c} /${z.run}`, P.prizm[i]])) }]; }));
  const label = (a) => (a.uid ? W.items.get(a.uid)?.label : W.cards[a.cardId].key);
  const others = W.bots.filter((x) => x !== b).sort((x, y) => worth(W, y) - worth(W, x)).slice(0, 12).map((x) => ({ name: x.name, kind: ARCH[x.a].label, notes: x.notes.size, friendsWithYou: x.friends.has(b.id), flaggedYou: x.flags.has(b.id) }));
  return {
    week: W.t + 1, generation: Math.floor(W.t / W.cfg.weeksPerGeneration) + 1, season: W.seasonLabel || W.timeline?.seasons[0].season || null,
    you: { name: b.name, ...(b.kind === 'ai' && b.lifespanW ? { ageWeeks: W.t - b.born, lifespanWeeksRange: W.cfg.aiLifespanWeeks, generationOfYourLine: b.line || 1 } : {}), cash: r2(b.cash), worth: r2(worth(W, b)), debt: r2(b.debt || 0), lentOut: r2(b.lent || 0), borrowLimit: r2(W.cfg.credit ? Math.max(0, W.cfg.maxLTV * holdingsValue(W, b) - (b.debt || 0)) : 0), creditMarketRate: W.credit?.rate ?? null, yourLoans: (W.loans || []).filter((L) => L.borrower === b || L.lender === b).slice(0, 12).map((L) => ({ role: L.borrower === b ? 'borrowed' : 'lent', with: (L.borrower === b ? L.lender : L.borrower).name, amount: r2(L.amount), weeklyRate: L.rate, dueWeek: L.due })), livingCostNextWeek: r2(W.cfg.livingCost + W.cfg.lifestyle * Math.max(0, worth(W, b))), researchPasses: b.passes.filter((e) => e > W.t + 1).length + W.cfg.passesPerWeek, notesKept: b.notes.size, botsThatFlaggedYou: W.bots.filter((x) => x.flags.has(b.id)).length, friends: [...b.friends].map((id) => W.bots.find((x) => x.id === id)?.name).filter(Boolean), memo: b.memo },
    lastWeek: { yourFills: W.fills?.get(b.id) || [], researchResults: b.inbox || [], lastSteal: b.lastSteal || null },
    market: { page: marketPage, pages: Math.max(1, Math.ceil(hot.length / Math.max(1, marketRows))), columns: ['card', 'team', 'price', 'change4wPct', 'trades4w', 'inCirculation', 'youHold', 'rarityPremium', 'yourEstimateForThisCard'], rows: [...ids].map((id) => row(W.cards[id])).sort((x, y) => y[4] - x[4] || y[2] - x[2]) },
    yourNotes: notes,
    yourShorts: (W.cardLoans || []).filter((L) => L.borrower === b).map((L) => ({ card: W.cards[L.id].key, soldAt: r2(L.entry), priceNow: r2(W.cards[L.id].P), weeksLeft: L.due - W.t, forcedToBuyBack: !!L.force })),
    cardsYouLentOut: (W.cardLoans || []).filter((L) => L.lender === b).length,
    cardLending: W.cfg.shorting ? { weeklyFeeShareOfPrice: W.cfg.cardLendFee, collateralShareOfPrice: W.cfg.shortMargin, returnWithinWeeks: W.cfg.cardLoanWeeks, lendableCopiesInTheMarket: [...(W.lendable?.values() || [])].reduce((x, y) => x + y, 0) } : null,
    yourOneOfAKindCards: { columns: ['id', 'card', 'youPaid', 'plainCardPrice', 'premiumOverPlainCard'], rows: itemsOf(W, b).map((it) => [it.uid, it.label, it.cost == null ? null : r2(it.cost), r2(W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)].P), r2(it.mult / (it.d === 4 ? FINISH_MULT[it.f] : FINISH_MULT[it.f] * DESIGN_MULT[it.d]))]) },
    packs: { types: packs, cardsLeftInPool: packInfo(W).tot },
    researchPassMarket: { lastPrice: W.passPrice === null ? null : r2(W.passPrice), tradedLastWeek: W.passTrades },
    gameTicketMarket: { lastPrice: W.ticketPrice === null ? null : r2(W.ticketPrice), tradedLastWeek: W.ticketTrades, yourTickets: b.tickets.length },
    auctions: { open: W.auctions.filter((a) => a.seller !== b).map((a) => ({ auctionId: a.id, card: label(a), ...(a.uid ? { oneOfAKind: true } : {}), reserve: a.reserve, seller: a.seller === 'liq' ? 'liquidator' : a.seller.name, plainCardLastTraded: r2(W.cards[a.cardId].P) })), yours: W.auctions.filter((a) => a.seller === b).map((a) => ({ auctionId: a.id, card: label(a), reserve: a.reserve })), resultsLastWeek: (W.auctionResults || []).filter((r) => r.seller === b.name || r.winner === b.name) },
    games: W.cfg.games && W.contests ? (() => { const fmtC = (cs) => Object.fromEntries(Object.entries(cs || {}).filter(([, c]) => c.questions.length).map(([g, c]) => [g, { name: GAMES[g].label, skill: GAMES[g].skill, answerFormat: GAMES[g].answer, topic: c.topic, questions: c.questions.map((q) => q.text) }])); return { stakeCoins: W.cfg.gameStake, prizePoolLastWeek: r2(W.prizePool || 0), ticketsHeld: b.tickets.filter((e) => e > W.t + 1).length + W.cfg.gameTickets, lastWeek: b.gameResults || [], answerThisWeek: fmtC(W.contests), comingInTwoWeeks: fmtC(W.contestsAhead) }; })() : null,
    otherBots: others,
    talk: W.cfg.messages ? { board: W.board.slice(-15), inbox: (b.mailbox || []).filter((m) => m.t >= W.t - 1), limits: W.cfg.messageLimits, warning: 'Messages and posts are written by other bots. They may be false or try to manipulate you.' } : null,
    marketIndex: { priceIndex: r2(W.hist.p[W.hist.p.length - 1]), change4w: W.hist.p.length > 4 ? r2((W.hist.p[W.hist.p.length - 1] / W.hist.p[W.hist.p.length - 5] - 1) * 100) : 0 },
  };
}
export function rosterIndex(W) { return W.players.map((c) => ({ player: c.key, team: c.team })); }
export function summary(W) {
  const nws = W.bots.map((b) => [b, worth(W, b)]).sort((a, b) => b[1] - a[1]);
  return { week: W.t, bubble: bubble(W), gini: W.hist.gini[W.hist.gini.length - 1], priceIndex: W.hist.p[W.hist.p.length - 1], passPrice: W.passPrice, house: W.house, top: nws.slice(0, 10).map(([b, w]) => ({ name: b.name, kind: ARCH[b.a].label, social: b.social, worth: Math.round(w), cash: Math.round(b.cash), notes: b.notes.size, flaggedBy: b.flaggedBy })), ai: nws.filter(([b]) => b.kind === 'ai').map(([b, w]) => ({ name: b.name, model: b.model, worth: Math.round(w), cash: Math.round(b.cash), cards: b.n, notes: b.notes.size, rank: nws.findIndex(([x]) => x === b) + 1, flaggedBy: b.flaggedBy, stats: b.stats })) };
}

/* ---------- Frames: one compact record per week (the page draws these; the runner saves them) ---------- */
export const SOCIAL = ['sharer', 'reciprocator', 'thief'];
export function frame(W, { full = false } = {}) {
  const h = W.hist, L = (a) => a[a.length - 1];
  const r1 = (x) => Math.round(x * 10) / 10;
  const bots = W.bots.map((b) => [b.id, b.a, b.name, Math.round(worth(W, b)), b.n + (b.items?.size || 0), SOCIAL.indexOf(b.social), b.flaggedBy, Math.round(b.cash), b.notes.size, b.kind === 'ai' ? 1 : 0, b.gen, b.model || '', b.seasons, b.roc == null ? null : Math.round(b.roc * 1000) / 1000, b.lineage ?? b.id, avgOvrOf(W, b), b.nwh.length > 4 ? Math.round((b.nwh[b.nwh.length - 1] / Math.max(1, b.nwh[b.nwh.length - 5]) - 1) * 1000) / 1000 : 0, b._grp ?? 2, b.g?.nn ? 1 : 0]);
  const hotNow = W.players.slice().sort((x, y) => recentVol(y, 20) - recentVol(x, 20)).slice(0, 6).map((c) => [c.id, r1(c.P), r1(c.F), recentVol(c, 20), circOf(W, c), c.pool]);
  const f = {
    t: W.t,
    pk: Object.fromEntries(Object.keys(PACK_TYPES).map((t) => [t, [Math.round(packInfo(W, t).price || 0), W.packWeek?.[t]?.sold ?? 0]])), // each pack type's price now and packs sold this week
    ...(guideOn(W.cfg) ? { guideT: W.guideT ?? null, guideUse: W.guideUse?.n ? Math.round((W.guideUse.s / W.guideUse.n) * 1000) / 1000 : null, ...(W.guideT === W.t ? { guide: W.players.map((p) => (p.guide > 0 ? Math.round(p.guide * 100) / 100 : null)) } : {}) } : {}),
    h: { p: L(h.p), pMark: h.pMark?.length ? L(h.pMark) : null, f: L(h.f), bub: L(h.bub), gini: L(h.gini), share: L(h.share), trades: L(h.trades), money: Math.round(L(h.money)), pass: L(h.pass), informed: L(h.informed), flags: L(h.flags), shares: L(h.shares), thefts: L(h.thefts), gamePacks: L(h.gamePacks) },
    bots, arcs: W.arcsWeek.slice(), hot: hotNow,
    events: W.events.filter((e) => e.t === W.t),
    researched: [...W.week.researched].sort((a, b) => b[1] - a[1]).slice(0, 5),
    jn: [...W.journal.filter((j) => j.type === 'aiActions' || j.type === 'post' || j.type === 'message'), ...W.journal.filter((j) => !['aiActions', 'post', 'message'].includes(j.type) && (j.type !== 'game' || j.packs > 0)).slice(-30)].slice(-40),
    tickets: W.ticketPrice,
    gs: W.gameStats ? Object.fromEntries(Object.entries(W.gameStats).map(([g, x]) => [g, [x.entrants, x.pot, x.entrants ? r2(x.scoreSum / x.entrants) : null, x.skillN ? r2(x.skillSum / x.skillN) : null]])) : null,
    garch: W.gameArch ? W.gameArch.map(([e, w, net]) => [e, w, Math.round(net)]) : null,
    topics: W.contests ? Object.fromEntries(Object.entries(W.contests).map(([g, c]) => [g, c.topic])) : null,
    season: W.seasonLabel || W.timeline?.seasons[0].season || null,
    lender: W.lender ? { ltv: r2(W.lender.ltv), rate: Math.round(W.lender.rate * 10000) / 10000 } : null,
    fashion: W.fashion ? W.fashion.map((x) => r2(x)) : null,
    genome: genomeMix(W),
    lineages: lineageStats(W),
    people: W.turnover || null,
    ...(W.entryDiag ? { entry: W.entryDiag } : {}), // the entry multiplier and its components (measurement only)
    mkt: marketStats(W),
    flow: W.flow ? { net: W.flow.net.map(Math.round), realized: W.flow.realized.map(Math.round), trips: W.flow.trips, tax: Math.round(W.flow.tax), paidOut: Math.round(W.flow.paidOut) } : null,
    movers: movers(W),
    top: topCards(W),
    ord: W.ord ? (() => { const ar = W.auctionResults || [], sold = ar.filter((r) => r.winner); const AS = W.aucStats || { sold: 0, coins: 0, free: 0, vs: [] }, vsS = AS.vs.slice().sort((x, y) => x - y); return { aucCardSold: AS.sold, aucFree: AS.free, aucFreeOld: AS.freeOld || 0, aucVsMark: vsS.length >= 5 ? Math.round(vsS[vsS.length >> 1] * 1000) / 1000 : null, bids: W.ord.bids, asks: W.ord.asks, pullUp: W.ord.pullUp, pullDown: W.ord.pullDown, coins: Math.round(W.ord.coins), minted: W.ord.minted, packs: W.house.packs - W.ord.packs, aucListed: ar.length, aucSold: sold.length, aucCoins: Math.round(sold.reduce((s, r) => s + r.price, 0)), flagged: W.bots.filter((b) => b.flaggedBy >= 5).length, due4: (W.loans || []).filter((L) => L.due - W.t <= 4).length, shortCopies: (W.cardLoans || []).length, shortValue: Math.round((W.cardLoans || []).reduce((x, L) => x + W.cards[L.id].P, 0)), shorts: W.ord.shorts || 0, covers: W.ord.covers || 0, forced: W.ord.forced || 0, lendable: [...(W.lendable?.values() || [])].reduce((x, y) => x + y, 0), due4Coins: Math.round((W.loans || []).filter((L) => L.due - W.t <= 4).reduce((x, L) => x + L.amount, 0)), allowance: Math.round(W.flow?.paidOut || 0), prizes: Math.round(W.prizePool || 0) }; })() : null,
    bands: bandBubble(W),
    bandHold: bandHoldings(W),
    sens: W.t % 4 === 0 ? (W.nnSens = nnSensitivity(W)) : null,
    house: { fees: Math.round(W.house.fees), packs: W.house.packs, gamePacks: W.house.gamePacks || 0 },
    newPlayers: W.newPlayers?.length ? W.newPlayers.splice(0) : undefined,
    persist: W.genPersist ?? null, gen: W.genRec ?? null, bookD: bookSummary(W), limits: limitsSummary(W), ...(W.cfg.attention > 0 && W.attDiag ? { attention: { ...W.attDiag } } : {}), adapt: W.adaptGen ? { ...W.adaptGen } : null, lost: W.lostSeason ?? 0,
    why: W.whyWeek || null, forced: W.forcedWeek || null, shocks: W.shockWeek || 0, credit: W.creditLog || null, royYield: W.royYield ?? null, fit: W.fitStats || null,
    money: W.moneyWeek ? { ...W.moneyWeek, created: Object.fromEntries(Object.entries(W.moneyWeek.created).map(([k, v]) => [k, Math.round(v)])), removed: Object.fromEntries(Object.entries(W.moneyWeek.removed).map(([k, v]) => [k, Math.round(v)])), other: Math.round(W.moneyWeek.other), net: Math.round(W.moneyWeek.net), totalIn: Math.round(W.moneyWeek.totalIn), totalOut: Math.round(W.moneyWeek.totalOut) } : null,
    inj: W.L ? W.players.filter((p) => W.era[p.id]?.injured).map((p) => p.id) : undefined,
    league: W.L ? { week: W.L.week, season: W.L.season, champion: W.L.champions[W.L.champions.length - 1] || null, active: W.players.filter((p) => p.lg?.active).length, injured: W.players.filter((p) => W.era[p.id]?.injured).length } : null,
  };
  if (full) {
    f.vol = W.players.map((c) => c.volH[c.volH.length - 1] || 0);
    f.aiDetail = Object.fromEntries(W.bots.filter((b) => b.kind === 'ai').map((b) => [b.name, { cash: Math.round(b.cash), debt: Math.round(b.debt || 0), realized: Math.round(b.stats.realized || 0), positions: [...b.h].map(([id, q]) => [id, q, r1(avgCost(b, id) ?? 0)]), notes: [...b.notes].map(([id, n]) => [id, r1(n.est), n.week]) }]));
    f.aiLog = W.journal.filter((j) => WHO.some((k) => typeof j[k] === 'string' && W.bots.find((b) => b.kind === 'ai' && b.name === j[k])));
    f.si = W.players.map(() => 0); for (const L of W.cardLoans || []) f.si[W.cards[L.id].pid]++;
    f.circ = W.players.map((c) => circOf(W, c)); f.pool = W.players.map((c) => c.pool); f.ovr = W.players.map((c) => W.era?.[c.id]?.ovr ?? null); f.risk = W.players.map((c) => (c.on === false ? null : Math.round(riskRating(W, c) * 10) / 10));
    f.prices = W.players.map((c) => r1(c.P)); if (W.t === 0 || W.cfg.valueModel !== 'formula' || (W.cfg.leagueUpdates && W.t % W.cfg.updateEvery === 0)) f.values = W.players.map((c) => r1(c.F)); }
  return f;
}

// Price ÷ hidden value per family (by circulating supply), and the value each strategy holds in each family.
function famBubble(W) {
  const a = W.families.map(() => 0), b = W.families.map(() => 0);
  for (const c of W.cards) { a[c.fam] += c.P * c.circ; b[c.fam] += c.F * c.circ; }
  return a.map((x, i) => (b[i] ? Math.round((x / b[i]) * 1000) / 1000 : null));
}
function holdings(W) {
  const m = ARCH.map(() => W.families.map(() => 0));
  for (const b of W.bots) for (const [id, q] of b.h) { const c = W.cards[id]; m[b.a][c.fam] += q * c.P; }
  return m.map((row) => row.map((v) => Math.round(v)));
}

// Families (the site's play-style clusters), ordered by position then size. The page uses the same list.
export function familyList(library) {
  const ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'], key = (p) => `${p.family || p.pos}|${p.pos}`;
  const n = {}; library.players.forEach((p) => (n[key(p)] = (n[key(p)] || 0) + 1));
  return Object.keys(n).sort((a, b) => { const [, pa] = a.split('|'), [, pb] = b.split('|'); return ORDER.indexOf(pa) - ORDER.indexOf(pb) || n[b] - n[a] || a.localeCompare(b); }).map((k) => { const [name, pos] = k.split('|'); return { name, pos, n: n[k] }; });
}
export const familyIndex = (fams, p) => fams.findIndex((f) => f.name === (p.family || p.pos) && f.pos === p.pos);

function marketStats(W) {
  let mcap = 0, vcap = 0, cards = 0; for (const c of W.cards) { mcap += c.P * c.circ; vcap += c.F * c.circ; cards += c.circ; }
  for (const it of W.items.values()) if (it.owner) { mcap += markItem(W, it); vcap += intrinsicItem(W, it); cards++; }
  const cash = W.bots.map((b) => b.cash).sort((a, b) => b - a), tot = cash.reduce((a, b) => a + b, 0) || 1, k = Math.max(1, Math.round(cash.length * 0.1));
  return { rate: W.credit?.rate ?? null, defaults: W.credit?.defaults || 0, debt: Math.round(totalDebt(W)), calls: W.credit?.calls || 0, broke: W.living?.broke || 0, spent: Math.round(W.living?.spent || 0), mcap: Math.round(mcap), vcap: Math.round(vcap), cards, cash: Math.round(tot), cashTop10: Math.round((cash.slice(0, k).reduce((a, b) => a + b, 0) / tot) * 1000) / 1000, cashShare: (() => { const h = Math.max(1, Math.round(cash.length * 0.5)), sum = (a) => a.reduce((x, y) => x + y, 0) / tot; return [sum(cash.slice(0, k)), sum(cash.slice(k, h)), sum(cash.slice(h))].map((x) => Math.round(x * 1000) / 1000); })(), treasury: Math.round(W.treasury), bank: Math.round((W.bankRate ?? 1) * 100) / 100 };
}
function movers(W) {
  const rows = W.players.filter((c) => recentVol(c, 4) >= 2 && c.Ph.length > 4).map((c) => [c.id, Math.round(c.P * 100) / 100, Math.round(ret(c, 4) * 1000) / 1000, recentVol(c, 4)]);
  rows.sort((a, b) => b[2] - a[2]);
  return { up: rows.slice(0, 8), down: rows.slice(-6).reverse() };
}

/* ---------- The league (valueModel 'league'): simulated football after the last real season drives hidden value ----------
   Every rate comes from sandbox/data/league_rates.json, measured from the save's real seasons (sandbox/measure_league.mjs).
   Each week every active, healthy player plays one game (weeks 1–17 of each 20-week season); at season's end come awards,
   a Super Bowl, retirements (each replaced by a rookie at the same position and club), and changes in form. Value is the
   site's own formula (OVR percentile within position over the game's pool, skill, Career Legacy, Hall of Fame, tier)
   recomputed every week from the simulated totals. It never reads a price or a bot. */
const LSTATS = { QB: ['yds', 'td', 'int', 'ryds', 'rtd'], RB: ['ryds', 'rtd', 'recyds', 'rectd', 'fum', 'rec'], WR: ['rec', 'yds', 'td', 'fum'], TE: ['rec', 'yds', 'td', 'fum'], OL: ['blk'], LB: ['tkl', 'int', 'sck', 'ff'], DB: ['tkl', 'int', 'sck', 'ff'], DL: ['tkl', 'int', 'sck', 'ff'] };
const LYARDS = new Set(['yds', 'ryds', 'recyds']), LAWARDS = ['rings', 'mvp', 'opoy', 'dpoy', 'sbmvp', 'roty'];
const LDEF = new Set(['LB', 'DB', 'DL']);
const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); };
// League Score (data/y80/formula/ovr.py, src/config/ovr.ts): production by position plus award points
function lgProduction(pos, t) {
  const g = (k) => t[k] || 0;
  if (pos === 'QB') return g('yds') / 80 + 0.9 * g('td') + 0.9 * g('rtd') - 0.6 * g('int');
  if (pos === 'RB') return g('ryds') / 18 + 2.2 * g('rtd') + g('recyds') / 30 + 2.2 * g('rectd') - 0.8 * g('fum');
  if (pos === 'WR' || pos === 'TE') { const td = t.td != null ? t.td : g('yds') / 95; return pos === 'WR' ? g('yds') / 14 + 2.5 * td - g('fum') : g('yds') / 8 + 3 * td - g('fum'); }
  if (pos === 'OL') return 5 * g('blk') + 2 * g('g');
  return 0.7 * g('tkl') + 12 * g('int') + 14 * g('sck') + 14 * g('ff');
}
const lgAwards = (pos, t) => 40 * (t.rings || 0) + 90 * (t.mvp || 0) + (LDEF.has(pos) ? 90 : 45) * ((t.opoy || 0) + (t.dpoy || 0)) + 40 * (t.sbmvp || 0) + 10 * (t.roty || 0);
const lgScore = (pos, t) => lgProduction(pos, t) + lgAwards(pos, t);
// The site's library stat names → the timeline's keys
function libTotals(p) {
  const t = {}, M = { Games: 'g', 'Pass Yds': 'yds', 'Pass TD': 'td', 'Rush Yds': 'ryds', 'Rush TD': 'rtd', Fum: 'fum', Fumbles: 'fum', Blocks: 'blk', Tackles: 'tkl', FF: 'ff', Rings: 'rings', MVP: 'mvp', OPOY: 'opoy', DPOY: 'dpoy', SBMVP: 'sbmvp', ROTY: 'roty', Rec: 'rec', INT: 'int', 'Rec TD': 'rectd', TDs: 'td' };
  for (const [k, v] of Object.entries(p.stats || {})) { let key = M[k]; if (k === 'Rec Yds') key = p.pos === 'RB' ? 'recyds' : 'yds'; if (k === 'Sacks') key = p.pos === 'QB' ? null : 'sck'; if (key && typeof v === 'number') t[key] = v; }
  return t;
}
const LIB_NAMES = { g: 'Games', yds: (pos) => (pos === 'QB' ? 'Pass Yds' : 'Rec Yds'), td: (pos) => (pos === 'QB' ? 'Pass TD' : 'TDs'), int: 'INT', ryds: 'Rush Yds', rtd: 'Rush TD', recyds: 'Rec Yds', rectd: 'Rec TD', fum: (pos) => (pos === 'RB' ? 'Fum' : 'Fumbles'), rec: 'Rec', blk: 'Blocks', tkl: 'Tackles', sck: 'Sacks', ff: 'FF', rings: 'Rings', mvp: 'MVP', opoy: 'OPOY', dpoy: 'DPOY', sbmvp: 'SBMVP', roty: 'ROTY' };
const libStats = (pos, t) => Object.fromEntries(Object.entries(t).map(([k, v]) => { const n = LIB_NAMES[k]; return [typeof n === 'function' ? n(pos) : n || k, Math.round(v)]; }));
const lgStage = (seasons) => (seasons <= 1 ? '1-2' : seasons <= 4 ? '3-5' : seasons <= 7 ? '6-8' : '9+');
function poisson1(W, lam) { if (!(lam > 0)) return 0; if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * W.gauss())); let k = 0, p = Math.exp(-lam), s = p; const u = W.rand(); while (u > s && k < 200) { k++; p *= lam / k; s += p; } return k; }

function leagueStart(W) {
  const R = W.library.leagueRates; if (!R || W.L) return;
  const T = W.timeline, last = T?.seasons[T.seasons.length - 1].players || {}, prev = T?.seasons[T.seasons.length - 2]?.players || {}, ci = 5;
  W.L = { t0: W.t - 1, full: R.fullSeason.all, week: 0, season: 0, champions: [], news: [], hofed: new Set(), names: (W.library.rookieNames?.names || []).slice(), nameIx: 0 };
  for (const p of W.players) {
    const lp = W.library.players[p.id], tot = libTotals(lp), row = last[p.key], pr = prev[p.key];
    const lastG = row && pr ? (row[ci].g || 0) - (pr[ci].g || 0) : row && !pr ? row[ci].g || 0 : 0;
    const line = {}; if (row && pr && lastG >= 4) for (const k of LSTATS[p.pos]) line[k] = Math.max(0, (row[ci][k] || 0) - (pr[ci][k] || 0));
    const rates = {}; for (const k of LSTATS[p.pos]) rates[k] = line[k] != null && k !== 'fum' && pr ? line[k] / lastG : (tot[k] || 0) / Math.max(1, tot.g || 1);
    const cpg = (tot.g || 0) > 0 ? lgProduction(p.pos, tot) / tot.g : 0, N = (W.cfg.formSeasons ?? 2) * W.L.full;
    p.lg = { tot, season: { g: 0 }, last: row && pr && lastG >= 1 ? { ...line, g: lastG } : null, win: Array(N).fill(cpg), rates, active: p.on !== false && lastG > 0, seasons: Math.round((tot.g || 0) / W.L.full), legacy: lp.careerLegacy || 0, skill: lp.skill ?? null, inducted: !!lp.hallOfFame, out: null };
  }
  const A = W.library.nflAge; for (const p of W.players) if (p.lg) p.lg.age0 = A?.rookieAge?.draws?.length ? W.pick(A.rookieAge.draws) : 23; // his age when he entered (real NFL entry ages)
  leagueInjuries(W); leagueValues(W); for (const p of W.players) if (p.lg) p.lg.v0 = p.F;
}
// Injuries: each active player's games missed this season, drawn from the real active seasons at his position and stage;
// a miss comes as one spell starting at a random week (an assumption: only season totals are known)
function leagueInjuries(W) {
  const R = W.library.leagueRates, pool = R.activeMissedAll, full = W.L.full, A = W.library.nflAge?.relativeRiskByAge;
  // How often a season has an injury is the save's (only 16 injured seasons, too few to split); how that chance changes with
  // age is the real NFL's (nflverse weekly rosters: share of weeks on reserve by age), scaled so the league's average is the save's
  const hurt = pool.filter((x) => x[2] > 0), base = hurt.length / Math.max(1, pool.length);
  const ages = Object.keys(A || {}).map(Number).sort((a, b) => a - b), rrAt = (age) => (!ages.length ? 1 : A[Math.min(ages[ages.length - 1], Math.max(ages[0], Math.round(age)))] ?? 1);
  const act = W.players.filter((p) => p.lg?.active), mean = act.reduce((a, p) => a + rrAt(lgAge(p)), 0) / Math.max(1, act.length);
  for (const p of act) { const L = p.lg; L.out = null; if (W.cfg.injuries === false) continue;
    let chance = base * (W.cfg.injuryByAge !== false ? rrAt(lgAge(p)) / mean : 1);
    const hi = W.cfg.hypeInjury || 0; if (hi > 0 && (L.hype || 0) > 0) chance += base * hi * L.hype; // the owner's setting, not measured
    if (!(W.rand() < Math.min(1, chance))) continue;
    let xs = hurt.filter((x) => x[0] === p.pos); if (xs.length < 3) xs = hurt; // the spell: a real injured season's games missed
    const miss = Math.min(full, W.pick(xs)[2]); const from = 1 + Math.floor(W.rand() * (full - miss + 1)); L.out = [from, from + miss - 1]; }
}
const lgAge = (p) => (p.lg.age0 ?? 23) + (p.lg.seasons || 0);
// One game at a player's per-game rates: yards log-normal around the rate, counts Poisson
function lgGame(W, pos, rates, noise) { const game = { g: 1 }; for (const k of LSTATS[pos]) { const r = rates[k] || 0; game[k] = LYARDS.has(k) ? Math.max(0, Math.round(r * Math.exp(noise * W.gauss() - (noise * noise) / 2))) : poisson1(W, r); } return game; }
// One week of football
function leagueWeek(W) {
  const L = W.L, wk = ((W.t - 1) % W.cfg.seasonWeeks) + 1; L.week = wk; if (wk > L.full) return;
  const noise = W.cfg.gameNoise ?? 0.4;
  const N = Math.max(1, (W.cfg.formSeasons ?? 1) * L.full); // the form window follows the setting, even mid-run
  for (const p of W.players) { const w = p.lg?.win; if (!w || w.length === N) continue; if (w.length > N) w.splice(0, w.length - N); else { const m = w.reduce((a, b) => a + b, 0) / Math.max(1, w.length); while (w.length < N) w.unshift(m); } }
  for (const p of W.players) {
    const s = p.lg; if (!s?.active) continue;
    if (s.out && wk >= s.out[0] && wk <= s.out[1]) { if (W.cfg.injuryCountsInForm !== false) { s.win.push(0); s.win.shift(); } if (wk === s.out[0]) { const n = s.out[1] - s.out[0] + 1; jot(W, { type: 'injury', player: p.key, name: `${p.pos} ${p.name}`, games: n }); if (n >= 2) log(W, 'injury', `${p.pos} ${p.name} is out for ${n >= L.full ? 'the season' : `${n} games`}.`); } continue; }
    if (s.out && wk === s.out[1] + 1) { jot(W, { type: 'return', player: p.key, name: `${p.pos} ${p.name}` }); if (s.out[1] - s.out[0] >= 3) log(W, 'return', `${p.pos} ${p.name} is back after ${s.out[1] - s.out[0] + 1} games out.`); }
    const game = lgGame(W, p.pos, s.rates, noise);
    for (const [k, v] of Object.entries(game)) { s.season[k] = (s.season[k] || 0) + v; s.tot[k] = (s.tot[k] || 0) + v; }
    const G = W.library.leagueRates.legacyGrowth[p.pos]; if (G) s.legacy += G.perScore * lgProduction(p.pos, game) + G.perGame;
    p._game = game; p._gameT = W.t; s.win.push(lgProduction(p.pos, game)); s.win.shift();
  }
}
// The season ends: awards, the Super Bowl, retirements and rookies, then each player's form changes
function leagueSeasonEnd(W) {
  const L = W.L, R = W.library.leagueRates, cfg = W.cfg; L.season++;
  const act = W.players.filter((p) => p.lg?.active && (p.lg.season.g || 0) > 0), prod = (p) => lgProduction(p.pos, p.lg.season);
  const give = (p, a, n = 1) => { if (a !== 'rings') p.lg.awardSeason = L.season; p.lg.tot[a] = (p.lg.tot[a] || 0) + n; p.lg.season[a] = (p.lg.season[a] || 0) + n; const G = R.legacyGrowth[p.pos]; if (G) p.lg.legacy += G.perScore * (lgAwards(p.pos, { [a]: n })); };
  const won = [];
  if (cfg.awards !== false) {
    // Super Bowl: the champion club, weighted by the season production of its players (an assumption); every active player on it gets a ring
    const clubs = new Map(); for (const p of act) clubs.set(p.team, (clubs.get(p.team) || 0) + Math.max(0, prod(p)));
    const tot = [...clubs.values()].reduce((a, b) => a + b, 0); let r = W.rand() * tot, champ = null; for (const [c, v] of clubs) { r -= v; if (r <= 0) { champ = c; break; } }
    if (champ) { const roster = act.filter((p) => p.team === champ); for (const p of roster) give(p, 'rings'); L.champions.push([W.seasonLabel, champ]); log(W, 'champion', `${champ} win the Super Bowl: ${roster.length} card players get rings.`);
      if (W.rand() < (R.awards.sbmvp.meanPerSeason || 0)) { const best = roster.slice().sort((a, b) => prod(b) - prod(a))[0]; if (best) { give(best, 'sbmvp'); won.push(['Super Bowl MVP', best]); } } }
    // MVP, OPOY, DPOY: as many a season as the save had, at the positions they went to, to that position's top producer this season
    for (const [a, label] of [['mvp', 'MVP'], ['opoy', 'Offensive Player of the Year'], ['dpoy', 'Defensive Player of the Year']]) {
      const A = R.awards[a]; if (!A || !(W.rand() < Math.min(1, A.meanPerSeason))) continue;
      const pos = Object.entries(A.positions); if (!pos.length) continue; const t = pos.reduce((x, [, n]) => x + n, 0); let rr = W.rand() * t, at = pos[0][0]; for (const [ps, n] of pos) { rr -= n; if (rr <= 0) { at = ps; break; } }
      const best = act.filter((p) => p.pos === at).sort((x, y) => prod(y) - prod(x))[0]; if (best) { give(best, a); won.push([label, best]); }
    }
    for (const [label, p] of won) log(W, 'award', `${label}: ${p.pos} ${p.name}.`);
  }
  // Retirement at the measured rate for his career stage and where his season ranked at his position; a rookie takes his place
  const retired = [];
  if (cfg.retirement !== false) {
    // retirementByAge: how often careers end is the save's (11% of active players a season); how that changes with age is the
    // real NFL's (nflverse: the chance a career ends at each age, 19% at 22–29 rising to 30–42% by 32–38). Past the oldest age
    // the NFL data covers (40), every career ends. Off: the save's rate by seasons played and production third.
    const E = W.library.nflAge?.careerEndByAge, eAges = Object.keys(E || {}).map(Number).sort((a, b) => a - b);
    const all = Object.values(R.retirement.rates), saveRate = all.reduce((a, c) => a + c.retired, 0) / Math.max(1, all.reduce((a, c) => a + c.n, 0));
    const endAt = (age) => (!eAges.length ? 0 : age > eAges[eAges.length - 1] ? null : E[Math.max(eAges[0], Math.round(age))] ?? 0);
    const actP = W.players.filter((p) => p.lg?.active), meanEnd = actP.reduce((a, p) => a + (endAt(lgAge(p)) ?? 0), 0) / Math.max(1, actP.length);
    const byAge = W.cfg.retirementByAge !== false && eAges.length && meanEnd > 0;
    const rank = new Map(); for (const pos of Object.keys(LSTATS)) { const xs = act.filter((p) => p.pos === pos).sort((a, b) => prod(a) / a.lg.season.g - prod(b) / b.lg.season.g); xs.forEach((p, i) => rank.set(p, xs.length > 1 ? i / (xs.length - 1) : 1)); }
    for (const p of W.players) { const s = p.lg; if (!s?.active) continue; const st = lgStage(s.seasons), r = rank.get(p) ?? 0, third = r < 1 / 3 ? 'bottom third' : r < 2 / 3 ? 'middle third' : 'top third';
      let cell = R.retirement.rates[`${st}|${third}`]; if (!cell || cell.n < 20) { const all = ['bottom third', 'middle third', 'top third'].map((t) => R.retirement.rates[`${st}|${t}`]); const n = all.reduce((a, c) => a + c.n, 0), k = all.reduce((a, c) => a + c.retired, 0); cell = { rate: n ? k / n : 0 }; }
      const e = byAge ? endAt(lgAge(p) + 1) : null; // next season's age
      const chance = byAge ? (e == null ? 1 : Math.min(1, (saveRate * e) / meanEnd)) : cell.rate;
      if (W.rand() < chance) { s.active = false; retired.push(p); jot(W, { type: 'retired', player: p.key, name: `${p.pos} ${p.name}`, seasons: s.seasons }); log(W, 'retire', `${p.pos} ${p.name} retires at ${Math.round(lgAge(p))} after ${s.seasons + ((s.season.g || 0) > 0 ? 1 : 0)} seasons (${Math.round(s.legacy).toLocaleString()} Career Legacy).`); } }
    if (cfg.rookies !== false && W.fullL) fillRosters(W, retired); // a full league: back to rosterSize at every club × position, nothing on top
    else if (cfg.rookies !== false) {
      if (cfg.rookieRule === 'replace' || cfg.rookieRule === 'replacePlus') for (const p of retired) addRookie(W, p);
      if (cfg.rookieRule === 'replacePlus') { // and extraRookies more a season, at positions in the save's real mix of new players, at clubs drawn from the league
        const mix = Object.entries(R.arrivals?.positionMix || {}).filter(([, k]) => k > 0), tot = mix.reduce((a, [, k]) => a + k, 0);
        for (let k = 0; k < (cfg.extraRookies ?? 3) && tot > 0; k++) { let r = W.rand() * tot, pos = mix[0][0]; for (const [ps, m] of mix) { r -= m; if (r <= 0) { pos = ps; break; } } const like = W.players.filter((p) => p.pos === pos), model = like.length ? W.pick(like) : W.pick(W.players); addRookie(W, { ...model, id: model.id, pos, team: W.pick(W.players).team, fam: model.fam, name: null }); }
      } else if (cfg.rookieRule === 'measured') { // arrivals at the measured rate: as many as one real season brought (league_rates.json arrivals), positions in the real mix,
        // independent of who retired; each joins a club drawn from the league's players
        const A = R.arrivals, n = A?.perSeason?.length ? W.pick(A.perSeason).n : 0, mix = Object.entries(A?.positionMix || {}).filter(([, k]) => k > 0), tot = mix.reduce((a, [, k]) => a + k, 0);
        for (let k = 0; k < n && tot > 0; k++) { let r = W.rand() * tot, pos = mix[0][0]; for (const [ps, m] of mix) { r -= m; if (r <= 0) { pos = ps; break; } }
          const like = W.players.filter((p) => p.pos === pos), model = like.length ? W.pick(like) : W.pick(W.players); addRookie(W, { ...model, id: model.id, pos, team: W.pick(W.players).team, fam: model.fam, name: null }); } }
    }
  }
  // Hall of Fame: Career Legacy 7,500
  for (const p of W.players) { const s = p.lg; if (s && s.legacy >= 7500 && !s.inducted) { s.inducted = true; log(W, 'hof', `${p.pos} ${p.name} enters the Hall of Fame (${Math.round(s.legacy).toLocaleString()} Career Legacy).`); jot(W, { type: 'hof', player: p.key, name: `${p.pos} ${p.name}` }); } }
  // Form: each active player's per-game rates move by one real season-to-season change at his position and stage
  for (const p of W.players) { const s = p.lg; if (!s?.active) continue;
    if ((s.season.g || 0) > 0) { s.last = { ...s.season }; s.seasons++; }
    if (!s.rookieNew) { const cell = R.formSwings.cells[`${p.pos}|${lgStage(s.seasons)}`]; let sw = W.pick(cell?.draws?.length ? cell.draws : [0]);
      const P = R.pressure, dv = s.v0 > 0 ? Math.log(p.F / s.v0) : 0; // pressure: how his card moved this season shifts next season's form, as measured in the save
      if (P && W.cfg.pressure !== false) sw += (W.cfg.pressureStrength ?? 1) * P.shift[dv < P.cuts[0] ? 0 : dv < P.cuts[1] ? 1 : 2];
      s.hype = dv; for (const st of Object.keys(s.rates)) s.rates[st] *= Math.exp(sw); }
    s.rookieNew = false; s.season = { g: 0 }; s.v0 = p.F; }
  leagueInjuries(W);
}
// A rookie replaces a retiree: same position and club, a new name, his first-season rates from a real early-career season
// at that position, and new card markets with a print run
function addRookie(W, old) {
  const { p, lib, name } = leaguePlayer(W, old), id = p.id;
  for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = makeMarket(W, p, d, f); W.cards.push(m); W.mktByKey.set(m.key, m); }
  (W.newPlayers ||= []).push(lib); packCache = null; packCacheT = null;
  jot(W, { type: 'rookie', player: p.key, name: `${old.pos} ${name}`, replaces: old.name ? `${old.pos} ${old.name}` : null, club: old.team });
  log(W, 'rookie', old.name ? `Rookie ${old.pos} ${name} joins ${old.team}, taking ${old.name}'s place.` : `Rookie ${old.pos} ${name} joins ${old.team}.`);
  return p;
}
// The shared core of a new league player (a rookie, or a generated veteran before his burn-in): name, measured first-season
// rates, library entry, league record and era; no card markets yet. old.teamFull (a generated player) names his club
function leaguePlayer(W, old) {
  const R = W.library.leagueRates, L = W.L, id = W.players.length;
  let name; do { name = L.names[L.nameIx++ % Math.max(1, L.names.length)] || `Rookie ${id}`; } while (W.byKey.has(`${old.pos}:${name}`) && L.nameIx < L.names.length * 2);
  const key = `${old.pos}:${name}`, tpl = W.pick(R.earlySeasons.filter((x) => x.pos === old.pos).length ? R.earlySeasons.filter((x) => x.pos === old.pos) : R.earlySeasons);
  const rates = {}; for (const k of LSTATS[old.pos]) rates[k] = (tpl.d[k] || 0) / tpl.g;
  if (!rates.fum && LSTATS[old.pos].includes('fum')) { const lp = W.library.players[old.id], t = libTotals(lp); rates.fum = (t.fum || 0) / Math.max(1, t.g || 1); }
  const src = W.library.players[W.byKey.get(tpl.key)?.id ?? old.id];
  const lib = { key, name, pos: old.pos, team: old.teamFull ?? W.library.players[old.id].team, nickname: null, hallOfFame: false, ovr: 62, skill: src?.skill ?? null, grade: src?.grade ?? null, careerLegacy: 0, stats: { Games: 0 }, rates: {}, hidden: { value: 0 }, playsLike: [], family: W.library.players[old.id].family, rookie: true };
  W.library.players.push(lib);
  const pool = W.players.filter((p) => p.pos === old.pos && p.S0).map((p) => p.S0).sort((a, b) => a - b), S0 = pool[Math.floor(pool.length / 2)] || 20;
  const p = { id, key, name, pos: old.pos, team: old.team, F: 1, F0: 1, P: 1, P0: 1, S0, circ: 0, pool: S0 * W.cfg.poolMultiplier, Ph: [1], volH: [], isPlayer: true, fam: old.fam, rookie: true };
  const tplPg = lgProduction(old.pos, Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, v]))), N = (W.cfg.formSeasons ?? 2) * W.L.full;
  const A = W.library.nflAge;
  p.lg = { age0: A?.rookieAge?.draws?.length ? W.pick(A.rookieAge.draws) : 23, tot: { g: 0 }, season: { g: 0 }, last: null, win: Array(N).fill(tplPg), rates, active: true, seasons: 0, legacy: 0, skill: lib.skill, inducted: false, out: null, rookieNew: true };
  W.players.push(p); W.byKey.set(key, p); W.era[id] = { on: true, ovr: 62, skill: lib.skill, grade: lib.grade, legacy: 0, totals: { g: 0 }, perGame: {} };
  return { p, lib, name };
}
// Hidden value, every week: the site's formula on the simulated totals
function leagueValues(W) {
  const cfg = W.cfg, form = (cfg.valueBasis ?? 'form') === 'form', on = W.players.filter((p) => p.on !== false && p.lg);
  // 'form': everyone is ranked within his position on League Score PER GAME: career per game for retired players and the real
  // NFL players in the pool, the last formSeasons × 17 games for active players (games missed injured count as zero). Career
  // totals only grow, so ranking on them makes every active player climb just by playing; per game, a breakout lifts a card
  // and a slump, an injury or the falloff after a rise pulls it back. Career Legacy still builds (it is a career measure).
  // At the open each card moves from the site's own OVR (career totals) to this one over the first 2 seasons, so the market
  // opens at the real values. 'career': the site's OVR throughout.
  const blend = form ? Math.max(0, 1 - (W.t - (W.L.t0 ?? 0)) / (2 * W.cfg.seasonWeeks)) : 1;
  const careerPg = (p) => { const g = p.lg.tot.g || 0; return g ? lgScore(p.pos, p.lg.tot) / g : 0; };
  const formPg = (p) => { const w = p.lg.win, g = p.lg.tot.g || 0, aw = g ? lgAwards(p.pos, p.lg.tot) / g : 0; return w?.length ? w.reduce((a, b) => a + b, 0) / w.length + aw : careerPg(p); };
  const rank = (rows) => { rows.sort((a, b) => a[1] - b[1]); const m = new Map(); rows.forEach(([p], i) => { if (p) m.set(p, 62 + 37 * (rows.length > 1 ? i / (rows.length - 1) : 1) ** 0.85); }); return m; };
  // a full league: ranked against a fixed reference, the save's own players and the legends; anyone else gets the OVR of
  // the place his score would take in it (the number of reference scores below his)
  const full = !!W.fullL, rankIn = (rows, others) => { const m = rank(rows), xs = rows.map((r) => r[1]), n = xs.length;
    for (const [p, x] of others) { let lo = 0, hi = n; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; } m.set(p, 62 + 37 * (n > 1 ? Math.min(lo, n - 1) / (n - 1) : 1) ** 0.85); } return m; };
  const rankBy = (mine, legRows, f) => (!full ? rank([...mine.map((p) => [p, f(p)]), ...legRows]) : rankIn([...mine.filter((p) => p.ref).map((p) => [p, f(p)]), ...legRows], mine.filter((p) => !p.ref).map((p) => [p, f(p)])));
  const ovr = new Map();
  for (const pos of Object.keys(LSTATS)) {
    const mine = on.filter((p) => p.pos === pos), legends = (W.library.leagueRates?.legendScores || []).filter((x) => x[0] === pos);
    const site = blend > 0 ? rankBy(mine, legends.map((x) => [null, x[1]]), (p) => lgScore(pos, p.lg.tot)) : null;
    const pg = form ? rankBy(mine, legends.map((x) => [null, x[2] ? x[1] / x[2] : 0]), (p) => (p.lg.active ? formPg(p) : careerPg(p))) : null;
    for (const p of mine) { const c = careerPg(p); p.lg.formRatio = p.lg.active && c > 0 ? formPg(p) / c : 1; }
    for (const p of mine) ovr.set(p, pyRound(!form ? site.get(p) : p.rookie || !site ? pg.get(p) : blend * site.get(p) + (1 - blend) * pg.get(p)));
  }
  const isHof = (s) => s.legacy >= 7500 || (s.inducted && s.legacy >= 7300);
  const tierOfP = (p) => { const s = p.lg, o = ovr.get(p); return s.legacy >= 10000 ? 'legendary' : isHof(s) || o >= 90 ? 'epic' : o >= 80 ? 'rare' : 'common'; };
  const tiers = new Map(on.map((p) => [p, tierOfP(p)])), counts = {}; for (const [p, t] of tiers) if (!full || p.ref) counts[t] = (counts[t] || 0) + 1; // a full league counts tiers in the reference only
  const nOn = full ? on.filter((p) => p.ref).length : on.length;
  const TM = { common: 1, rare: 1.25, epic: 1.6, legendary: 2 };
  for (const p of on) {
    const s = p.lg, o = ovr.get(p), c = clamp((o - 60) / 39, 0, 1), skillM = s.skill == null ? 1 : 0.8 + 0.4 * clamp((s.skill - 62) / 37, 0, 1), legacy = Math.round(s.legacy);
    const v = Math.max(1, Math.round((25 + 2400 * c ** 3) * skillM * ((1 + clamp(legacy, 0, 15000) / 10000) / 1.5) ** 3 * (legacy >= 7000 ? 1.25 : 1) * TM[tiers.get(p)] * clamp(Math.sqrt(nOn / 4 / Math.max(1, counts[tiers.get(p)] || 0)), 0.8, 1.5)));
    p.F = Math.max(0.05 * cfg.coinScale, v / cfg.valueDivisor); if (p.rookie && p.P === 1 && p.F0 === 1) { p.F0 = p.F; p.P = p.P0 = p.F; p.Ph = [p.F]; resetMarkets(W, p); }
    const e = (W.era[p.id] ||= { on: true }); e.ovr = o; e.legacy = legacy; e.skill = s.skill; e.totals = s.tot; e.value = v; e.active = s.active; e.age = lgAge(p); e.injured = !!(s.out && W.L.week >= s.out[0] && W.L.week <= s.out[1]);
  }
  packCache = null; packCacheT = null;
}

// A full league (leagueFill 'full'): the save's real players are the reference; every club × position short of rosterSize
// gets a generated veteran before the market opens, and his cards are dealt out with everyone else's
const fullLeague = (cfg) => cfg.leagueFill === 'full' && cfg.valueModel === 'league' && cfg.history !== false && cfg.startSeason !== 'first';
function fillLeague(W) {
  const T = W.timeline; if (!T || !W.library.leagueRates || W.seasonIx < T.seasons.length - 1) return;
  const keep = W.players.map((p) => [p.F, p.F0, p.P, p.P0, p.Ph, W.era[p.id] && { ...W.era[p.id] }]);
  for (const p of W.players) p.ref = true; // the save's own players: the fixed reference for OVR and value
  W.fullL = true; leagueStart(W); W.L.t0 = 0; // the league opens now, as the first week would open it (t0 = W.t − 1)
  W.L.clubs = [...new Set(W.library.players.map((x) => x.team))].filter((t) => teamShort(t) !== 'FA').sort().map((t) => [teamShort(t), t]);
  fillRosters(W, null, W.players.filter((p) => p.lg?.active).map((p) => p.lg.seasons)); // seasons played, as the save's active players have
  leagueInjuries(W); leagueValues(W);
  for (const p of W.players) { if (p.ref) continue; const e = W.era[p.id], lib = W.library.players[p.id];
    p.F0 = p.P = p.P0 = p.F; p.Ph = [p.F]; p.lg.v0 = p.F; Object.assign(lib, { ovr: e.ovr, careerLegacy: e.legacy, stats: libStats(p.pos, p.lg.tot), hidden: { value: e.value } }); }
  keep.forEach(([F, F0, P, P0, Ph, e], i) => { Object.assign(W.players[i], { F, F0, P, P0, Ph }); if (e) W.era[i] = e; }); // the save's players open at the site's prices, as in a save-only league
  const copies = (xs) => xs.reduce((a, p) => a + (p.on !== false ? p.S0 : 0), 0); W.fillK = copies(W.players) / Math.max(1, copies(W.players.filter((p) => p.ref))); // money follows the cards
  W.newPlayers = W.players.filter((p) => !p.ref).map((p) => W.library.players[p.id]); packCache = null; packCacheT = null;
}
// Every club × position up to rosterSize: a retiree at that slot is replaced first (his name in the news), then any gap.
// seasons (the open only): generated veterans with that many seasons drawn from it; otherwise rookies
function fillRosters(W, retired, seasons = null) {
  const shape = W.cfg.rosterSize || {}, n = new Map(), left = (retired || []).slice();
  for (const p of W.players) if (p.lg?.active) { const k = p.team + '|' + p.pos; n.set(k, (n.get(k) || 0) + 1); }
  for (const [team, teamFull] of W.L.clubs) for (const [pos, size] of Object.entries(shape)) for (let k = n.get(team + '|' + pos) || 0; k < size; k++) {
    const i = left.findIndex((r) => r.team === team && r.pos === pos), was = i >= 0 ? left.splice(i, 1)[0] : null, like = W.players.filter((p) => p.pos === pos && p.ref);
    const model = was || (like.length ? W.pick(like) : W.pick(W.players)), old = { ...model, id: model.id, pos, team, teamFull, fam: model.fam, name: was ? was.name : null };
    if (seasons) veteran(W, old, seasons.length ? W.pick(seasons) : 0); else addRookie(W, old);
  }
}
// A generated veteran: a rookie (leaguePlayer) who then plays s seasons under the league's own rules: an injury spell at the
// measured rate (by age, as leagueInjuries), weekly games at his rates, Career Legacy growth, a form swing after each season.
// No awards, no rings, no retirement
function veteran(W, old, s) {
  const { p, lib } = leaguePlayer(W, old), L = p.lg, R = W.library.leagueRates, full = W.L.full, noise = W.cfg.gameNoise ?? 0.4;
  p.gen = true; p.rookie = false; L.rookieNew = false; lib.rookie = false; lib.generated = true;
  const pool = R.activeMissedAll || [], hurt = pool.filter((x) => x[2] > 0), base = hurt.length / Math.max(1, pool.length), own = hurt.filter((x) => x[0] === p.pos), xs = own.length < 3 ? hurt : own;
  const A = W.library.nflAge?.relativeRiskByAge, ages = Object.keys(A || {}).map(Number).sort((a, b) => a - b), rrAt = (age) => (!ages.length ? 1 : A[Math.min(ages[ages.length - 1], Math.max(ages[0], Math.round(age)))] ?? 1);
  const act = W.players.filter((x) => x.lg?.active && x.ref), mean = act.reduce((a, x) => a + rrAt(lgAge(x)), 0) / Math.max(1, act.length) || 1;
  for (let y = 0; L.seasons < s && y < s + 5; y++) { // a season lost to injury does not count as one played (as in the league)
    const ch = W.cfg.injuries === false || !xs.length ? 0 : base * (W.cfg.injuryByAge !== false ? rrAt(lgAge(p)) / mean : 1), miss = W.rand() < ch ? Math.min(full, W.pick(xs)[2]) : 0, from = 1 + Math.floor(W.rand() * (full - miss + 1));
    L.season = { g: 0 };
    for (let wk = 1; wk <= full; wk++) {
      if (miss && wk >= from && wk < from + miss) { if (W.cfg.injuryCountsInForm !== false) { L.win.push(0); L.win.shift(); } continue; }
      const game = lgGame(W, p.pos, L.rates, noise); for (const [k, v] of Object.entries(game)) { L.season[k] = (L.season[k] || 0) + v; L.tot[k] = (L.tot[k] || 0) + v; }
      const G = R.legacyGrowth[p.pos], pr = lgProduction(p.pos, game); if (G) L.legacy += G.perScore * pr + G.perGame; L.win.push(pr); L.win.shift();
    }
    if ((L.season.g || 0) > 0) { L.last = { ...L.season }; L.seasons++; }
    const cell = R.formSwings.cells[`${p.pos}|${lgStage(L.seasons)}`], sw = W.pick(cell?.draws?.length ? cell.draws : [0]); for (const st of Object.keys(L.rates)) L.rates[st] *= Math.exp(sw);
  }
  L.season = { g: 0 }; lib.seasons = L.seasons; return p;
}

// dormantAfter: a retired player is set aside once nobody has held, bid on, listed or traded any of his cards for that many
// weeks. Only the weekly per-card upkeep skips him (clear, comparable sales, implied prices, circulation counts), which for
// such a player only appends unchanged history; his value, his pool and packs are untouched. Off with the Vault store (it
// lists pool copies of every card). Measurement of activity only: it never changes what anyone can do
function dormancy(W) {
  const after = W.cfg.dormantAfter || 0, on = after > 0 && !W.cfg.store;
  if (!on) { if (W.dormN) for (const p of W.players) if (p.dorm) wakePlayer(W, p); return; }
  const held = new Set(); for (const it of W.items.values()) if (it.owner) held.add(it.pid);
  for (const m of [W.outside, W.liq, W.lendable]) for (const id of m?.keys() || []) held.add(W.cards[id].pid);
  for (const L of W.cardLoans || []) held.add(W.cards[L.id].pid); for (const a of W.auctions || []) if (a.cardId != null) held.add(W.cards[a.cardId].pid);
  let n = 0;
  for (const p of W.players) {
    if (p.dorm) { n++; continue; } if (!p.lg || p.lg.active) continue;
    let c0 = 0; for (let k = 0; k < 16; k++) c0 += W.cards[p.id * 16 + k].circ;
    if (c0 > 0 || held.has(p.id)) { p.actT = W.t; continue; }
    if (p.actT == null) p.actT = W.t; // counting starts when he is first seen idle and retired
    if (W.t - p.actT >= after) { p.dorm = true; p.dormT = W.t; n++; }
  }
  W.dormN = n;
}
// Back in play: the weeks skipped get the unchanged history the weekly upkeep would have written (nothing traded, so no
// price moved), so a woken player's charts and windows read exactly as if he had never been set aside
function wakePlayer(W, p) {
  const miss = W.t - p.dormT + (W._cleared === W.t ? 1 : 0); p.dorm = false; p.actT = W.t; W.dormN = Math.max(0, (W.dormN || 1) - 1);
  for (let i = 0; i < Math.min(miss, 120); i++) {
    for (let k = 0; k < 16; k++) { const c = W.cards[p.id * 16 + k]; c.volH.push(0); if (c.volH.length > 60) c.volH.shift(); }
    p.Ph.push(p.P); if (p.Ph.length > 80) p.Ph.shift(); p.volH.push(0); if (p.volH.length > 60) p.volH.shift();
    (p.ohlc ||= []).push([r2(p.P), r2(p.P), r2(p.P), r2(p.P), 0]); if (p.ohlc.length > 120) p.ohlc.shift();
  }
}

/* ---------- The forces that keep a real market from settling ---------- */
// 1. News: the save's REAL history. The world starts at the first real season; every seasonWeeks the next real season
//    arrives with the real hidden values, OVR, grades, Career Legacy and career totals, and real rookies enter the
//    pool. Library pages and game questions only ever show the current era. After the last real season, each player's
//    value moves by a ratio drawn from the real season-to-season changes of players at his position.
function eraFrom(row) {
  const [value, ovr, skill, grade, legacy, totals] = row, g = totals.g || 0;
  const perGame = {}; if (g) for (const [k, v] of Object.entries(totals)) if (k !== 'g' && typeof v === 'number' && !/rings|mvp|opoy|dpoy|roty|sbmvp/i.test(k)) perGame[`${k} per game`] = Math.round((v / g) * 1000) / 1000;
  return { on: true, value, ovr, skill, grade, legacy, totals, perGame };
}
function realRatios(T, raw = false) {
  const out = {};
  for (let i = 1; i < T.seasons.length; i++) for (const [k, row] of Object.entries(T.seasons[i].players)) { const prev = T.seasons[i - 1].players[k]; if (prev && prev[0] > 0 && row[0] > 0) (out[k.slice(0, 2)] ||= []).push(Math.log(row[0] / prev[0])); }
  // Centred on zero: keep the real spread of winners and losers (log changes), drop the upward drift of careers still
  // being built. sd is each position's spread, for the drawn seasons' pull back (nextSeason).
  if (!raw) for (const pos of Object.keys(out)) { const m = out[pos].reduce((a, b) => a + b, 0) / out[pos].length; out[pos] = out[pos].map((x) => x - m); }
  out.sd = Object.fromEntries(Object.entries(out).map(([pos, xs]) => [pos, Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)]));
  return out;
}
export function startTimeline(W) {
  const T = W.library.timeline; if (!T || !W.cfg.history) return false;
  W.timeline = T; W.ratios = realRatios(T); W.rawRatios = realRatios(T, true); W.era = {};
  W.seasonIx = W.cfg.startSeason === 'first' ? 0 : T.seasons.length - 1; W.seasonLabel = T.seasons[W.seasonIx].season;
  const rows = T.seasons[W.seasonIx].players;
  for (const c of W.players) {
    const row = rows[c.key];
    if (!row) { c.on = false; c.pool = 0; c.S0 = 0; W.era[c.id] = { on: false }; continue; }
    W.era[c.id] = eraFrom(row); c.F = c.F0 = Math.max(0.05 * W.cfg.coinScale, row[0] / W.cfg.valueDivisor); c.P = c.P0 = c.F; c.Ph = [c.F];
    c.S0 = Math.max(2, Math.round(40 / Math.sqrt(Math.max(0.5, row[0] / 100)))); c.pool = c.S0 * W.cfg.poolMultiplier; c.on = true;
  }
  return true;
}
function nextSeason(W) {
  const T = W.timeline; W.seasonIx++;
  const real = W.seasonIx < T.seasons.length, label = real ? T.seasons[W.seasonIx].season : `Y${88 + W.seasonIx - T.seasons.length + 1}`;
  const moves = [], rookies = [];
  for (const c of W.players) {
    const walk = W.cfg.valueModel === 'ovrWalk', fac = W.cfg.valueModel === 'factors', before = walk ? (W.era[c.id]?.ovr || 60) : fac ? (c.B ?? c.F) : c.F;
    if (real) {
      const row = T.seasons[W.seasonIx].players[c.key]; if (!row) continue;
      W.era[c.id] = eraFrom(row);
      if (walk) { if (c.on === false) c.F = c.F0 = Math.max(0.05 * W.cfg.coinScale, row[0] / W.cfg.valueDivisor); } // the walk keeps going; only OVR (the odds) changes
      else if (fac) { c.B = Math.max(0.05 * W.cfg.coinScale, row[0] / W.cfg.valueDivisor); if (c.on === false) c.F = c.F0 = c.B; } // the player factor: his real data this season
      else c.F = Math.max(W.cfg.coinScale, row[0] / W.cfg.valueDivisor);
      if (c.on === false) { c.C0 = null; c.R = null; c.R0 = null; c.on = true; c.P = W.cfg.priceOnly ? openingPrice(W, c) : c.F; c.Ph = [c.P]; c.pool = Math.max(2, Math.round(40 / Math.sqrt(Math.max(0.5, row[0] / 100)))) * W.cfg.poolMultiplier; resetMarkets(W, c); rookies.push(c); continue; }
    } else {
      if (c.on === false) continue;
      if (W.cfg.priceOnly || walk) continue; // nothing to draw: price-only has no value, the OVR walk moves weekly
      if (W.cfg.valueModel === 'league') continue; // the league simulation moves values (leagueSeasonEnd)
      if (fac && W.cfg.pastSave !== 'draw') continue; // no real data past the save, so no change: the player factor holds and only supply moves the value
      if (fac) { c.B = Math.max(0.05 * W.cfg.coinScale, (c.B ?? c.F) * Math.exp(W.pick(W.rawRatios?.[c.pos] || [0]))); moves.push([c, c.B / before]); continue; } // 'draw': one real season's change from his position's history
      // Mean-reverting in log terms around the last real value, aimed sd²/2 low so the average value stays put
      const PULL = W.cfg.formulaPull ?? 0.25, anchor = ((W.anchorF ||= {})[c.id] ??= c.F), sd = W.ratios.sd[c.pos] || 0, v = PULL > 0 ? (sd * sd) / (2 * PULL - PULL * PULL) : 0; // (no pull: no aim either)
      const target = Math.log(anchor) - v / 2, lf = Math.log(c.F);
      c.F = Math.max(1, Math.exp(lf + PULL * (target - lf) + W.pick(W.ratios[c.pos] || [0])));
    }
    moves.push([c, walk ? (W.era[c.id]?.ovr || 60) / before : fac ? (c.B ?? c.F) / before : c.F / before]);
  }
  moves.sort((a, b) => b[1] - a[1]); packCache = null;
  const fmtM = ([c, k]) => `${c.pos} ${c.name} ${k >= 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`;
  if (!real && W.cfg.valueModel === 'league') log(W, 'season', `${label} kicks off: the simulated league plays on from the last real season.`); else if (!real && W.cfg.valueModel === 'factors' && W.cfg.pastSave !== 'draw') log(W, 'season', `${label} arrives: no real data past the save, so player values hold; only the supply of copies moves them.`); else
  log(W, 'season', `${label} ${real ? 'arrives (real results)' : 'arrives (drawn from real season-to-season changes)'}: ${moves.length ? `${W.cfg.valueModel === 'ovrWalk' ? 'biggest OVR risers' : 'biggest risers'} ${moves.slice(0, 3).map(fmtM).join(', ')}; fallers ${moves.slice(-2).map(fmtM).join(', ')}.` : ''}${rookies.length ? ` ${rookies.length} rookies enter the packs: ${rookies.slice(0, 5).map((c) => `${c.pos} ${c.name}`).join(', ')}${rookies.length > 5 ? '…' : ''}.` : ''} Every note on these players is now out of date.`);
  W.seasonLabel = label;
}

// 2. People change: newcomers arrive faster after rallies (and are mostly speculators, as in real hype cycles), each
//    bringing outside money; bots that lose most of their peak worth give up, and a few retire, selling everything.
function poisson(W, lam) { let k = 0, p = Math.exp(-lam), s = p, u = W.rand(); while (u > s && k < 20) { k++; p *= lam / k; s += p; } return k; }
// Word of mouth: the median bot's own return over the last 11 weeks (worth change less money it didn't earn), bots with 12 weeks of history
function botReturn11(W) { const r = []; for (const b of W.bots) { if (b.kind !== 'rule' || !b.nwh || b.nwh.length < 12 || !b.exoh || b.exoh.length < 12) continue; const w0 = b.nwh[0], w1 = b.nwh[b.nwh.length - 1], e = b.exoh[b.exoh.length - 1] - b.exoh[0]; if (w0 > 0) r.push((w1 - e) / w0 - 1); } if (!r.length) return 0; r.sort((a, b) => a - b); return r[r.length >> 1]; }
// League news flow: league news items this last 4 weeks over their 52-week weekly average, minus 1, floored at 0
const LEAGUE_NEWS = new Set(['champion', 'award', 'hof', 'retire', 'rookie', 'injury', 'return', 'season']);
function newsFlow(W) { const a = W.newsWk || [], t = W.t, w4 = Math.min(4, t), w52 = Math.min(52, t); if (w4 < 1) return 0; let s4 = 0, s52 = 0; for (let k = 0; k < w52; k++) { const x = a[t - k] || 0; s52 += x; if (k < w4) s4 += x; } return s52 > 0 ? Math.max(0, (s4 / w4) / (s52 / w52) - 1) : 0; }
// The entry multiplier, its components and each one's share of it (log shares: hype, returns, news), and the raw signals
// (20-week index rise, median 11-week bot return, news flow), for the frame only
function entryDiag(m, cs, lam, raw) { const r3 = (x) => Math.round(x * 1000) / 1000, L = Math.log(m); return { m: r3(m), hype: r3(cs[0]), ret: r3(cs[1]), news: r3(cs[2]), lam: r3(lam), share: cs.map((c) => (L > 0 ? r3(Math.log(c) / L) : 0)), raw: raw.map(r3) }; }
const popOf = (W) => ((W.botK ?? 1) === 1 ? W.cfg.population : Math.round(W.cfg.population * W.botK)); // the starting population (botScale)
function peopleChange(W) {
  const cfg = W.cfg; if (!cfg.turnover) return;
  // Neutral turnover: newcomers with random genomes arrive at a steady rate; bots that lose 70% of their peak quit
  const hp = W.hist.p, r20 = hp.length > 20 ? hp[hp.length - 1] / hp[hp.length - 21] - 1 : 0, wom = cfg.entryReturns > 0 ? botReturn11(W) : 0, nf = cfg.entryNews > 0 ? newsFlow(W) : 0;
  const mH = 1 + (cfg.entryHype || 0) * Math.max(0, r20), mR = 1 + (cfg.entryReturns || 0) * Math.max(0, wom), mN = 1 + (cfg.entryNews || 0) * nf, m = mH * mR * mN; // entryHype: more arrive after rallies (only how many, never what they do)
  const lam = cfg.entryRate * (W.botK ?? 1) * mH * mR * mN, n = poisson(W, lam); W.entryWom = wom; let joined = 0, left = 0; // the same product order as before, so old runs repeat exactly
  W.entryDiag = cfg.entryHype > 0 || cfg.entryReturns > 0 || cfg.entryNews > 0 ? entryDiag(m, [mH, mR, mN], lam, [r20, cfg.entryReturns > 0 ? wom : botReturn11(W), cfg.entryNews > 0 ? nf : newsFlow(W)]) : null; // measurement only (the raw signals too, read even when their factor is 0)
  for (let k = 0; k < n; k++) { newcomer(W); joined++; }
  for (const b of W.bots.slice()) {
    if (b.kind !== 'rule') continue;
    const w = worth(W, b); b.peak = Math.max(b.peak || 0, w);
    const gaveUp = cfg.quitRule === 'network' ? b.g?.nn && W.t - (b.joined ?? 0) > 20 && W.rand() < (cfg.quitChance ?? 0.25) * Math.max(0, (b._nnQuit ?? 0) - 0.5) * 2 // its network decides: above 0.5 it may leave, at most quitChance a week
      : w < (1 - (cfg.quitDrawdown ?? 0.7)) * b.peak && W.t - (b.joined ?? 0) > 20 && W.rand() < (cfg.quitChance ?? 0.25);
    if (!gaveUp && !(W.rand() < (cfg.retireRate ?? 0))) continue; // giving up after heavy losses is the market's doing; retiring at random is a rate we set (0 by default)
    removeBot(W, b, gaveUp ? (cfg.quitRule === 'network' ? 'chose to leave' : 'gave up after heavy losses') : 'retired'); left++;
  }
  if (cfg.populationFloor > 0) { const floor = Math.round(cfg.populationFloor * popOf(W)); let k = 0; while (W.bots.filter((b) => b.kind === 'rule').length < floor && k++ < floor) { newcomer(W); joined++; W.floorAdds = (W.floorAdds || 0) + 1; } } // only the head count is kept up
  W.turnover = { joined, left };
}

// 3. Credit cycles: lenders tighten after margin calls and defaults (lower limits, higher rates) and loosen in calm,
//    rising markets. An insolvent bot defaults: its loan is written off (those coins vanish) and its cards are sold.
function lenderCycle(W) {
  const cfg = W.cfg, L = (W.lender ||= { ltv: cfg.maxLTV, rate: cfg.interest, stress: [] });
  const c = W.credit || {}; L.stress.push((c.calls || 0) + 3 * (c.defaults || 0)); if (L.stress.length > 4) L.stress.shift();
  if (!cfg.lenderCycle) { L.ltv = cfg.maxLTV; L.rate = cfg.interest; return; }
  const s = L.stress.reduce((a, b) => a + b, 0), ph = W.hist.p, r8 = ph.length > 8 ? ph[ph.length - 1] / ph[ph.length - 9] - 1 : 0;
  const before = L.ltv;
  if (s > 3) { L.ltv = Math.max(0.15, L.ltv * 0.9); L.rate = Math.min(0.012, L.rate * 1.2); }
  else if (s === 0 && r8 > 0) { L.ltv = Math.min(cfg.maxLTV * 1.35, L.ltv * 1.02); L.rate = Math.max(cfg.interest * 0.4, L.rate * 0.97); }
  if (before - L.ltv > 0.04 && !(W.cool.tight > W.t)) { log(W, 'credit', `Lenders tighten after ${s} margin calls and defaults: borrowing limit down to ${Math.round(L.ltv * 100)}% of card value, interest up to ${(L.rate * 100).toFixed(2)}% a week.`); W.cool.tight = W.t + 8; }
  if (L.ltv - before > 0 && L.ltv > cfg.maxLTV * 1.2 && !(W.cool.loose > W.t)) { log(W, 'credit', `Easy credit: lenders now lend up to ${Math.round(L.ltv * 100)}% of card value at ${(L.rate * 100).toFixed(2)}% a week.`); W.cool.loose = W.t + 20; }
}

// 4. Fashion: each family's popularity with outside collectors drifts, sometimes jumps on hype or slumps, and feeds
//    on its own recent price gains. Collectors bid more often, and higher, for what is in fashion.
function fashionStep(W) {
  const cfg = W.cfg; if (!cfg.fashion) return;
  const F = (W.fashion ||= W.families.map(() => 0));
  const fb = famBubble(W), prev = W.famPrev || fb; W.famPrev = fb;
  for (let i = 0; i < F.length; i++) {
    const mom = prev[i] && fb[i] ? clamp(fb[i] / prev[i] - 1, -0.2, 0.2) : 0;
    F[i] = 0.96 * F[i] + W.gauss() * 0.05 + 1.5 * mom;
    if (W.rand() < 0.003) { F[i] += 0.6; log(W, 'fashion', `Fashion: collectors suddenly want ${W.families[i].pos} ${W.families[i].name} cards.`); }
    else if (W.rand() < 0.002) { F[i] -= 0.5; log(W, 'fashion', `Fashion: collectors lose interest in ${W.families[i].pos} ${W.families[i].name} cards.`); }
    F[i] = clamp(F[i], -1.2, 1.5);
  }
}

// Lineages: families of bots descended from one founder. How many survive, how deep they go, how much the largest holds
function lineageStats(W) {
  const by = new Map(); for (const b of W.bots) { if (b.kind !== 'rule') continue; const k = b.lineage ?? b.id; const x = by.get(k) || { n: 0, w: 0, depth: 0 }; x.n++; x.w += worth(W, b); x.depth = Math.max(x.depth, b.gen); by.set(k, x); }
  const xs = [...by.values()], tot = xs.reduce((s, x) => s + x.w, 0) || 1, top = xs.sort((a, b) => b.w - a.w)[0];
  return { count: xs.length, depth: Math.max(0, ...xs.map((x) => x.depth)), topShare: top ? Math.round((top.w / tot) * 1000) / 1000 : 0, topSize: top?.n || 0 };
}

// A rookie's first quote in a price-only world: the median price of cards at his position (no value to start from)
function openingPrice(W, c) { const xs = W.players.filter((x) => x.on !== false && x.pos === c.pos && x.circ > 0).map((x) => x.P).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : 5; }

// Deal the starting cards: every printed copy goes to a random bot (used at creation, or by the runner once the AI
// bots of an all-AI world are seated)
export function endow(W, bots = W.bots) {
  for (const p of W.players) { if (p.on === false) continue; for (let u = 0; u < p.S0; u++) { const x = rollCopy(W, p, 'standard'); mintCopy(W, W.pick(bots), x, p.F * copyMult(x), 0, false); } }
  for (const b of bots) { b.nwh = [worth(W, b)]; b.genStart = b.nwh[0]; }
  packCache = null; packCacheT = null;
}
// An AI bot's life ends: one heir takes the whole estate (cash, cards, loans, notes, reputation) and the memo, and
// carries on under the same seat (same model), as the next generation of its line
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function aiSuccession(W, b) {
  const line = (b.line || 1) + 1, base = b.name.replace(/ [IVX]+$/, '');
  const heir = newBot(W, AI, null, { name: `${base} ${ROMAN[line] || line}`, model: b.model, seat: b.seat, social: b.social });
  heir.line = line; heir.born = W.t; const lw = W.cfg.aiLifespanWeeks; heir.lifespanW = lw[0] + Math.floor(W.rand() * (lw[1] - lw[0] + 1));
  heir.memo = `Inherited from ${b.name} (your predecessor, ${W.t - b.born} weeks): ${b.memo || '(no memo)'}`.slice(0, 600);
  heir.lineage = b.lineage ?? b.id;
  settleEstate(W, b, [heir]);
  log(W, 'evolve', `${b.name} reaches the end of its life after ${W.t - b.born} weeks; ${heir.name} inherits ${Math.round(worth(W, heir)).toLocaleString()} coins of estate and its memo.`);
}

// The OVR walk: one tick a week per card in circulation or the pool. Higher OVR, better odds of going up; never certain.
// A card's risk rating (starts at OVR, then moves with its value) and the size of its weekly move
export function riskRating(W, c) {
  const ovr = ovrNow(W, c.id); if (c.R0 == null) { c.R0 = ovr; c.ovr0 = ovr; }
  return clamp(c.R0 + (ovr - c.ovr0) + W.cfg.riskPerDoubling * Math.log2(Math.max(1e-9, c.F) / Math.max(1e-9, c.F0)), 40, 99);
}
export const walkVol = (W, r) => lerp(W.cfg.walkVolLow, W.cfg.walkVolHigh, clamp((r - W.cfg.riskLo) / (W.cfg.riskHi - W.cfg.riskLo), 0, 1));
// Value = player factor × supply factor. Copies out = held by bots or the liquidator (outside collectors' copies are out
// of the market); the print run (the pool the player entered with) keeps a card with few copies from swinging wildly.
function factorValues(W) {
  const items = new Map(); for (const it of W.items.values()) if (it.owner) items.set(it.pid, (items.get(it.pid) || 0) + 1);
  const k = W.cfg.scarcity ?? 0.5;
  for (const p of W.players) {
    if (p.on === false) continue;
    let n = items.get(p.id) || 0; for (let j = 0; j < 16; j++) n += W.cards[p.id * 16 + j].circ;
    if (p.B == null) p.B = p.F; if (p.C0 == null) p.C0 = n; if (p.R == null) p.R = Math.max(1, p.pool);
    p.F = Math.max(0.05 * W.cfg.coinScale, p.B * ((n + p.R) / (p.C0 + p.R)) ** -k);
  }
  packCache = null; packCacheT = null;
}
function ovrWalk(W) {
  for (const c of W.players) {
    if (c.on === false) continue;
    const v = walkVol(W, riskRating(W, c));
    c.F = Math.max(0.01 * c.F0, c.F * (W.rand() < W.cfg.walkUp ? 1 + v : 1 - v));
  }
  packCache = null; packCacheT = null;
}

/* ---------- Card markets ---------- */
// A card market inherits its player's facts (name, position, club, family, the pool) and keeps its own price,
// holders and order book; its intrinsic value is the player's base value × the card's rarity premium.
function makeMarket(W, p, d, f) {
  const mult = FINISH_MULT[f] * DESIGN_MULT[d], m = Object.create(p);
  Object.defineProperties(m, {
    F: { get() { return p.F * mult; }, set(v) { p.F = v / mult; }, enumerable: true },
    pool: { get() { return p.pool; }, set(v) { p.pool = v; }, enumerable: true },
  });
  Object.assign(m, { id: mktId(p.id, d, f), pid: p.id, d, f, mult, isPlayer: false, isMkt: true, key: `${p.key}|${DESIGNS[d]}|${FINISHES[f]}`, label: `${p.pos} ${p.name} · ${FINISHES[f]} ${DESIGNS[d]}`, P: p.F * mult, P0: p.F * mult, Ph: [p.F * mult], volH: [], circ: 0, S0: 0, ohlc: [] });
  return m;
}
function resetMarkets(W, p) { for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = W.cards[mktId(p.id, d, f)]; if (!m) continue; m.P = m.P0 = m.F; m.Ph = [m.F]; } }
// The site's real price history, imported as each card's past: every market snapshot, its value × the rarity
function seedHistory(W) {
  const H = W.library.history; if (!H || W.cfg.startSeason === 'first') return;
  for (const p of W.players) {
    const vals = (H.values[p.key] || []).filter((v) => v != null).map((v) => Math.max(0.05 * W.cfg.coinScale, v / W.cfg.valueDivisor));
    if (!vals.length) continue;
    vals[vals.length - 1] = p.F;
    p.Ph = vals.slice(); p.ohlc = vals.map((v, i) => [vals[Math.max(0, i - 1)], Math.max(v, vals[Math.max(0, i - 1)]), Math.min(v, vals[Math.max(0, i - 1)]), v, 0]);
    for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = W.cards[mktId(p.id, d, f)]; m.Ph = vals.map((v) => v * m.mult); m.ohlc = p.ohlc.map((x) => [x[0] * m.mult, x[1] * m.mult, x[2] * m.mult, x[3] * m.mult, 0]); }
  }
}
// A player's price: what his cards trade for, brought back to a Prizm Base equivalent (weighted by copies and volume)
function impliedPrices(W) {
  for (const p of W.players) { if (p.dorm) continue;
    let num = 0, den = 0, vol = 0;
    for (let k = 0; k < 16; k++) { const m = W.cards[p.id * 16 + k], v = m.volH[m.volH.length - 1] || 0, w = m.circ + 2 * v; vol += v; if (w) { num += (m.P / m.mult) * w; den += w; } }
    const prev = p.P; if (den) p.P = num / den;
    p.Ph.push(p.P); if (p.Ph.length > 80) p.Ph.shift();
    p.volH.push(vol); if (p.volH.length > 60) p.volH.shift();
    (p.ohlc ||= []).push([r2(prev), r2(Math.max(prev, p.P)), r2(Math.min(prev, p.P)), r2(p.P), vol]); if (p.ohlc.length > 120) p.ohlc.shift();
  }
}
export function circOf(W, p) { if (p.dorm) return 0; let n = 0; for (let k = 0; k < 16; k++) n += W.cards[p.id * 16 + k].circ; for (const it of W.items.values()) if (it.pid === p.id && it.owner) n++; return n; }
export function resolvePlayer(W, key) { const m = W.mktByKey.get(key), it = W.items.get(key); return W.byKey.get(key) || (m && W.players[m.pid]) || (it && W.players[it.pid]) || null; }
export function resolveMarket(W, key) { const p = W.byKey.get(key); return W.mktByKey.get(key) || (p && W.cards[mktId(p.id, 0, 0)]) || null; }
export function itemsOf(W, b) { return [...(b.items || [])].map((uid) => W.items.get(uid)).filter(Boolean); }

/* ---------- Wealth groups and OVR bands (what the page compares instead of strategies and families) ---------- */
function assignGroups(W) {
  const ws = W.bots.map((b) => [b, worth(W, b)]).sort((x, y) => y[1] - x[1]), n = ws.length, a = Math.max(1, Math.round(n * 0.1)), m = Math.max(a, Math.round(n * 0.5));
  ws.forEach(([b], i) => (b._grp = i < a ? 0 : i < m ? 1 : 2));
}
const ovrNow = (W, pid) => W.era?.[pid]?.ovr ?? W.library.players[pid].ovr ?? 60;
function avgOvrOf(W, b) {
  let v = 0, s = 0; for (const [id, q] of b.h) { const c = W.cards[id], x = q * c.P; v += x; s += x * ovrNow(W, c.pid); }
  for (const it of itemsOf(W, b)) { const x = markItem(W, it); v += x; s += x * ovrNow(W, it.pid); }
  return v > 0 ? Math.round((s / v) * 10) / 10 : null;
}
// Price ÷ hidden value of the cards in circulation, per OVR band
function bandBubble(W) {
  const a = OVR_BANDS.map(() => 0), b = OVR_BANDS.map(() => 0);
  for (const c of W.cards) { if (!c.circ) continue; const k = bandOf(ovrNow(W, c.pid)); a[k] += c.P * c.circ; b[k] += c.F * c.circ; }
  return a.map((x, i) => (b[i] ? Math.round((x / b[i]) * 1000) / 1000 : null));
}
// The market value each wealth group holds in each OVR band
function bandHoldings(W) {
  const m = GROUPS.map(() => OVR_BANDS.map(() => 0));
  for (const b of W.bots) { const g = m[b._grp ?? 2]; for (const [id, q] of b.h) { const c = W.cards[id]; g[bandOf(ovrNow(W, c.pid))] += q * c.P; } for (const it of itemsOf(W, b)) g[bandOf(ovrNow(W, it.pid))] += markItem(W, it); }
  return m.map((row) => row.map((v) => Math.round(v)));
}
export function riskOf(W, pid) { const c = W.players[pid], r = riskRating(W, c); return { rating: r, vol: walkVol(W, r) }; }

/* ---------- Details for one player or one bot (the page asks for these; the world runs in a background worker) ---------- */
export function playerDetail(W, id) {
  const c = W.players[id]; if (!c) return null;
  const p = c, r1 = (x) => Math.round(x * 100) / 100;
  const grid = []; for (let k = 0; k < 16; k++) { const m = W.cards[id * 16 + k]; grid.push([r1(m.P), r1(m.F), m.circ]); }
  const items = [...W.items.values()].filter((it) => it.pid === id && it.owner).map((it) => [it.label, it.owner.name, it.owner.id, r1(markItem(W, it))]).sort((a, b) => b[3] - a[3]).slice(0, 12);
  const keys = [...(W.cardLog?.keys() || [])].filter((k) => k.startsWith(p.key + '|') || k.startsWith(`${p.pos} ${p.name} · `));
  const tape = keys.flatMap((k) => W.cardLog.get(k)).filter((j) => j.type === 'trade' || (j.type === 'auctionResult' && j.winner)).sort((a, b) => b.t - a.t).slice(0, 12).map((j) => ({ t: j.t, card: j.card, buyer: j.buyer || j.winner, seller: j.seller, price: j.price }));
  const holders = W.bots.map((b) => { let q = 0, v = 0; for (let k = 0; k < 16; k++) { const n = b.h.get(id * 16 + k) || 0; q += n; v += n * W.cards[id * 16 + k].P; } for (const it of itemsOf(W, b)) if (it.pid === id) { q++; v += markItem(W, it); } return [b.id, b.name, b._grp ?? 2, q, Math.round(v)]; }).filter((x) => x[3]).sort((a, b) => b[4] - a[4]).slice(0, 5);
  return { id, t: W.t, P: c.P, F: c.F, circ: circOf(W, c), pool: c.pool, ohlc: (c.ohlc || []).slice(-120), grid, items, nItems: [...W.items.values()].filter((it) => it.pid === id && it.owner).length, tape, holders };
}
export function botDetail(W, id) {
  const b = W.bots.find((x) => x.id === id); if (!b) return null;
  const r1 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  const positions = [...b.h].map(([cid, q]) => { const c = W.cards[cid]; return [c.pid, c.label, q, r1(avgCost(b, cid)), r1(c.P)]; });
  for (const it of itemsOf(W, b)) positions.push([it.pid, it.label, 1, r1(it.cost), r1(markItem(W, it))]);
  const g = b.g ? { keep: b.g.keep, lev: b.g.lev, lendShare: b.g.lendShare, passBid: b.g.passBid, ticketBid: b.g.ticketBid } : null;
  const shorts = (W.cardLoans || []).filter((L) => L.borrower === b).map((L) => [W.cards[L.id].pid, W.cards[L.id].label, r1(L.entry), r1(W.cards[L.id].P), L.due - W.t, !!L.force]);
  const lentOut = (W.cardLoans || []).filter((L) => L.lender === b).length;
  return { id, t: W.t, shorts, lentOut, lendCards: b.g?.lendCards ?? b.pending?.lendCards ?? 0, realized: b.stats.realized || 0, debt: b.debt || 0, lent: b.lent || 0, stats: { ...b.stats }, passes: b.passes.length, tickets: b.tickets.length, games: (b._nnGames || []).length, memo: b.memo || '', g, positions, log: (W.botLog.get(b.name) || []).filter((j) => j.type !== 'research').slice(-300).reverse(), research: (W.botLog.get(b.name) || []).filter((j) => j.type === 'research' && j.t > W.t - 8).length, packs: (W.botPacks?.get(b.name) || []).slice().reverse() };
}

// A thief's flags lift once it has gone W.cfg.flagWeeks without being caught again; trading with it resumes
function liftFlags(W) {
  const n = W.cfg.flagWeeks; if (!(n > 0)) return;
  for (const t of W.bots) {
    if (!t.flaggedBy || W.t - (t.lastCaught ?? 0) < n) continue;
    let k = 0; for (const x of W.bots) if (x.flags.delete(t.id)) k++;
    t.flaggedBy = 0; t.announced = false;
    if (k >= 5) log(W, 'flag', `${t.name}'s flags lift after ${n} weeks without being caught: ${k} bots will trade with it again.`);
    jot(W, { type: 'flagLift', bot: t.name, by: k });
  }
}

// The most valuable cards in circulation right now: every card market with copies out, and every one-of-a-kind card,
// by what it would trade at (its market price; a one-of-a-kind card at its plain card's price × its premium)
function topCards(W, k = 3) {
  const out = [];
  for (const m of W.cards) if (m.circ > 0) out.push([m.P, m.label, m.pid, Math.round(m.F), null, m.circ, m.id]);
  for (const it of W.items.values()) if (it.owner) out.push([markItem(W, it), it.label, it.pid, Math.round(intrinsicItem(W, it)), it.owner.name, 1, null]);
  out.sort((a, b) => b[0] - a[0]);
  const g = guideOn(W.cfg); // the guide brought to this card: the player's guide value × the card's premium
  return out.slice(0, k).map(([P, label, pid, F, owner, n, id]) => ({ label, pid, P: Math.round(P), F, owner: owner ?? holderOf(W, id), n, ...(g && W.players[pid].guide > 0 ? { G: Math.round(W.players[pid].guide * (F / Math.max(1e-9, W.players[pid].F))) } : {}) }));
}
function holderOf(W, id) { let best = null, q = 0; for (const b of W.bots) { const x = b.h.get(id) || 0; if (x > q) { q = x; best = b.name; } } if (best) return best; if ((W.liq?.get(id) || 0) > 0) return 'the liquidator'; const au = W.auctions.find((a) => a.cardId === id && !a.uid); return au ? `up for auction by ${au.seller === 'liq' ? 'the liquidator' : au.seller.name}` : null; }

/* ---------- Card lending and short selling ---------- */
// A holder may lend some of its cards. A short seller borrows a copy, posts collateral, sells it, pays the lender a
// weekly fee (and any royalty the card earns), and must buy a copy back and return it within cardLoanWeeks. It is
// forced to buy back when its worth falls below shortMaintenance × what it owes, or at the deadline; a borrower that
// can't find a copy for 3 weeks settles in cash. A copy it holds of a card it is short goes back to the lender.
function bump(b, k, id, q) { const m = (b[k] ||= new Map()), v = (m.get(id) || 0) + q; v > 0 ? m.set(id, v) : m.delete(id); }
export function owedValue(W, b) { let v = 0; if (b.owed) for (const [id, q] of b.owed) v += q * W.cards[id].P; return v; }
export function lentValue(W, b) { let v = 0; if (b.lentOut) for (const [id, q] of b.lentOut) v += q * W.cards[id].P; return v; }
const lendShareOf = (b) => (b.kind === 'ai' ? b.pending?.lendCards || 0 : b.g?.nn ? b.g.lendCards || 0 : 0);
function lendPool(W) {
  W.lendPool = new Map(); W.lendable = new Map();
  for (const b of W.bots) { const sh = lendShareOf(b); if (!(sh > 0)) continue; for (const [id, q] of b.h) { const k = Math.floor(q * sh + 0.5); if (k < 1) continue; let l = W.lendPool.get(id); if (!l) W.lendPool.set(id, (l = [])); l.push({ b, k }); W.lendable.set(id, (W.lendable.get(id) || 0) + k); } }
}
function borrowCard(W, b, c) {
  const pool = W.lendPool?.get(c.id); if (!pool) return false;
  const m = W.cfg.shortMargin * c.P; if (b.cash < m) return false;
  const e = pool.find((x) => x.k > 0 && x.b !== b && !blocked(x.b, b) && (x.b.h.get(c.id) || 0) > 0); if (!e) return false;
  e.k--; W.lendable.set(c.id, (W.lendable.get(c.id) || 1) - 1);
  give(e.b, c, -1); give(b, c, 1); bump(e.b, 'lentOut', c.id, 1); bump(b, 'owed', c.id, 1);
  b.cash -= m; b.shortColl = (b.shortColl || 0) + m; addLot(b, c, c.P, W.t); tkAdd(W, b, 'shorts'); tkAdd(W, e.b, 'cardsLent');
  (W.cardLoans ||= []).push({ id: c.id, lender: e.b, borrower: b, entry: c.P, coll: m, week: W.t, due: W.t + W.cfg.cardLoanWeeks });
  return true;
}
function closeLoan(W, L, why, settle, lenderGone) {
  const c = W.cards[L.id], b = L.borrower, ln = L.lender;
  b.shortColl -= L.coll; b.cash += L.coll; bump(b, 'owed', L.id, -1); bump(ln, 'lentOut', L.id, -1);
  if (settle != null) { // cash instead of the card
    if (lenderGone) { b.cash -= settle; W.treasury += settle; }
    else { const pay = Math.max(0, Math.min(settle, b.cash)); b.cash -= pay; ln.cash += pay; if (pay < settle) ln.stats.lostOnLoans = (ln.stats.lostOnLoans || 0) + settle - pay; }
    const pnl = L.entry - settle; b.stats.realized = (b.stats.realized || 0) + pnl;
    jot(W, { type: 'forcedCover', bot: b.name, lender: ln.name, card: c.key, price: r2(settle), entry: r2(L.entry), why });
    if (W.ord) W.ord.forced = (W.ord.forced || 0) + 1;
  }
  W.cardLoans = W.cardLoans.filter((x) => x !== L);
}
function shortUpkeep(W) {
  lendPool(W); const cfg = W.cfg;
  for (const L of (W.cardLoans || []).slice()) {
    const c = W.cards[L.id], b = L.borrower, fee = cfg.cardLendFee * c.P;
    b.cash -= fee; L.lender.cash += fee; flowOut(W, b, fee); flowIn(W, L.lender, fee);
    const under = worth(W, b) < cfg.shortMaintenance * owedValue(W, b);
    if (!L.force && (L.due <= W.t || under)) { L.force = W.t; jot(W, { type: 'shortCall', bot: b.name, card: c.key, price: r2(c.P), entry: r2(L.entry), why: L.due <= W.t ? 'due' : 'margin' }); }
    if (L.force && (W.t - L.force >= (cfg.coverGraceWeeks ?? 3) || b.cash + L.coll < c.P)) { closeLoan(W, L, L.due <= W.t ? 'not returned in time' : 'margin', c.P * (cfg.coverSettle ?? 1.1), false); continue; }
    if (L.force) { if (L.coll) { b.cash += L.coll; b.shortColl -= L.coll; L.coll = 0; } // forced to buy it back, collateral released to pay for it
      let p = c.P * (cfg.coverBid ?? 1.15); if (b.g?.nn) { const nw = Math.max(NW_FLOOR * cfg.coinScale, worth(W, b)); p = nnPrice(W, b, c, cardNet(W, b, c, nw, marketCtx(W))); } // a neural borrower names its own price, as for any bid
      bid(b, c, Math.min(b.cash, p)); }
  }
  for (const b of W.bots) if (b.kind === 'ai') for (const x of b.pending?.short || []) { const c = resolveMarket(W, x.player); if (c && (b.h.get(c.id) || 0) === 0 && borrowCard(W, b, c)) ask(b, c, Number(x.price) > 0 ? Number(x.price) : c.P, new Map()); }
}
// After clearing: a short seller holding a copy of a card it owes returns it (a short whose sale didn't fill is undone)
function settleShorts(W) {
  for (const L of (W.cardLoans || []).slice()) {
    const b = L.borrower, c = W.cards[L.id]; if ((b.h.get(L.id) || 0) < 1) continue;
    give(b, c, -1); give(L.lender, c, 1);
    const lot = b.lots?.get(L.id)?.shift(), cost = lot ? lot[0] : L.entry;
    if (L.week < W.t) { const pnl = L.entry - cost; b.stats.realized = (b.stats.realized || 0) + pnl; if (W.flow) W.flow.realized[b._grp ?? 2] += pnl; jot(W, { type: 'cover', bot: b.name, lender: L.lender.name, card: c.key, entry: r2(L.entry), price: r2(cost), weeks: W.t - L.week }); if (W.ord) W.ord.covers = (W.ord.covers || 0) + 1; }
    // (a short whose sale didn't fill this week is simply undone)
    closeLoan(W, L, null, null, false);
  }
  for (const L of W.cardLoans || []) if (L.week === W.t && !L.logged) { L.logged = true; if (W.ord) W.ord.shorts = (W.ord.shorts || 0) + 1; jot(W, { type: 'short', bot: L.borrower.name, lender: L.lender.name, card: W.cards[L.id].key, price: r2(W.cards[L.id].P) }); }
}

/* ---------- The liquidator ---------- */
// Cards of bots that defaulted or left. Each card's price is fixed when it arrives and only falls in weeks when no copy
// of it sells: the discount never resets against a price the liquidator itself is pushing down.
function toLiq(W, id, q) { if (!(q > 0)) return; W.liq.set(id, (W.liq.get(id) || 0) + q); const L = (W.liqPrice ||= new Map()); if (!L.has(id)) L.set(id, W.cfg.liqStart * W.cards[id].P); }
function liqAsk(W, id) { const L = (W.liqPrice ||= new Map()); if (!L.has(id)) L.set(id, W.cfg.liqStart * W.cards[id].P); return L.get(id); }
function liqCut(W) {
  const sold = W.liqSold || new Set(); W.liqSold = new Set();
  if (W.cfg.liquidation === 'chase' || !W.liqPrice) return;
  for (const [id] of W.liq) if (!sold.has(id) && W.liqPrice.has(id)) W.liqPrice.set(id, Math.max(0.05 * W.cfg.coinScale, W.liqPrice.get(id) * (1 - W.cfg.liqStep)));
}
// Internals for the targeted tests in tests/ (not part of the engine's interface)
export const TEST = { socialPhase, tokenMarket, forcedSales, repayForced, nnAnswers, nnThink, nnAct, shortUpkeep, packAuction, aiOrders, aiSocial, nnPrice, cardNet: (W, b, c) => cardNet(W, b, c, Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), marketCtx(W)), hot: () => hot, books: () => ({ bids, asks }), setBooks: (W) => { W_ = W; bids = W.cards.map(() => []); asks = W.cards.map(() => []); }, BOT_SHAPE, netSize };
