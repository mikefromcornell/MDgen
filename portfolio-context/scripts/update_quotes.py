#!/usr/bin/env python3
"""
Update portfolio-context quotes — free forever, no API keys, stdlib only.

- Reads data/holdings.csv + data/watchlist.csv for the symbol list
- Fetches keyless CSV quotes from Stooq (US symbols get the .us suffix)
- Writes data/quotes.json
- Rewrites the <!-- QUOTES:START --> ... <!-- QUOTES:END --> block in portfolio.md
- Exits 0 and leaves files untouched if the feed has a bad day (rate-limit etc.)
"""
import csv
import datetime
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PORTFOLIO_MD = ROOT / "portfolio.md"


def stooq_symbol(sym: str) -> str:
    s = sym.strip().lower()
    if not s or s == "cash":
        return ""
    return s if "." in s else f"{s}.us"


def load_symbols():
    symbols = []
    for name in ("holdings.csv", "watchlist.csv"):
        path = DATA / name
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                sym = (row.get("symbol") or "").strip()
                if sym and sym.upper() != "CASH":
                    symbols.append(sym.upper())
    return sorted(set(symbols))


def fetch_quotes(symbols):
    remote = sorted({stooq_symbol(s) for s in symbols if stooq_symbol(s)})
    if not remote:
        return {}
    url = f"https://stooq.com/q/l/?s={','.join(remote)}&f=sd2t2ohlcv&h&e=csv"
    req = urllib.request.Request(url, headers={"User-Agent": "portfolio-context/1.0"})
    text = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    quotes = {}
    for row in csv.DictReader(text.splitlines()):
        sym = (row.get("Symbol") or "").upper()
        plain = sym.replace(".US", "")
        try:
            last = float(row["Close"])
            opening = float(row["Open"])
        except (TypeError, ValueError):
            continue  # N/D row — symbol unknown or feed hiccup
        quotes[plain] = {
            "last": last,
            "open": opening,
            "high": float(row.get("High") or last),
            "low": float(row.get("Low") or last),
            "volume": int(float(row.get("Volume") or 0)),
            "date": row.get("Date") or "",
        }
    return quotes


def build_table(symbols, quotes):
    lines = [
        "| Symbol | Last | Day chg* | High | Low | Volume |",
        "|--------|------|----------|------|-----|--------|",
    ]
    for sym in symbols:
        q = quotes.get(sym)
        if not q:
            lines.append(f"| {sym} | n/a | — | — | — | — |")
            continue
        chg = (q["last"] - q["open"]) / q["open"] * 100 if q["open"] else 0.0
        lines.append(
            f"| {sym} | {q['last']:,.2f} | {chg:+.1f}% | "
            f"{q['high']:,.2f} | {q['low']:,.2f} | {q['volume']:,} |"
        )
    lines.append("")
    lines.append("*day change vs. open (Stooq delayed quotes, keyless feed)")
    return "\n".join(lines)


def main():
    symbols = load_symbols()
    if not symbols:
        print("no symbols found — exiting", file=sys.stderr)
        return 0
    quotes = fetch_quotes(symbols)
    if not quotes:
        print("feed returned nothing usable — leaving existing files untouched")
        return 0

    as_of = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    (DATA / "quotes.json").write_text(
        json.dumps({"as_of": as_of, "quotes": quotes}, indent=2) + "\n", encoding="utf-8"
    )

    table = f"_Updated {as_of} (UTC) — {len(quotes)}/{len(symbols)} symbols_\n\n"
    table += build_table(symbols, quotes)

    md = PORTFOLIO_MD.read_text(encoding="utf-8")
    start, end = "<!-- QUOTES:START -->", "<!-- QUOTES:END -->"
    if start in md and end in md:
        before, rest = md.split(start, 1)
        _, after = rest.split(end, 1)
        md = before + start + "\n" + table + "\n" + end + after
        PORTFOLIO_MD.write_text(md, encoding="utf-8")
        print(f"updated quotes for {len(quotes)} symbols ({as_of})")
    else:
        print("QUOTES markers missing in portfolio.md — quotes.json updated only")
    return 0


if __name__ == "__main__":
    sys.exit(main())
