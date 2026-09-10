# PRD — image-to-md

**Turn images & docs into AI-ready Markdown, free & private, in your browser**

| Field | Value |
|-------|-------|
| **Working title** | `image-to-md` (repo name tbd by you) |
| **Version** | Draft v1.0 — 2026-09-10 |
| **Status** | **AWAITING YOUR CONFIRMATION** — no code, no repo created yet |
| **Author** | Arena agent for mikefromcornell |
| **Requested flow** | 1) Confirm this PRD → 2) Create new GitHub repo → 3) Publish to GitHub Pages |
| **Cost target** | **$0 forever** — static hosting, client-side by default, BYOK for AI |
| **Live URL (planned)** | `https://mikefromcornell.github.io/<repo>/` |

> **Your original ask (verbatim):** *"Image to .MD file for ai. Confirm the PRD then create a new repo and publish to a github site. I want to be able to quickly upload a picture or paste in a screenshot from my browser into a website that will convert it into a markdown .md file that I can upload for AI use. Also suggest other features that would be helpful for this and make this all free. I want to turn images and docs into the most efficient way to provide into AI. What about having a repo of stock portfolio data in MD or another format that you can easily reference in new chats as well?"*

---

## 1. Executive Summary

A single-page, **free, static website** hosted on **GitHub Pages** that lets anyone **paste (Ctrl+V), drag-drop, or pick** an image or document and instantly get **clean, token-efficient GFM Markdown** optimized for pasting into ChatGPT/Claude/Gemini or uploading as a `.md` file.

- **Default engine is 100% local** (Tesseract.js WASM OCR) — image never leaves the device, works offline after first load, no account, no server.
- **Optional AI-vision engine** via **BYOK** (Bring Your Own Key) — user pastes their own Gemini (free tier) or OpenAI key, call goes **browser → Google/OpenAI directly**, key stays in `localStorage`, never touches our servers (because there are none).
- **Also handles PDFs, DOCX, TXT, CSV** so it becomes a general "anything → AI-ready MD" inbox.
- **Companion repo** `portfolio-context` (optional) gives you a **persistent, linkable stock-portfolio context** (`holdings.csv` + `portfolio.md` + daily `quotes.json` via a free scheduled Action) that you can reference in any new chat with a `raw.githubusercontent.com` URL — no re-pasting.

No backend, no database, no build step, no cost. Vanilla HTML/CSS/JS served from `main` on GitHub Pages.

---

## 2. Problem Statement

- Screenshots, phone photos, scans, and PDFs are **dead weight for LLMs** — models want clean text/Markdown, not pixels.
- Existing converters are: paywalled, ad-riddled, upload-to-someone's-server (privacy risk), or output messy text that **wastes tokens** and confuses models (lost tables, no headings, no structure).
- Re-explaining your portfolio holdings / watchlist / thesis in every new chat **burns time and tokens**.
- You want a **10-second, free, private** path: *screenshot → Markdown → paste into AI* — and a **durable portfolio repo** you can link instead of re-upload.

---

## 3. Goals & Success Metrics

### 3.1 Goals

1.  **Fast:** Paste → copyable Markdown in **<10 seconds** on a typical laptop (local OCR); **<15s** with AI vision on a 1080p screenshot.
2.  **Free forever:** $0 hosting + $0 runtime. User's only possible cost is their own optional AI key (Gemini Flash has a generous free tier ~1,500 req/day).
3.  **Private by default:** Default path processes entirely in-browser. Clear disclosure when AI path sends the image to a provider.
4.  **AI-optimal output:** Structured GFM Markdown + YAML front matter + token estimate + optional compacting/chunking so the output is the **most token-efficient** way to feed the LLM.
5.  **Frictionless:** No sign-up, no install. Works on first visit. PWA-installable for offline OCR.
6.  **Durable context:** Portfolio repo is a single URL you can drop into any chat to give the model your current holdings/theses.

### 3.2 Success Metrics (to measure after launch)

| Metric | Target |
|--------|--------|
| Paste-to-copy time (local OCR, 1080p) | p50 <8s, p90 <12s |
| Monthly run-rate cost | $0 (GitHub Pages + CDN) |
| Lighthouse Performance / PWA | 90+ |
| Token reduction vs raw OCR text (compact mode) | ≥25% chars saved |
| History retrieval (return visit) | Previous conversions still in IndexedDB |
| Portfolio quotes freshness | `quotes.json` updated daily, <24h old |

