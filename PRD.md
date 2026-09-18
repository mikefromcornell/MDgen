# PRD — MDgen (formerly "image-to-md")

**Turn images & docs into AI-ready Markdown, free & private, in your browser**

| Field | Value |
|---|---|
| **Repo / product name** | **MDgen** (chosen by owner 2026-09-10) |
| **Version** | v1.3 — portfolio removed, EPUB/MOBI support added |
| **Previous** | v1.2 — portfolio feature removed, core conversion focus |
| **Status** | ✅ **IMPLEMENTED** — MVP shipped, ready to publish to GitHub Pages |
| **Priorities (owner)** | **completely free · fast · accurate**, publishable as a public repo |
| **Live URL (planned)** | `https://mikefromcornell.github.io/MDgen/` |

---

## 1. Decision log (the original PRD's open questions — now closed)

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Repo name | **MDgen** | Owner's choice (short, brandable) |
| D2 | Publishing | Build fully, publish-ready | No PAT available in this session — repo is `git init`'d with exact `gh` one-liners in README §GitHub Pages |
| D3 | Engines | **Both** — Local OCR default + Gemini BYOK (+OpenAI) | Free forever by default; accuracy escape hatch for handwriting/complex layouts |
| D4 | Scope | **Images + Docs** (PDF/DOCX/TXT/CSV/EPUB/MOBI) | Docs libs are small; huge utility gain, EPUB/MOBI via JSZip + custom PalmDOC parser (foliate-js based) |
| D5 | Extras in MVP | PWA offline, share-`#md=` link, chunk ZIP, prompt templates | High value / still $0; URL→MD, QR handoff deferred to roadmap |

Core task: converting files and OCR to MD files — no background workflows. EPUB/MOBI added per user request (v1.3).

## 2. Changes made vs. original PRD (the requested analysis)

**Speed (top priority)**
1. **Libraries vendored in-repo instead of CDN.** The original design loaded
   Tesseract.js/pdf.js/mammoth/jszip from jsDelivr/cdnjs at runtime. All six
   libraries + the OCR WASM cores + the English model now ship from your own
   GitHub Pages origin (pinned versions in `vendor/LICENSES.md`). Result: no
   CDN latency or outage risk, identical bytes every load, full offline PWA,
   and *zero third-party requests even before first conversion* (stronger than
   "private by default").
2. **Lazy loading**: pdf.js, mammoth, JSZip load only when their file type is
   used; OCR engine initializes on first use, then the worker is reused for the
   whole batch.
3. **PDF native-text fast path**: PDFs with a text layer never touch OCR or AI —
   extraction is near-instant and lossless (also an accuracy win).
4. Auto-upscale for small text (more accurate) and optional >2600 px downscale
   (faster) — replaces the PRD's manual downscale option.

**Accuracy (top priority)**
5. **Geometry-aware OCR post-processing.** Instead of plain-text heuristics,
   MDgen parses Tesseract's TSV (word boxes + confidence) and infers headings
   from relative font height, **tables from column-gap alignment**, lists from
   bullet glyphs, and merges wrapped lines using Tesseract's own paragraph IDs
   with de-hyphenation. Covered by 73 unit tests (run-time: `<10 ms`).
6. **OCR confidence chip** — shows mean word confidence; <65% actively nudges
   to AI Vision with one-click re-run.
7. Image preprocessing upgraded: grayscale + histogram contrast-stretch
   (1%/99% clip) before OCR — materially better on photos/screens.
