# Market data source

- **File:** `data.csv`
- **Origin:** DataHub, "S&P 500" dataset, which packages Robert Shiller's US stock market data (monthly, from 1871).
  Dataset page: https://datahub.io/core/s-and-p-500
  Downloaded from: https://raw.githubusercontent.com/datasets/s-and-p-500/main/data/data.csv
- **Downloaded:** 2026-11-11
- **Columns used:** `Date`, `SP500`, `Dividend`, `Long Interest Rate`
- **Licence:** ODC Public Domain Dedication and License (PDDL), as stated by DataHub. DataHub's maintainers note that
  Shiller's original carries no explicit licence and treat it as public domain because it is factual data.

## Caveats

1. Shiller's monthly prices are averages of daily closes, not month-end closes, so crashes are slightly smoothed.
2. This is a US series. The game must name it as such and never present it as a worldwide ETF.
   Returns are in US dollars, shown in the game as euros.

## Derived series

`scripts/build-data.ts` turns the CSV into `src/data/market.json`:
stock return = (price + dividend / 12) / previous price - 1 (Shiller's dividend is an annual rate);
cash return = max(0, long interest rate - 1 percentage point) / 12 per month, an approximation of a savings account.
The series ends at the last month that has both a price and a dividend.

## Ruled out

- The MSCI World monthly series: licensed, not redistributable.
- Open macro-history reconstructions of a world index: yearly, not monthly.
- Kenneth French's data library: no explicit redistribution terms found.

The fallback, per spec 7.1, is the longest freely usable series, which is this one.