### 3.3 Non-Goals (v1)

- User accounts, auth, cloud storage, or server-side processing.
- Paid APIs or required subscriptions.
- Native iOS/Android apps (PWA covers it).
- Perfect handwriting recognition or full layout cloning of complex magazines.
- Real-time collaboration.
- Replacing Obsidian/Notion — we *export* to them.

---

## 4. Users & Use Cases

**Primary:** You + anyone who pastes screenshots into ChatGPT/Claude/Gemini daily — students, developers, analysts, traders.

| Use case | Flow |
|----------|------|
| **Screenshot → AI** | `Cmd+Shift+4` → `Ctrl+V` on site → copy Markdown → paste in AI |
| **Phone photo of whiteboard/receipt** | Drag photo → OCR → clean MD with `- [ ]` tasks / table |
| **Slide deck / PDF → notes** | Drop `deck.pdf` → each page → merged Markdown with `# Page 1` headings |
| **Table screenshot → spreadsheet** | Screenshot of table → MD `| col | col |` → paste into AI or copy |
| **Batch inbox** | Drop 12 images at once → batch convert → Download ZIP |
| **Portfolio context** | In new chat: *"Read https://raw.githubusercontent.com/you/portfolio-context/main/portfolio.md and advise"* |

---

## 5. Requirements

### 5.1 Functional — MVP (must ship)

#### F1 — Input (frictionless)

- **Paste:** `Ctrl/Cmd+V` anywhere on page captures image from clipboard (Electron/Web Clipboard API). Show toast if clipboard has no image.
- **Drag & drop:** Full-page drop zone with visual state; highlights on dragover.
- **File picker:** Click to open `accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.docx,.txt,.csv"`; supports multi-select.
- **Batch:** Queue N files; process sequentially; show per-file progress + combined progress bar; allow cancel.
- **Constraints:** Max ~15 MB per file (soft, warn not block); image downscale option >3000px longest edge (preserve OCR accuracy vs speed).
- **Empty/error states:** Friendly messages for corrupt/unsupported files; "Try AI mode for handwriting/complex layout" hint.

#### F2 — Conversion Engines (user chooses)

| Engine | When to use | How it works | Cost / Privacy |
|--------|-------------|--------------|----------------|
| **Local OCR (default)** | Text screenshots, docs, terminal, articles | **Tesseract.js v5** WASM in Web Worker; `eng` default + auto language detect; image preprocessing (grayscale, contrast) before OCR; heuristic post-processor to MD (headings, lists, code fences, tables) | Free, offline, **never leaves device** |
| **AI Vision (BYOK)** | Handwriting, messy layouts, tables, charts, diagrams where OCR struggles | User pastes key in Settings (masked input, show/hide, `localStorage` only). Browser `fetch` directly to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=...` with `inline_data` base64 image + prompt "Convert to clean GFM Markdown, preserve structure, YAML front matter...". Optional OpenAI `https://api.openai.com/v1/chat/completions` with `gpt-4o-mini` + `image_url`. Strict "image leaves device" disclosure banner when selected. | Free-tier Gemini (~15 RPM, 1.5k RPD via AI Studio); user pays only if they exceed free tier. Key never sent to us. |
| **Native text extraction** | PDFs with text layer, DOCX, TXT, CSV | `pdf.js` → try native text layer first; fallback to render page → canvas → OCR per page. `mammoth.js` for DOCX → HTML → MD. TXT/CSV → MD (CSV auto-detect delimiter, output GFM table + YAML front matter) | Free, local |

- Engine selector: segmented control `[ Local OCR (private) | AI Vision (BYOK) ]` with private badge default.
- Retry: one-click "Re-run with AI Vision" on a result.
- Language: auto + manual dropdown (eng, spa, fra, deu, etc.) for Tesseract.

#### F3 — Markdown Studio (output)

- **Split view:** Left: image thumbnail + page navigator (for PDFs). Right: **editable Markdown editor** (monospace textarea) + **live GFM preview** (rendered HTML, sanitized).
- **YAML front matter** (editable, toggle on/off):
  ```yaml
  ---
  title: "Q3 Earnings Screenshot"
  source: "image.png"
  created: 2026-09-10
  engine: "tesseract-local"
  tags: [earnings, screenshot]
  token_estimate: 842
  ---
  ```
  Fields: `title` (auto from filename/OCR first heading), `source`, `created` (ISO date), `engine`, `tags` (user editable), `token_estimate`.
