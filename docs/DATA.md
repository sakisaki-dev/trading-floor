# Data provenance

## Source

The league data comes from one personal save of *Retro Bowl*, a mobile American football game by New Star Games.
The save follows one league over many seasons; the market history used here covers seasons Y79 to Y88. League
statistics were transcribed from screenshots of the game's screens (player career cards, the Super Bowl list,
the staff screen, the record board, rosters) through the upload pipeline of the RetroVault fan site
(https://sakisaki-dev.github.io/RetroVault/). Each upload is a manifest of structured changes, applied and logged,
and checked by the site's audit (totals that fall are refused as misreads; every change carries a source and reason).
No screenshots are included in this repository or in the RetroVault repository.

Values such as OVR, skill grade, Career Legacy and card value are not read from the game. The site computes them from
the transcribed statistics with its own published formulas.

Team names follow the NFL's clubs, as the game does. This project is not affiliated with or endorsed by the NFL or
New Star Games.

Some files also use public data from nflverse (https://github.com/nflverse/nflverse-data) and college rosters, as
listed below. Their terms are those of their publishers.

## The files in `data/`

Kinds:

- **Transcribed**: statistics read from the save's screenshots.
- **Site-derived**: computed by the RetroVault site's rules from the transcribed statistics.
- **Measured**: counted from the save's data (or from real NFL data, where stated) by a script in this repository.
- **Generated**: made by a script, not observed anywhere.

| File | Contents | Kind | Built by |
|---|---|---|---|
| `library.json` | 203 players as of Y88: position, club, nickname, career statistics, career rates, OVR, skill, grade, Career Legacy, Hall of Fame flag, three "plays like" comparisons, family, and `hidden.value` (the site's card value, which only the engine reads) | Statistics transcribed; everything else site-derived | `build_library.py` |
| `timeline.json` | The save's 10 real seasons, Y79 to Y88 (119 players in Y79, 203 in Y88): for each player, value, OVR, skill, grade, Career Legacy and career totals at the last market snapshot of each season | Career totals transcribed; the rest site-derived | `timeline.ts` |
| `history.json` | Every market snapshot of the site, with each player's card value (null before he had a card) | Site-derived | `timeline.ts` |
| `families.json` | Each player's play-style family, as the site's Stats page groups them | Site-derived | `families.ts` |
| `kits.json` | For each player, whether his club has alternate and throwback (era) kits, and the autographs' mean value multiplier | Site design tables (not from the save) | `kits.ts` |
| `league_rates.json` | Rates for the league simulation: full season (17 games), games missed by position and stage, season-to-season form swings, rookie arrivals and position mix, retirement by stage and production third, award counts and positions, Career Legacy growth per game and per point of production, the pressure shift, the League Scores of the game's real NFL legends, injured seasons, early-career season lines | Measured from the save (legend scores from the site's legends file) | `measure_league.mjs` |
| `nfl_age.json` | Share of weeks on reserve by age, relative injury risk by age (21–38), chance a career ends at each age (up to 40), rookie entry ages | Measured from real NFL data: nflverse weekly rosters for 2016, 2018, 2020, 2022 and 2023, regular-season weeks | `measure_nfl_age.mjs` |
| `rookie_names.json` | 5,000 names for new players, mixed from first and last names of NFL players (nflverse `players.csv`), NFL combine prospects (nflverse `combine.csv`) and FBS/FCS rosters (ESPN), checked against 41,890 real names so no name matches a real player or a league player | Generated | Not in this repository (see below) |
| `names.json` | Common first names and surnames for bot names | Generated (generic lists, no real individuals) | Not in this repository |

What the save cannot give, and what the model assumes instead (weekly stat lines, injury spells, age), is listed in
[MODEL.md](MODEL.md), section 7.1.

The save is thin in places: 16 injured seasons in total, 7 MVP and 7 OPOY winners, and 1 to 6 rookie arrivals a season.
`league_rates.json` marks cells with fewer than 20 observations (`thinCellMinimum`); the engine pools them.

## Rebuilding the data

The build scripts read a RetroVault checkout. They were written to live in its `sandbox/` folder and use paths
relative to it (`public/data/...`, `data/y80/...`, `src/...`, `sandbox/data/...`). To rebuild:

1. Clone RetroVault and copy the scripts into `<RetroVault>/sandbox/`.
2. Run them from the RetroVault root (or as noted), in this order:

```bash
cd <RetroVault>
python3 sandbox/build_library.py                 # public/data → sandbox/data/library.json
npx tsx sandbox/timeline.ts                      # data/y80/market_history.json → sandbox/data/timeline.json, history.json
npx tsx sandbox/families.ts                      # public/data/initial-data.csv → sandbox/data/families.json
npx tsx sandbox/kits.ts                          # uniform tables + library.json → sandbox/data/kits.json
node sandbox/measure_league.mjs                  # timeline.json + public/data/legends.json → sandbox/data/league_rates.json
node sandbox/measure_nfl_age.mjs <roster dir>    # nflverse roster_weekly_<year>.csv files → sandbox/data/nfl_age.json
```

3. Copy the outputs from `<RetroVault>/sandbox/data/` into this repository's `data/`.

`measure_nfl_age.mjs` needs the nflverse weekly roster files (release `weekly_rosters`) downloaded to a folder.
`build_library.py` reads `public/data/initial-data.csv`, `public/data/market.json` and
`public/data/player-extras.json`, which the site's own `npm run rebuild` produces. `families.ts`, `timeline.ts` and
`kits.ts` import the site's TypeScript modules (`src/utils/marketHistory`, `src/config/families`, the uniform tables).

The scripts that produced `rookie_names.json` and `names.json` are not in this repository or in the RetroVault
checkout we looked at. Their `source` fields describe how they were made.

All of the scripts are deterministic. The data in this repository was last built from RetroVault on 2026-11-06
(RetroVault commit `9bc7988`), at season Y88. A later RetroVault update (new seasons) changes these files, and runs
made with different data are not comparable.

## Checksums

SHA-256 of the data files at engine version 1.0.0:

```
6142e060d2b971bdee3e75adb9827c7ca0d2870405f90dcd5339775b3f4057b8  data/families.json
1a46934f52121a7ff6392fe87a466fd3dc45caeb1aad1c57a994fed3cda04917  data/history.json
40ce18e0293029dadcf367178a821686d4c790a278a290d46324cbcd293b9738  data/kits.json
1f9d832b1d4cbeb4e16c10ce61615d71cb68726a36acf5e492483a12c51a8858  data/league_rates.json
c71100bae0b9facf434ab45fb32542fc5954b48645c518a8275a27874f3efb95  data/library.json
6e4eca51e6c2977bdbe265fd76a7811b2e2b452e9deaf41635741d786dea1d7d  data/names.json
090f298412a120247c6bd932bedd1c0825583046787281438b444b14bf521475  data/nfl_age.json
9f66be8fcaaadd954c94fcbc41f569254cd991b3729b95f7a649305f5d836603  data/rookie_names.json
3d2df28606517af7f3c5fb59cbd791e9f741ace623304cff206ae4789cf255bf  data/timeline.json
```

Check with `shasum -a 256 data/*.json`.
