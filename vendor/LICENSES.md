# Vendored libraries

MDgen ships these libraries **in the repo** instead of loading them from a CDN.
Why: works offline (PWA), no CDN outage risk, no third-party requests in the
default private-OCR path, and identical performance on every revisit.

| Package | Version | File(s) | License |
|---|---|---|---|
| tesseract.js | 7.0.0 | `tesseract/tesseract.min.js`, `tesseract/worker.min.js` | Apache-2.0 |
| tesseract.js-core | 6.1.2 | `tesseract/core/*.wasm.js` (see note) | Apache-2.0 (WASM build of Tesseract OCR) |

**Note:** `tesseract-core-relaxedsimd*.wasm.js` are copies of the `simd`
variants. tesseract.js v7 feature-detects relaxed SIMD and requests those
filenames, but core 6.1.2 doesn't ship them — without the copies, modern
Chrome/Edge 404 and OCR fails. The plain-SIMD binaries run fine on
relaxed-SIMD engines (we do not claim relaxed-SIMD speedups).
| tessdata_fast (`eng`) | @main | `tesseract/tessdata/eng.traineddata.gz` | Apache-2.0 |
| PDF.js (pdfjs-dist) | 6.3.289 | `pdfjs/pdf.min.mjs`, `pdfjs/pdf.worker.min.mjs` | Apache-2.0 |
| mammoth.js | 1.12.2 | `mammoth/mammoth.browser.min.js` | BSD-2-Clause |
| JSZip | 3.10.2 | `jszip/jszip.min.js` | MIT |
| marked | 18.0.12 | `marked/marked.umd.js` | MIT |
| DOMPurify | 3.4.15 | `dompurify/purify.min.js` | Apache-2.0 / MPL-2.0 |
| foliate-js (MOBI PalmDOC logic) | main (MIT) | logic copied into `app.js` (decompressPalmDOC, trailing-entry stripping) — not a separate vendored file | MIT |

To upgrade: download the package tarball from npm / the project release page,
replace the files above (keep filenames), bump the version in this table, and
bump `VERSION` in `sw.js` so the offline cache refreshes.

Full license texts: see each project's repo (links in README §Credits).