- **Cleanup tools (one click):**
  - Fix heading hierarchy (`#` → `##` if no H1)
  - List normalization (`•`/`·` → `- `)
  - Table tidy (align `|`, add header separator)
  - De-hyphenate line breaks
  - Remove duplicate blank lines
  - Wrap detected code in ```fences (language auto guess)
- **Token efficiency:**
  - **Token estimate** displayed live: `~tokens ≈ chars/4` (heuristic) + `chars` + `words` + `$ saved vs raw` indicator.
  - **Compact mode:** toggle that strips extra blank lines, shortens front matter, minifies tables (still valid MD); shows before/after token counts.
  - **Chunk splitter:** input target context size (e.g., 8k, 32k, 128k tokens) → splits output into `part-01.md`, `part-02.md` with overlap option and chunk navigator.
- **Prompt templates (v1 helper):**
  - "Summarize", "Extract tables as CSV", "Turn into Anki", "Explain like I'm 5" — inserts a header prompt above the Markdown for quick paste into LLM.

#### F4 — Export

- **Copy Markdown** (one click, `navigator.clipboard.writeText`); toast "Copied!".
- **Download `.md`** single file via `Blob`; filename `{{slugified-title}}-{{YYYYMMDD}}.md` (e.g., `q3-earnings-20260910.md`); fallback `image-001.md`.
- **Batch ZIP:** when N files, "Download all as ZIP" using `JSZip` in-browser; filenames numbered; includes `index.md` manifest.
- **Copy as HTML / Copy plain text** secondary actions.

#### F5 — History (local only)

- **IndexedDB** (with `localStorage` fallback) stores last ~50 conversions: thumbnail (downscaled), Markdown, front matter, engine, timestamp.
- Sidebar "Recent" with search/filter by title/tag/date; click to restore.
- **Clear all** and per-item delete; storage quota warning.
- No sync — device-local by design.

#### F6 — Docs Support

- **PDF:** via `pdf.js` from CDN. For each page: if text layer exists → extract text → MD; else render to canvas at 2x → OCR. Merge pages with `## Page N` separators. Show page count and per-page status.
- **DOCX:** `mammoth.js` → HTML → Markdown heuristic.
- **TXT:** wrap as code fence or plain MD with front matter.
- **CSV:** parse (handle `,`, `;`, `\t`), render first 200 rows as GFM table with `... (N more rows)` note if truncated; offer "Download as MD table".

#### F7 — Settings & UX

- Dark/light/auto theme.
- Engine preference persisted.
- API key panel: two fields (Gemini, OpenAI), masked, test button (small `fetch` to validate), "Stored only on this device" note, clear key.
- Keyboard shortcuts: `Ctrl+V` paste, `Ctrl+K` clear, `Ctrl+C` copy (when focused), `Esc` cancel.
- A11y: focus rings, ARIA labels, `lang` attr, color contrast AA.
- Responsive: mobile-friendly file picker (paste not available on mobile → show upload prompt).

### 5.2 Suggested Extra Features (you asked — ranked)

These are **not** required for MVP, but included in the PRD so you can say yes/no now. I'll build only what you confirm.

**High value, still free:**

1.  **URL → Markdown** — paste a URL, fetch via CORS proxy fallback or use `fetch` + `Readability.js` to extract article → MD (great for docs).
2.  **Image preprocessing sliders** — brightness/contrast/threshold/rotate/crop before OCR (improves accuracy on photos).
3.  **Table/Chart → data table** — AI mode detects bar/line charts and outputs a best-effort data table + `csv` code block.
4.  **Front-matter presets** — Obsidian / Notion / Zettelkasten / `portfolio-context` presets (one click).
5.  **PWA offline install** — `manifest.json` + service worker caches WASM + libs so local OCR works offline after first visit.
6.  **Shareable fragment URL** — encode small Markdown into `#md=` URL hash for one-click share (no server).

**Medium value:**

7.  **Inbox GitHub Action recipe** — `/inbox` folder in repo; drop images via web upload, Action runs OCR and moves MD to `/knowledge/YYYY-MM-DD/`.
8.  **QR handoff** — show QR of current MD for quick phone → desktop.
9.  **Prompt library** — curated 10 prompts for "turn this into..." workflows.
10. **Language auto-rotate** — try `eng+osd` for orientation detection.

