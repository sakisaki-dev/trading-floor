# Contributing

Thanks for looking. The most useful contributions are experiments, bug reports against the engine, and
replications on new seeds.

## The one rule

**The world sets factors, never behaviour.** A rule may set a quantity (a fee, a tax, a rate, a budget, a chance) or a
mechanism (how an auction clears, how a price is marked). It may not tell bots what to do, push prices in a direction,
or step in when something goes wrong. If the bots do something surprising, that's a result, not a bug, unless the
code is doing something it shouldn't. Fix bugs; report behaviour.

No bot may see a player's hidden value, directly or through anything derived from it. Measurements and the page's
health board read the world but nothing in the world reads them.

## Proposing an experiment

Open an issue with the **Experiment proposal** template. A good proposal:

1. asks one question;
2. changes **one setting** against the default (an A/B on the same seeds);
3. runs on **at least three seeds**, and the same seeds in both arms;
4. names the measures it will report before running (from [METRICS.md](docs/METRICS.md));
5. cites the **engine version** ([CHANGELOG.md](CHANGELOG.md)) with every number.

Results from different engine versions are not comparable; say which you used.

## Reporting an engine bug

Open an issue with the **Bug in the engine** template: the seed, the settings, the engine version, the week, what
happened and why it's wrong. A save or a short `sim.mjs` command that reproduces it is the best evidence. Money that
appears or vanishes, hidden value leaking into a decision, or a run that differs between two identical runs are
always bugs.

## Changing the code

- `npm test` must pass, including the determinism check (the same seed and settings give identical frames).
- If you change `engine.mjs`, rebuild the page (`node tools/build_page.mjs`) and commit `docs/trading-floor.html`; CI
  checks that it matches.
- Any change that can alter results bumps the engine version and gets a CHANGELOG entry (the versioning rule is at the
  top of the changelog).
- Keep new settings off by default unless the change is a bug fix.
