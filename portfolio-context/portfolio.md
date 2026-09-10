---
title: "Portfolio Context"
as_of: 2026-09-10
owner: your-github-username
risk: moderate
rebalance_band: 0.05
holdings_csv: data/holdings.csv
quotes_json: data/quotes.json
tags: [portfolio, holdings, watchlist]
---

# Portfolio

Core: AAPL/MSFT/NVDA. Cash buffer kept for rebalancing. Thesis: quality
large-cap compounders with satellite positions in semis.

<!-- Edit `data/holdings.csv`, not this block — the Action rewrites it daily. -->
## Holdings (auto-synced)
<!-- QUOTES:START -->
_Quotes not synced yet — run the "Portfolio quotes" GitHub Action once_
_(Actions tab → Portfolio quotes → Run workflow)._
<!-- QUOTES:END -->

## Watchlist
See `data/watchlist.csv`.

## How LLMs should use this file
- `holdings.csv` is the source of truth for positions (shares, avg cost).
- `quotes.json` has machine-precise latest prices (updated daily, US market days).
- Prices may be delayed ~15–30 min / up to one trading day; say so if precision matters.