**Future (v2) if you want later:**

- Audio (mp3) → transcript → MD via Web Speech / Whisper BYOK.
- Figma/Sketch screenshot → component MD.

### 5.3 Non-Functional

| Area | Requirement |
|------|-------------|
| **Performance** | First paint <1.5s on 4G; Tesseract worker doesn't block UI; 5 MB image OCR <10s on M1/1080p-equivalent |
| **Privacy** | Default local; BYOK disclosure; no analytics by default (optional privacy-friendly Plausible later); no cookies; key in `localStorage` only |
| **Cost** | $0 infra: GitHub Pages static + jsDelivr/unpkg CDNs + browser compute |
| **Compatibility** | Evergreen Chrome/Firefox/Safari/Edge; mobile Safari/Chrome (file picker, no paste) |
| **Offline** | PWA caches core + WASM; local OCR works offline |
| **Accessibility** | WCAG 2.1 AA, keyboard nav, screen reader labels |
| **SEO** | Single page with meta/OG tags, `robots.txt`, `sitemap.xml`, semantic HTML |
| **Build** | **No build step** — vanilla HTML/CSS/JS, ES modules via CDN, so Pages can serve raw. No npm needed to run. |
| **License** | MIT |

---

## 6. Companion Repo — `portfolio-context` (answers your portfolio question)

### 6.1 Concept

A **second GitHub repo** (or a folder in the main repo if you prefer — decision for you below) that becomes your **single linkable source of truth** for holdings, watchlist, theses, and daily quotes. Reference it in any new chat:

> *"Read https://raw.githubusercontent.com/mikefromcornell/portfolio-context/main/portfolio.md and https://raw.githubusercontent.com/mikefromcornell/portfolio-context/main/data/holdings.csv then advise on rebalancing"*

Benefits:
- **One URL, always current** — the daily Action keeps `quotes.json` fresh.
- **LLM-optimal:** Markdown front matter for human/LLM reading + `CSV/JSON` for exact computation (models handle both well).
- **Human-editable:** Edit `holdings.csv` in GitHub web UI, or upload a brokerage export.
- **Free & private-ish:** Public raw URL is readable by LLMs (private raw URLs need auth, so portfolio repo is typically **private with share concerns** — see §6.5 options).

### 6.2 Repo Structure (if standalone repo)

```
portfolio-context/
├── README.md                 # how to update + how to link in chats
├── portfolio.md              # narrative + YAML front matter (human + LLM)
├── data/
│   ├── holdings.csv          # SOURCE OF TRUTH — your positions
│   ├── watchlist.csv         # tickers you watch
│   └── quotes.json           # auto-updated daily by Action (last, OHLCV)
└── .github/workflows/update-quotes.yml  # daily cron → Stooq → commit
```

### 6.3 File Specs

**`data/holdings.csv`** (source of truth — you edit this):

```csv
symbol,shares,avg_cost,account,notes
AAPL,12,175.30,Schwab,core
MSFT,8,410.00,Schwab,core
NVDA,5,950.00,IRA,satellite
CASH,2400,,Schwab,USD
```

**`portfolio.md`** (LLM-facing narrative — kept short, front matter heavy so models get structure):

```markdown
---
title: "Mike — Portfolio Context"
as_of: 2026-09-10
owner: mikefromcornell
risk: moderate
rebalance_band: 0.05
holdings_csv: data/holdings.csv
quotes_json: data/quotes.json
tags: [portfolio, holdings, watchlist]
---

# Portfolio

Core: AAPL/MSFT/NVDA. Cash 18%. Thesis: quality large-cap ...

## Holdings (auto-synced summary — Action updates this block)
<!-- QUOTES:START -->
| Symbol | Shares | Last | Value | Day Chg |
|--------|--------|------|-------|---------|
| AAPL | 12 | 229.10 | 2749.20 | +1.2% |
<!-- QUOTES:END -->

## Watchlist
See `data/watchlist.csv`.
```

**`data/quotes.json`** (machine-precise, for calculations):

```json
{
  "as_of": "2026-09-10T16:00:00Z",
  "quotes": {
    "AAPL": {"last": 229.10, "open": 227.0, "high": 230.1, "low": 226.5, "volume": 54000000},
    "MSFT": {"last": 445.20, "open": 442.1, "high": 446.0, "low": 441.0, "volume": 21000000}
  }
}
```

