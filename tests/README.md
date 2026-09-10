# MDgen tests

## Unit tests (zero dependencies)

Covers the pure Markdown pipeline in `app.js`: token estimates, slug + front
matter, heading/list/table/code cleanup, compacting, chunking, CSV parsing,
geometry-aware TSV → Markdown (headings, tables, bullets, paragraph merge),
plain-text heuristics, AI-output sanitization, share-link encoding.

```bash
node tests/unit.test.js
```

## End-to-end (optional — needs Chromium)

Exercises the **real browser path**: vendored tesseract worker + WASM core +
bundled English OCR model, drag-in conversion, cleanup + compact buttons,
preview rendering, CSV, and a scanned (image-only) PDF.

```bash
# 1. serve the app
python3 -m http.server 8000

# 2. one-time test setup (outside the app — MDgen itself has no dependencies)
cd tests
npm init -y && npm i playwright-core
npx playwright-core install chromium --only-shell

# 3. run
node e2e.playwright.js        # APP_URL=http://localhost:8000 by default
```

`fixtures/screen.png` is a synthetic screenshot (heading, wrapped paragraph,
bullets, table). `fixtures/scan.pdf` is the same content as an image-only PDF.
