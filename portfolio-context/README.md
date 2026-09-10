# portfolio-context — one linkable source of truth for your portfolio

Give any AI chat your **current** holdings with a single URL instead of
re-pasting screenshots. Raw GitHub URLs are fetchable by ChatGPT, Claude, etc.:

> Read https://raw.githubusercontent.com/&lt;you&gt;/MDgen/main/portfolio-context/portfolio.md
> and the CSV it references, then advise on rebalancing.

## Files

| File | Purpose | Edited by |
|---|---|---|
| `portfolio.md` | LLM-facing overview: front matter + auto-synced quotes table | you (except the QUOTES block) |
| `data/holdings.csv` | **Source of truth**: symbol, shares, avg cost, account, notes | you |
| `data/watchlist.csv` | Tickers you watch + thesis + price target | you |
| `data/quotes.json` | Latest prices as machine-precise JSON | the Action (daily) |
| `../.github/workflows/portfolio-quotes.yml` | Fetches keyless [Stooq](https://stooq.com) CSV quotes every weekday and commits the result | automatically |
| `scripts/update_quotes.py` | The script the Action runs (Python stdlib only) | rarely |

## Setup (2 minutes)

1. Publish this repo to GitHub (see the top-level README).
2. Edit `data/holdings.csv` and `data/watchlist.csv` — the GitHub web editor
   works great for CSVs.
3. Run the action once manually: **Actions → Portfolio quotes → Run workflow**.
   From then on it runs at 06:00 PT every weekday. $0.

## Linking in an AI chat

```
Read these two URLs and remember them as my portfolio context:
- https://raw.githubusercontent.com/<you>/MDgen/main/portfolio-context/portfolio.md
- https://raw.githubusercontent.com/<you>/MDgen/main/portfolio-context/data/quotes.json
Question: given my current positions, what rebalancing would you consider?
```

- **Public repo** → raw URLs work in any chat with no auth (recommended if holdings aren't sensitive).
- **Private repo** → raw URLs need auth, so paste `portfolio.md` content instead, or keep
  `portfolio.md` public in this repo and your real `holdings.csv` elsewhere.

## Refreshing quotes on your own machine

```bash
python3 portfolio-context/scripts/update_quotes.py
```

No dependencies — Python 3.9+ standard library only.
