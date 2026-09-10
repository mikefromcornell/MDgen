<div align="center">

# MDgen

**Images & docs → AI-ready Markdown. Free forever, fast, private, in your browser.**

Paste a screenshot (`Ctrl/Cmd+V`), drop a file, or pick one — get clean,
token-efficient GitHub-flavored Markdown with YAML front matter, ready to paste
into ChatGPT / Claude / Gemini or upload as a `.md`.

`PNG · JPG · WEBP · GIF · BMP · PDF · DOCX · TXT · CSV → .md`

![MIT](https://img.shields.io/badge/license-MIT-blue) ![cost](https://img.shields.io/badge/cost-%240-brightgreen) ![build](https://img.shields.io/badge/build%20step-none-brightgreen) ![offline](https://img.shields.io/badge/offline-PWA-blueviolet)

</div>

---

## Why

LLMs want clean text, not pixels. MDgen is the 10-second path:

```
screenshot ──▶ MDgen ──▶ clean .md (headings, lists, tables, code) ──▶ paste into AI
```

- **Free forever** — static site, no server, no accounts, no tracking, no build
  step, no required keys. The only possible cost is *your own* optional AI key
  (Gemini has a no-credit-card free tier).
- **Fast** — libraries and OCR engine are **vendored in this repo** (no CDN):
  instant repeat loads, offline after first visit (PWA). Typical screenshot →
  Markdown in ~5–10 s with the local engine.
- **Accurate** — geometry-aware OCR post-processing infers headings (from font
  height), **tables (from column alignment)**, lists and code fences — not just
  raw text. For handwriting/messy layouts, one click re-runs a vision LLM.

## Two engines

| Engine | Best for | Privacy | Cost |
|---|---|---|---|
| **Local OCR** *(default)* | screenshots, docs, terminal, articles | 🔒 image never leaves your device, works offline | free |
| **AI Vision (BYOK)** | handwriting, complex tables, charts, diagrams | the image goes **browser → provider directly** with *your* key; key lives in `localStorage` only | free with Gemini's free tier |

Get a free Gemini key at [aistudio.google.com](https://aistudio.google.com) →
Settings ⚙ in MDgen → paste, test, done. The default model
(`gemini-2.5-flash`) has a permanent no-card free tier (~1,500 requests/day as
of Sep 2026 — check AI Studio for your live quota). **Note:** on Google's free
tier, submitted content may be used for training — MDgen warns you every time
you enable AI Vision. OpenAI is supported too (paid), and both model names are
editable in Settings.

## What's in the box

- **Paste / drag-drop / browse**, batch queue with per-file progress + cancel
- **PDFs**: native text layer when present (lossless + instant), per-page OCR
  fallback for scans — merged with `## Page N` separators
- **DOCX** (mammoth), **TXT**, **CSV** → GFM tables (delimiter auto-detect, first
  200 rows + truncation note)
- **Markdown Studio**: editable output + sanitized live preview, YAML front
  matter toggle, title field
- **One-click cleanup**: fix heading hierarchy, normalize lists, tidy tables,
  de-hyphenate, trim blank lines, wrap code fences
- **Token efficiency**: live `~tokens / chars / words`, **⚡ Compact** (avg
  ~25% fewer tokens, still valid MD), accuracy/confidence indicator on OCR
- **Chunk splitter** for big docs: 8k / 32k / 128k / custom with optional
  overlap, chunk navigator, download-as-ZIP
- **Prompt templates** (Summarize, Extract tables as CSV, Anki cards, ELI5…)
- **Export**: copy MD / copy plain / copy HTML / download `.md` / batch &
  chunk **ZIP** with `index.md` manifest / **shareable `#md=` link** (no server)
- **History** of the last 50 conversions in IndexedDB (this device only),
  searchable
- **Dark / light / auto** theme, keyboard shortcuts, WCAG-minded, mobile-friendly
- **PWA**: installable, local OCR works fully offline
- **`portfolio-context/`**: optional template + GitHub Action that keeps daily
  stock quotes fresh in Markdown/CSV/JSON you can **link from any AI chat** —
  see [portfolio-context/README.md](portfolio-context/README.md)

## Use it

### GitHub Pages (recommended, $0)

Fork or clone, then from the repo root:

```bash
git init && git add -A && git commit -m "MDgen initial"
gh repo create MDgen --public --source=. --push \
  --description "Paste an image → AI-ready Markdown. Free, private, in-browser."
gh api repos/{owner}/MDgen/pages -f "source[branch]=main" -f "source[path]=/" >/dev/null
echo "Live at https://<you>.github.io/MDgen/ (give Pages ~1-2 min)"
```

Or without `gh`: push to a public repo named **MDgen**, then
**Settings → Pages → Deploy from branch → main / (root)**.

### Run locally

No build step. Any static server works (needed for PDF support + PWA):

```bash
python3 -m http.server 8000      # then http://localhost:8000
# or: npx serve .
```

(Double-clicking `index.html` mostly works too, but PDF.js module loading and
the service worker require http.)

## Shortcuts

| Keys | Action |
|---|---|
| `Ctrl/Cmd+V` | paste image from clipboard, anywhere on the page |
| `Ctrl/Cmd+Shift+C` | copy Markdown |
| `Ctrl/Cmd+K` | convert another file |
| `Esc` | cancel running job / close dialog |

## Accuracy tips

1. Crop to the content; MDgen auto-upscales small text and contrast-stretches
   before OCR.
2. Watch the **OCR confidence** chip — under ~65% it suggests AI Vision (one
   click to re-run).
3. Tables: local OCR reconstructs them from column geometry; gnarly
   merged-cell layouts are AI Vision territory.
4. Hit **⚡ Compact for tokens** before pasting into an LLM.

## Project layout

```
index.html · styles.css · app.js      — the whole app (vanilla, no build)
manifest.json · sw.js                 — PWA/offline
vendor/                               — tesseract.js, pdf.js, mammoth, jszip, marked, DOMPurify
                                        (+ versions & licenses in vendor/LICENSES.md)
portfolio-context/                    — linkable portfolio context + daily quotes Action
.github/workflows/portfolio-quotes.yml
docs/PRD-original.md · PRD.md         — product docs
tests/                                — unit tests (no deps) + optional Playwright e2e
robots.txt · sitemap.xml · .nojekyll · LICENSE (MIT)
```

## Development & tests

The app has **no dependencies and no build step** — edit `app.js`/`styles.css`,
refresh. The pure Markdown pipeline is test-covered:

```bash
node tests/unit.test.js     # 51 assertions, zero dependencies
```

An optional Playwright e2e (real Chromium OCR through the vendored engine) is
in `tests/` — see [tests/README.md](tests/README.md).

Everything is served straight off GitHub Pages — there's no `package.json`,
no bundler, no CI requirement.

## Privacy

Default path sends **zero** bytes anywhere: all conversion is client-side and
libraries load from your own origin. AI Vision path makes a single browser →
provider request with *your* key, only when you choose it. API keys are stored
in `localStorage` on your device only. History lives in IndexedDB. No cookies,
no analytics. Content Security Policy in `index.html` restricts connections to
`self` + the two AI endpoints + the tessdata mirror (extra OCR languages).

## Roadmap (ideas)

URL → Markdown (Readability), image preprocessing sliders, QR phone handoff,
Obsidian/Notion front-matter presets, `/inbox` folder + OCR GitHub Action,
audio → transcript MD. PRs welcome.

## Credits

[Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) ·
[PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) ·
[mammoth.js](https://github.com/mwilliamson/mammoth.js) (BSD-2) ·
[JSZip](https://github.com/Stuk/jszip) (MIT) ·
[marked](https://github.com/markedjs/marked) (MIT) ·
[DOMPurify](https://github.com/cure53/DOMPurify) (Apache-2.0/MPL-2.0) ·
[Stooq](https://stooq.com) keyless quotes ·
tessdata from [tesseract-ocr](https://github.com/tesseract-ocr/tessdata_fast).

## License

MIT — see [LICENSE](LICENSE).