**`data/watchlist.csv`:**

```csv
symbol,thesis,price_target
GOOGL,AI moat,200
AVGO,semi div growth,1800
```

### 6.4 Free Daily Update Action

`.github/workflows/update-quotes.yml` — runs daily `cron: '0 14 * * 1-5'` (6am PT weekdays) + manual dispatch:

- Python stdlib only (`urllib`, `csv`, `json`) — no API keys.
- Reads `holdings.csv` + `watchlist.csv` → builds symbol list → fetches **Stooq keyless CSV** endpoint:

  ```
  https://stooq.com/q/l/?s=aapl.us,msft.us&f=sd2t2ohlcv&h&e=csv
  ```

  (no key, CORS-friendly server-side in Action). Fallback to Yahoo unofficial if Stooq empty.
- Writes `data/quotes.json` + rewrites the `<!-- QUOTES:START -->...<!-- END -->` block in `portfolio.md` → `git commit` + `push` if changed (using `GITHUB_TOKEN`).

Cost: $0 (Actions free tier: 2,000 min/mo, this uses ~1 min/day).

### 6.5 Privacy Options (you choose)

| Option | Pros | Cons |
|--------|------|------|
| **A. Public repo (recommended for LLM linking)** | `raw.githubusercontent.com` works in any chat, no auth | Holdings visible to anyone with link |
| **B. Private repo + paste content** | Holdings private | Can't link raw URL — you paste `portfolio.md` manually |
| **C. Public `portfolio.md` + private holdings** | LLM gets thesis, holdings stay private | Extra step to share holdings when needed |

Suggested default: **A with obfuscation** — shares rounded, no account numbers, e.g., `AAPL 12 shares` (no dollar total if sensitive). You can start private and flip to public later.

### 6.6 Alternative if you prefer ONE repo

Instead of a second repo, include `portfolio-context/` as a **top-level folder/template** in `image-to-md` itself, with identical structure. Same linking via `https://raw.githubusercontent.com/mikefromcornell/image-to-md/main/portfolio-context/portfolio.md` — zero extra repo.

---

## 7. Technical Design ($0 Stack)

### 7.1 Architecture

```
User browser
  ├─ index.html + styles.css + app.js (vanilla, ES modules)
  ├─ Tesseract.js v5 (WASM, Web Worker) — local OCR
  ├─ pdf.js (CDN) — PDF text/render
  ├─ mammoth.js — DOCX
  ├─ jszip — batch ZIP
  ├─ js-yaml — front matter parse/stringify
  └─ (optional) fetch → generativelanguage.googleapis.com / api.openai.com  [BYOK]
GitHub Pages (static) — serves from main branch root, .nojekyll
CDNs: jsDelivr / unpkg / cdnjs (all free, no key)
No backend, no DB — IndexedDB/localStorage only
```

### 7.2 Pages to Confirm With You

| Decision | Options | Recommendation |
|----------|---------|----------------|
| **Repo name** | `image-to-md`, `md-for-ai`, `snap-to-md`, custom | `image-to-md` (clear, searchable) |
| **Custom domain?** | No (use `*.github.io`) / Yes (you own domain) | No for v1 ($0) |
| **Scope v1** | Images only vs Images + Docs (PDF/DOCX/TXT/CSV) | **Images + Docs** (docs libs are small) |
| **Engines** | Local OCR only vs Both (Local default + Gemini BYOK) vs AI only | **Both** (privacy + power) |
| **Portfolio** | Standalone `portfolio-context` repo vs folder inside main vs skip | **Standalone repo** (clean link) or **folder** if you want 1 repo — your call |

### 7.3 File Layout (planned, after you confirm)

```
image-to-md/
├── index.html          # app shell: drop zone, engine toggle, editor, preview, settings modal
├── styles.css          # system, dark/light, responsive, print
├── app.js              # all logic: clipboard, DnD, OCR worker, BYOK, front matter, export, history
├── manifest.json       # PWA
├── sw.js               # service worker (cache WASM/CDN)
├── PRD.md              # this file
├── README.md           # user-facing: quick start, BYOK guide, FAQ
├── LICENSE             # MIT
├── .nojekyll           # tell Pages not to run Jekyll
├── robots.txt
├── sitemap.xml
└── assets/
    └── og-image.png    # social preview
```