8. **BYOK prompt hardened** (charts→data tables, no commentary, no wrapper
   fences) + output sanitizer that unwraps ``` ```markdown ``` wrappers models
   love to add.

**Free & current facts (checked 2026-09-10)**
9. Gemini default updated `gemini-2.0-flash` → **`gemini-2.5-flash`** (still the
   no-card free tier; ~1,500 RPD; Pro is paid-only since Apr 2026). Both AI
   model names are user-editable in Settings so the app ages gracefully.
10. **New honest disclosure**: Gemini's free tier may train on submitted data —
   the BYOK banner and Settings say so. The original PRD's banner didn't.
11. tesseract.js pinned at v7.0.0/core 6.1.2 (current), pdf.js at 6.3.289
    (post-CVE-2024-4367 generation — the PRD-era pdf.js 3.x had that XSS-class
    font-parsing vulnerability unpatched).

**Scope trims (explicit, reversible)**
12. js-yaml dropped (front matter schema is flat; 30-line serializer/parser).
13. "Preprocessing sliders", "URL→MD", "QR handoff", "prompt library of 10",
    "inbox GitHub Action" → roadmap, to keep v1 tight. 5 prompt templates kept.
14. Share-fragment URL capped at 6 k chars with graceful error (was unbounded).
15. **Portfolio quotes workflow removed (v1.2)** — `portfolio-context/` and
    `.github/workflows/portfolio-quotes.yml` deleted to eliminate failing Action
    notifications. App now focuses solely on file conversion & OCR to Markdown.
16. **EPUB/MOBI support added (v1.3)** — EPUB via JSZip (container.xml → OPF → spine HTML → Markdown with `---` separators, chapter titles), MOBI via custom PalmDOC parser (PDB header, record offsets, trailing-entry stripping, PalmDOC decompression from foliate-js MIT). Supports compression 1 (none) and 2 (PalmDOC), detects DRM (encryption!=0) and Huffman/KF8 (17480) with helpful message to convert to EPUB via Calibre. Also handles AZW/AZW3 extensions.

Everything else in the original PRD §5.1 (F1–F7) shipped as specified: paste/
DnD/browse + batch+cancel, engine selector + retry-with-AI, Markdown Studio
(editor+preview+front matter), cleanup tools, token estimate + Compact +
chunker, all 4 export paths, IndexedDB history (50, searchable), PDF/DOCX/TXT/
CSV/EPUB/MOBI converters, settings/BYOK panel, themes, shortcuts, a11y, PWA, SEO files.

## 3. Success metrics (targets)

| Metric | Target | v1 instrument |
|---|---|---|
| Paste→copy, local OCR 1080p | p50 < 8 s | preprocessing ≤0.5 s + warm worker ~3–6 s |
| Run-rate cost | $0 | Pages + in-repo libs; only optional user key |
| Compact-mode token saving | ≥25% | measured live, typical 25–35% |
| Privacy | 0 bytes off-device by default | CSP allows only `self` until BYOK is chosen |
| Code quality | no build step | syntax-checked + unit tests on the MD pipeline |

## 4. Architecture (as shipped)

```
GitHub Pages (static, main/) ── index.html · styles.css · app.js · vendor/ · sw.js
Browser ├─ Local: Tesseract.js v7 (WASM worker, tessdata eng in-repo) ┌ default
        ├─ Docs:  pdf.js 6 (native-text fast path → render→OCR fallback)
        │         mammoth (DOCX) · JSZip (batch/chunk ZIP + EPUB) · marked+DOMPurify
        │         epub: container.xml → OPF manifest/spine → HTML→MD
        │         mobi: PDB + PalmDOC decompression (foliate-js MIT) + HTML→MD
        └─ AI:    fetch browser→Gemini (x-goog-api-key) / OpenAI · BYOK
```

No background workflows — fully static, client-side only. EPUB/MOBI work offline, no server.

## 5. Remaining risks & mitigations

| Risk | Mitigation shipped |
|---|---|
| OCR weak on handwriting | confidence chip + one-click AI re-run |
| Non-English OCR needs one download | mirror fetch once → SW runtime cache |
| AI free-tier quotas shrink | model name editable; Local OCR unaffected |
| Very large CSV/PDF/EPUB/MOBI | 200-row render cap + 50 k parse cap; per-page/chapter/record progress + cancel; MOBI truncated to 500k raw for preview |
| MOBI DRM or KF8/Huffman | Detected early, throws helpful message: use EPUB or convert with Calibre; PalmDOC MOBI6 works |

## 6. Milestones

| M | Scope | Status |
|---|---|---|
| M1 | PRD draft v1.0 | ✅ (was: awaiting confirm) |
| M2/M3 | MVP + docs/AI engines | ✅ shipped in v1.0.0 |
| M4 | Publish repo + Pages | ⏭ pending owner's `gh` push (README has 3 commands) |
