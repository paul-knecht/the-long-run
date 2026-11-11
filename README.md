# The Long Run · Auf lange Sicht

A browser game about investing in ETFs. You live twenty years of a financial life in about ten to
fifteen minutes, on real stock market history that you cannot see coming.

Each year you decide how much of your income to put aside and how to split new money between an
ETF and a savings account. People write to you with advice: an uncle who calls the stock market a
casino, a bank advisor with an expensive managed fund, a friend with a hot stock. A grandmother
sends money, a car bill arrives, you get a raise. At some point the market crashes, the screen
takes over, and you decide to sell, hold or buy more without knowing what comes next.

Nothing is explained while you play. At the end the game reveals which years you lived through,
shows your result next to the paths you did not take, and explains what happened in seven short
cards, each computed from your own run and from all of the bundled history. A practice step then
walks you through setting up a savings plan, with a checklist for doing it for real.

The game is in English and German (it follows the browser's language and can be switched at any
time without losing the run). It has no accounts, no tracking, no cookies, no sound, and makes no
requests to other sites. Nothing is stored; a reload starts afresh.

## Run it

You need Node.js 22 and npm.

```sh
npm ci            # install the exact dependencies from package-lock.json
npm run dev       # start a local server with hot reload, then open the address it prints
npm test          # run the test suite once (Vitest)
npm run lint      # check the code (oxlint)
npm run build     # type-check and build the static site into dist/
npm run preview   # serve the built site from dist/ locally
```

`npm run build:data` rebuilds `src/data/market.json` from `data/raw/data.csv`. It is only needed if
the raw data changes.

### Where things are

- `src/sim/`: the simulation (market, accounts, events, the paths not taken, statistics). It has no
  screen code in it and carries most of the tests.
- `src/ui/`: the screens, written in React with plain CSS; the chart is drawn directly as SVG.
- `src/i18n/`: every text in English (`en.ts`) and German (`de.ts`), and number formats.
- `src/data/market.json`: the market and interest data the game ships with.
- `data/raw/`: the downloaded source data and its notes (`SOURCE.md`).
- `scripts/build-data.ts`: turns the raw data into `market.json`.
- `docs/superpowers/`: the design and the implementation plan the game was built from. You may want
  to keep these out of the public repository (see step 2 below).

## The data

The market history is Robert Shiller's monthly US stock market data, as packaged by DataHub in its
S&P 500 dataset (<https://datahub.io/core/s-and-p-500>), downloaded on 2026-11-11 from
<https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv>. The game uses the
price, the dividend and the long-term interest rate, monthly from 1871 to June 2023 (the last month
with both a price and a dividend).

**Licence.** DataHub publishes the dataset under the ODC Public Domain Dedication and License
(PDDL). DataHub's maintainers note that Shiller's original data carries no explicit licence and
treat it as public domain because it is factual data.

**Caveats.**

- This is a US series, not a worldwide one. The game says so in its reveal and small print and never
  presents it as a worldwide ETF; a worldwide ETF spreads the same idea across many more countries.
  No openly licensed monthly worldwide series reaching back that far was found.
- Shiller's monthly prices are averages of the daily closes, not month-end closes, so the sharpest
  days of a crash are smoothed out.
- Returns are in US dollars and shown in the game as euros.

Each run draws a 20-year stretch of this history at random. Only stretches with a serious fall
(at least 25% from a high, coming after the first three years) are used, so every run meets a real
crash.

## Simplifications

- **Nominal amounts.** Inflation is not modelled. Salaries are in today's money even when the hidden
  years are long ago, and nothing is adjusted for inflation.
- **No exchange rates.** The US market moves in US dollars and the game shows the same numbers as
  euros.
- **No taxes**, and no transaction fees beyond the costs named here.
- **Costs.** The ETF costs 0.2% a year (the top of the range of roughly 0.05 to 0.2% that worldwide
  ETFs cost), with no fee on savings plan instalments. The bank's managed fund takes 5% of money
  going in and 1.8% a year.
- **The savings account** pays an approximation: the US long-term interest rate of the same month
  minus one percentage point, never below zero.
- **Monthly averages.** The game moves one month at a time on monthly average prices.
- **Your own path stays yours.** Every path not taken replays your own monthly contributions, so a
  comparison never rewards or punishes how much you saved.

## Not investment advice

This game is education, not investment advice. It does not recommend any fund, broker or product.
Past performance is no guarantee of future results, and the history shown is one country's.

## Publishing on GitHub Pages

The build uses relative paths (`base: './'` in `vite.config.ts`), so the site works under any
repository name. The workflow in `.github/workflows/deploy.yml` installs, tests, builds and
publishes the site on every push to `main` (and can be started by hand from the Actions tab).

1. **Create the repository** on GitHub, empty (no README, licence or .gitignore), under any name.
   On a free account Pages needs the repository to be public.
2. **Push** the code to its `main` branch. If `docs/superpowers/` should not be public, note that
   it is part of the very first commit: deleting it in a new commit still publishes it through the
   history, so push a history that never contained it (for example one fresh commit of the
   finished game). Otherwise, merge the branch the game was built on (`build/game`) into `main`,
   add the repository as the remote and push:
   ```sh
   git switch main && git merge build/game
   git remote add origin https://github.com/<you>/<repository>.git
   git push -u origin main
   ```
3. **Enable Pages**: in the repository's Settings, under Pages, set "Build and deployment" →
   "Source" to **GitHub Actions**. The workflow from step 2 then deploys the site (if it ran before
   this was set, run it again from the Actions tab). The game appears at
   `https://<you>.github.io/<repository>/`.