No `package.json`, no bundler required. Optional `tools/` for local dev server (`npx serve`).

### 7.4 Key Implementation Details

- **Tesseract:** `createWorker('eng', 1, { workerPath, corePath, langPath })` via CDN; OCR in worker thread; `recognize(canvas)`; progress callback → progress bar.
- **Preprocess:** Offscreen canvas — grayscale, adaptive threshold, optional deskew hint for photos.
- **MD heuristics:** Detect headings by font-size/line-length/ALLCAPS ratio; lists by leading `[-•*]` or `1.`; tables by aligned pipes or whitespace columns; code by indentation/`{}`/`;` density.
- **BYOK prompt (Gemini):** 
  ```
  You are a Markdown converter. Convert the image to clean GFM Markdown.
  Rules: Preserve headings (#, ##), lists, tables (| col |), code fences (```), 
  math ($...$ if any). Add YAML front matter with title/source/engine. No commentary.
  If the image is a table, output a markdown table. If chart, output table + summary.
  ```
- **Security:** DOMPurify for preview HTML; `rel=noopener` on links.
- **Pages publish:** `POST /repos/{owner}/{repo}/pages` with `source: { branch: "main", path: "/" }`; enable via `gh api`.

### 7.5 Cost Table

| Component | Provider | Cost |
|-----------|----------|------|
| Hosting | GitHub Pages | $0 |
| OCR | Tesseract.js WASM | $0 |
| PDF/DOCX/ZIP/YAML | pdf.js / mammoth / jszip / js-yaml via CDN | $0 |
| AI vision | Google Gemini Flash free tier (user key) / OpenAI (user key) | $0 to us; user free tier |
| Quotes data | Stooq CSV (keyless) | $0 |
| Scheduled Action | GitHub Actions (2k min free) | $0 |
| Domain | `*.github.io` | $0 |

Total run-rate: **$0/mo**.

### 7.6 Privacy & Security

- **Default path:** image bytes never leave device; no network request until user clicks "AI Vision".
- **BYOK path:** explicit banner: *"This will send your image to Google/OpenAI using your key. Your key stays in this browser."* + link to provider terms.
- **Storage:** `localStorage` for settings/key (scoped to origin), `IndexedDB` for history. No cookies, no tracker.
- **CSP (meta):** restrict `connect-src` to `self` + `generativelanguage.googleapis.com` + `api.openai.com` when BYOK enabled.
- **No secrets in repo:** `.env` not needed; example keys only in docs.

---

## 8. UX Flow & Wireframe (text)

```
┌─────────────────────────────────────────────────────────────┐
│  image-to-md  [Local OCR ● | AI Vision ○]  [⚙ Settings]  [?]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────┐      │
│   │  📋 Paste (Ctrl+V)  ·  Drag & drop  ·  Browse  │      │
│   │  PNG JPG WEBP GIF BMP PDF DOCX TXT CSV — batch OK    │      │
│   └─────────────────────────────────────────────────┘      │
│                                                             │
│   ┌──────────────┬──────────────────────────────────┐      │
│   │  Preview     │  Markdown (editable)   [Copy][↓] │      │
│   │  [thumb]     │  ---                              │      │
│   │  Page 1/3 ▸  │  title: ...                      │      │
│   │              │  ---                              │      │
│   │              │  # Heading                        │      │
│   │              │  | col | col |                    │      │
│   └──────────────┴──────────────────────────────────┘      │
│   Tokens ~842 · chars 3368 · [Compact ○] [Split by 8k ▾]   │
│   [Clean headings] [Fix tables] [Wrap code]                 │
│                                                             │
│   Recent ▼  [q3-earnings-20260910.md] [receipt-20260909.md]  │
└─────────────────────────────────────────────────────────────┘
```

- First visit: large drop zone centered; after conversion, split view appears.
- Settings modal: engine pref, Gemini/OpenAI key fields (masked, test/clear), language, theme, clear history.

---

## 9. Publishing Plan (after you confirm)

1.  You provide PAT (already shared via `git.txt` — **not yet read, held for next step**) → I configure `git` + `gh` locally.
2.  `mkdir image-to-md && git init && git add . && git commit -m "feat: initial"`
3.  `gh repo create mikefromcornell/<chosen-name> --public --source=. --push --description "Paste an image → AI-ready Markdown. Free, private, in-browser."`
4.  `gh api repos/mikefromcornell/<repo>/pages -f source[branch]=main -f source[path]=/` (enable Pages; add `.nojekyll`).
5.  Verify `https://mikefromcornell.github.io/<repo>/` returns 200 (curl + manual).
6.  (If portfolio approved) repeat for `portfolio-context` or add `portfolio-context/` folder and push; verify raw URL; trigger quotes Action.
7.  Open PR back to this session branch for record (if needed).

*Note: Sandbox `GITHUB_TOKEN` today only sees `mikefromcornell/economindTEST`; your PAT is required to create new repos. I will not print or commit it.*

---

## 10. Milestones

| Milestone | Scope | After confirmation |
|-----------|-------|--------------------|
| **M1 — Draft** | **THIS PRD** (done, awaiting ✅) | Today |
| **M2 — MVP site** | Paste/DnD/file picker, Tesseract local OCR, MD editor+preview, front matter, token estimate, copy/download, history, light/dark, PWA manifest | ~1 work session after confirm |
| **M3 — Docs + AI** | PDF/DOCX/TXT/CSV + Gemini BYOK + OpenAI optional, retry, compact/chunk, batch ZIP | Same session or next |
| **M4 — Publish** | New repo + Pages live + README + OG image + verified URL | Immediately after M2/M3 |
| **M5 — Portfolio** | `portfolio-context` scaffold + Stooq Action + docs on linking in chats | Parallel to M4 if approved |

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tesseract accuracy on photos/handwriting | Offer AI BYOK fallback + preprocessing sliders; show accuracy hint |
| Large PDFs slow | Per-page progress, cancel button, 200-row CSV truncation note |
| CDN down | Fallback CDN URLs + PWA cache; core still loads from Pages |
| PAT scope insufficient | Request `repo` + `workflow` scopes; error message guides user |
| Stooq symbol mismatch (.us suffix) | Normalize symbols (`AAPL` → `aapl.us`), skip unknown, log in Action |
| Token estimate rough | Show as `~` and explain `chars/4`; link to tokenizer FAQ |

---

## 12. Open Decisions — Please Confirm

> **Reply with your choices (e.g., "A, Both, Images+Docs, Standalone portfolio") and I'll build + publish immediately. No code until you say go.**

**D1 — Repo name:** `image-to-md` (recommended) or your custom name? __________

**D2 — Publishing:** Use your PAT to create `mikefromcornell/<name>` and enable Pages now? (Yes / "I'll create empty repo myself, you push" / "Build locally first, publish later") — you already shared PAT, so I can do it fully automatically on your ✅.

**D3 — Engines:** `Both: Local OCR default + Gemini BYOK (recommended)` vs `Local OCR only` vs `AI vision only`?

**D4 — Scope v1:** `Images + Docs (PDF/DOCX/TXT/CSV) (recommended)` vs `Images only`?

**D5 — Portfolio repo:** `Yes, standalone portfolio-context repo (recommended)` vs `Add as template folder inside main repo` vs `Skip for now`? If Yes, public or private? Any holdings to seed?

**D6 — Extra features to include in MVP:** Pick any from §5.2 (e.g., "URL→MD + preprocessing + PWA") or "just MVP, extras later".

---

## Appendix A — Prompt Template Examples

```markdown
## For AI (copy above the markdown)
Summarize this document in 5 bullets and extract all tables as CSV.

## Markdown
---
title: ...
---
# ...
```

Library ships with 5 defaults: Summarize, Extract tables, Turn into flashcards, Find action items, Explain code.

## Appendix B — Front Matter JSON Schema (for reference)

```json
{
  "title": "string",
  "source": "string (filename)",
  "created": "YYYY-MM-DD",
  "engine": "tesseract-local | gemini-flash | gpt-4o-mini | pdf-native | docx | csv",
  "tags": ["string"],
  "token_estimate": 842,
  "language": "eng"
}
```

## Appendix C — References

- Tesseract.js v5: https://github.com/naptha/tesseract.js
- pdf.js: https://mozilla.github.io/pdf.js/
- mammoth.js: https://github.com/mwilliamson/mammoth.js
- Gemini free tier: https://ai.google.dev/pricing (Flash free)
- Stooq keyless CSV: `https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv`
- GitHub Pages API: `POST /repos/{owner}/{repo}/pages`
