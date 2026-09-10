/* ============================================================================
 * MDgen — images & docs → AI-ready Markdown. Free, private, in-browser.
 * Vanilla JS, no build step. Libraries are vendored under /vendor.
 * The first section (MDPure) is pure functions, exported for Node testing.
 * ========================================================================== */
'use strict';

/* ============================ Pure helpers ============================ */
const MDPure = (function () {

  // bullet glyphs incl. common tesseract misreads of '•' (¢ « ~ » etc.),
  // 1-2 chars because OCR sometimes doubles a bullet ('¢«', '**'>)
  const BULLET_RE = /^\s*([•·○●▪▫◦‣►▸»«~¢*+–—]{1,2})\s+/;
  const NUMBERED_RE = /^\s*\(?(\d{1,3})[\).\]]\s+/;
  const HEADING_RE = /^(#{1,6})\s+/;

  function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  function statsOf(text) {
    const t = text || '';
    const words = (t.trim().match(/\S+/g) || []).length;
    return { chars: t.length, words, tokens: estimateTokens(t), lines: t ? t.split('\n').length : 0 };
  }

  function slugify(s, fallback) {
    const slug = String(s || '')
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
    return slug || fallback || 'document';
  }

  function todayISO(d) {
    return (d || new Date()).toISOString().slice(0, 10);
  }

  const FM_ORDER = ['title', 'source', 'created', 'engine', 'tags', 'language', 'token_estimate'];

  function yamlScalar(v) {
    if (typeof v === 'number' && isFinite(v)) return String(v);
    const s = String(v == null ? '' : v);
    if (s === '' || /[:#\[\]{},&*?|<>="\n]|^[\s-]|[\s]$|^(true|false|null|yes|no)\b/i.test(s)) {
      return JSON.stringify(s);
    }
    return s;
  }

  function buildFrontMatter(meta, body) {
    const keep = v => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
    const seen = new Set();
    const keys = FM_ORDER.filter(k => { seen.add(k); return keep(meta[k]); });
    Object.keys(meta).forEach(k => { if (!seen.has(k) && keep(meta[k])) keys.push(k); });
    const lines = keys.map(k => {
      const v = meta[k];
      if (Array.isArray(v)) return `${k}: [${v.map(yamlScalar).join(', ')}]`;
      return `${k}: ${yamlScalar(v)}`;
    });
    return `---\n${lines.join('\n')}\n---\n\n${body || ''}`;
  }

  function splitFrontMatter(md) {
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(md || '');
    if (!m) return { hasFM: false, meta: {}, body: md || '' };
    const meta = {};
    m[1].split('\n').forEach(line => {
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (!kv) return;
      let v = kv[2].trim();
      if (/^\[.*\]$/.test(v)) {
        meta[kv[1]] = v.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
      } else {
        meta[kv[1]] = v.replace(/^"|"$/g, '');
      }
    });
    return { hasFM: true, meta, body: md.slice(m[0].length) };
  }

  function firstHeadingTitle(body) {
    const re = /^#{1,6}\s+(.+)$/gm;
    let m;
    while ((m = re.exec(body || '')) !== null) {
      const t = m[1].replace(/[*_`#]+/g, '').trim().slice(0, 90);
      if (t && !/^page\s+\d+$/i.test(t)) return t; // skip "## Page N" separators
    }
    return '';
  }

  function collapseBlankLines(text) {
    return (text || '')
      .split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '\n');
  }

  function normalizeLists(md) {
    return md.split('\n').map(line => {
      if (BULLET_RE.test(line)) return line.replace(BULLET_RE, '- ');
      return line;
    }).join('\n');
  }

  function fixHeadings(md) {
    const lines = md.split('\n');
    let inFence = false;
    const seen = new Set();
    const levels = [];
    lines.forEach(l => {
      if (/^```/.test(l.trim())) inFence = !inFence;
      if (inFence) return;
      const m = HEADING_RE.exec(l);
      if (m && !seen.has(m[1].length)) { seen.add(m[1].length); levels.push(m[1].length); }
    });
    levels.sort((a, b) => a - b);
    if (!levels.length) return md;
    const map = {};
    levels.forEach((lv, i) => { map[lv] = i + 1; });
    inFence = false;
    let prev = 0;
    return lines.map(l => {
      if (/^```/.test(l.trim())) inFence = !inFence;
      if (inFence) return l;
      const m = HEADING_RE.exec(l);
      if (!m) return l;
      let lv = map[m[1].length];
      if (lv > prev + 1) lv = prev + 1; // no level skips
      prev = lv;
      return '#'.repeat(Math.min(6, lv)) + l.slice(m[1].length);
    }).join('\n');
  }

  const TABLE_LINE_RE = /^\s*\|.*\|\s*$/;
  const TABLE_SEP_RE = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

  function parseTableRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  }

  function escapePipes(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|'); }

  function renderTable(rows, pad) {
    if (!rows.length) return '';
    const n = Math.max(...rows.map(r => r.length));
    const norm = rows.map(r => { const c = r.slice(); while (c.length < n) c.push(''); return c; });
    const head = norm[0], rest = norm.slice(1);
    const widths = head.map((_, i) => Math.max(3, ...norm.map(r => escapePipes(r[i]).length)));
    const row = r => '| ' + r.map((c, i) => {
      const e = escapePipes(c);
      return pad ? e.padEnd(widths[i]) : e;
    }).join(' | ') + ' |';
    const sep = '| ' + widths.map(w => '-'.repeat(pad ? w : 3)).join(' | ') + ' |';
    return [row(head), sep, ...rest.map(row)].join('\n');
  }

  function tidyTables(md) {
    const lines = md.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (TABLE_LINE_RE.test(lines[i])) {
        const block = [];
        while (i < lines.length && (TABLE_LINE_RE.test(lines[i]) || TABLE_SEP_RE.test(lines[i]))) {
          if (!TABLE_SEP_RE.test(lines[i])) block.push(parseTableRow(lines[i]));
          i++;
        }
        if (block.length) out.push(renderTable(block, true));
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    return out.join('\n');
  }

  function minifyTables(md) {
    const lines = md.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      if (TABLE_LINE_RE.test(lines[i])) {
        const block = [];
        while (i < lines.length && (TABLE_LINE_RE.test(lines[i]) || TABLE_SEP_RE.test(lines[i]))) {
          if (!TABLE_SEP_RE.test(lines[i])) block.push(parseTableRow(lines[i]));
          i++;
        }
        if (block.length) {
          const n = Math.max(...block.map(r => r.length));
          const norm = block.map(r => { const c = r.slice(); while (c.length < n) c.push(''); return c; });
          out.push('|' + norm[0].map(escapePipes).join('|') + '|');
          out.push('|' + norm[0].map(() => '---').join('|') + '|');
          norm.slice(1).forEach(r => out.push('|' + r.map(escapePipes).join('|') + '|'));
        }
      } else {
        out.push(lines[i]);
        i++;
      }
    }
    return out.join('\n');
  }

  function dehyphenate(md) {
    // joins words split across lines with a hyphen: "infor-\nmation" -> "information"
    return md.replace(/([A-Za-z])-\n(?=[a-z])/g, '$1');
  }

  function guessCodeLanguage(block) {
    const t = block;
    if (/#include|std::|int main\s*\(/.test(t)) return 'cpp';
    if (/^\s*(def |from \w+ import |import \w+\n|elif |print\()/m.test(t)) return 'python';
    if (/\b(function|const|let|var|=>|console\.log|require\()/.test(t)) return 'javascript';
    if (/public static void|System\.out\.println/.test(t)) return 'java';
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE)\b.+\b(FROM|INTO|SET)\b/im.test(t)) return 'sql';
    if (/^\s*<\/?(html|div|span|body|head)\b/m.test(t)) return 'html';
    if (/^\s*[\{\[]\s*\n?\s*"/.test(t)) return 'json';
    if (/^\s*(\$ |> )?(npm|npx|git|docker|cd|ls|curl|pip) /m.test(t)) return 'bash';
    return '';
  }

  function looksLikeCode(block) {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length < 2) return false;
    const kw = (block.match(/\b(function|const|let|var|def|import|from|return|class|if|else|for|while|print|console|public|private|static|void|int|float|SELECT|FROM|WHERE|end|then|fi|echo)\b/g) || []).length;
    const sym = (block.match(/[{}();=<>[\]]/g) || []).length;
    const indented = lines.filter(l => /^(\s{2,}|\t)\S/.test(l)).length;
    const endsSentence = lines.filter(l => /[.!?]$/.test(l.trim()) && !/[;{}()]$/.test(l.trim())).length;
    if (guessCodeLanguage(block)) return true;
    if (kw >= 3 && sym >= 4) return true;
    if (indented >= Math.ceil(lines.length * 0.6) && sym >= 2 && endsSentence <= lines.length / 2) return true;
    if (sym / Math.max(1, block.length) > 0.06 && endsSentence === 0 && kw >= 1) return true;
    return false;
  }

  /** Wrap detected code paragraphs in fenced blocks. Skips tables/lists/headings. */
  function wrapCodeBlocks(md) {
    const { body } = splitFrontMatter(md);
    const src = body !== undefined ? body : md;
    const blocks = src.split(/\n{2,}/);
    const out = blocks.map(b => {
      const t = b.trim();
      if (!t) return b;
      if (/^(```|#|\||>|- |\d+\. )/.test(t) || /^```/m.test(t)) return b;
      if (!looksLikeCode(b)) return b;
      const lang = guessCodeLanguage(b);
      return '```' + lang + '\n' + b.replace(/\n+$/, '') + '\n```';
    });
    const joined = out.join('\n\n');
    if (body === undefined) return joined;
    return md.slice(0, md.length - body.length) + joined;
  }

  /** Compact: still valid GFM, fewer characters. */
  function compactMarkdown(md) {
    const { hasFM, meta, body } = splitFrontMatter(md);
    let b = minifyTables(body);
    b = b.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
    b = b.replace(/\n{3,}/g, '\n\n');
    b = b.replace(/^# .*\n\n/, m => m); // no-op keep
    b = b.trim() + '\n';
    if (!hasFM) return b;
    const m2 = { ...meta };
    delete m2.token_estimate;
    return buildFrontMatter(m2, b);
  }

  /** Split markdown into chunks of ~maxTokens, splitting on paragraph gaps. */
  function splitChunks(md, maxTokens, overlapParas) {
    maxTokens = Math.max(200, maxTokens | 0);
    if (estimateTokens(md) <= maxTokens) return [md];
    const paras = md.split(/\n{2,}/);
    const chunks = [];
    let cur = [], curTok = 0;
    const flush = () => {
      if (!cur.length) return;
      chunks.push(cur.join('\n\n'));
      if (overlapParas) { // carry trailing short paragraphs into the next chunk
        const carry = [];
        let t = 0;
        for (let i = cur.length - 1; i >= 0 && carry.length < overlapParas; i--) {
          const pt = estimateTokens(cur[i]);
          if (t + pt > 80) break;
          carry.unshift(cur[i]); t += pt;
        }
        cur = carry; curTok = t;
      } else { cur = []; curTok = 0; }
    };
    for (const p of paras) {
      const pt = estimateTokens(p);
      if (pt > maxTokens) { // hard split overlong paragraph by size
        flush();
        const step = maxTokens * 4;
        for (let off = 0; off < p.length; off += step) chunks.push(p.slice(off, off + step));
        cur = []; curTok = 0;
        continue;
      }
      if (curTok + pt > maxTokens && cur.length) flush();
      cur.push(p); curTok += pt;
    }
    if (cur.length) chunks.push(cur.join('\n\n'));
    return chunks;
  }

  /* ----------------------------- CSV ----------------------------- */
  function detectDelimiter(headerLine) {
    const cands = [',', ';', '\t', '|'];
    let best = ',', bestCount = -1;
    for (const c of cands) {
      const n = headerLine.split(c).length - 1;
      if (n > bestCount) { bestCount = n; best = c; }
    }
    return bestCount <= 0 ? ',' : best;
  }

  function parseCSV(text, maxRows) {
    maxRows = maxRows || 200;
    const delim = detectDelimiter(text.split('\n', 1)[0] || '');
    const rows = [];
    let field = '', row = [], inQ = false, total = 0;
    const pushRow = () => { total++; if (row.length || field !== '') { row.push(field); field = ''; } if (row.length && rows.length < maxRows) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        pushRow();
      } else field += ch;
      if (total > 200000) break; // safety
    }
    if (field !== '' || row.length) pushRow();
    return { delimiter: delim, rows, totalRows: total, truncated: total > rows.length };
  }

  function csvToMarkdown(text, maxRows) {
    const { rows, totalRows, truncated, delimiter } = parseCSV(text, maxRows || 200);
    if (!rows.length) return { md: '_Empty CSV._', totalRows: 0, truncated: false, delimiter };
    const md = renderTable(rows.slice(0, maxRows || 200), true) +
      (truncated ? `\n\n_… ${totalRows - (maxRows || 200)} more rows (truncated)._` : '');
    return { md, totalRows, truncated, delimiter };
  }

  /* --------------------- Tesseract TSV → Markdown --------------------- */
  function median(nums) {
    if (!nums.length) return 0;
    const a = nums.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function parseTSV(tsv) {
    const rows = String(tsv || '').split('\n');
    const groups = new Map();
    for (let r = 1; r < rows.length; r++) {
      const c = rows[r].split('\t');
      if (c.length < 12 || +c[0] !== 5) continue; // level 5 = word
      const conf = +c[10];
      const text = c.slice(11).join('\t');
      if (conf < 0 || !text.trim()) continue;
      const key = `${c[2]}-${c[3]}-${c[4]}`;
      const w = { l: +c[6], t: +c[7], w: +c[8], h: +c[9], conf, text };
      if (!groups.has(key)) groups.set(key, { words: [], parId: `${c[2]}-${c[3]}` });
      groups.get(key).words.push(w);
    }
    const lines = [];
    groups.forEach(g => {
      g.words.sort((a, b) => a.l - b.l);
      const ws = g.words;
      lines.push({
        parId: g.parId,
        text: ws.map(w => w.text).join(' '),
        words: ws,
        top: Math.min(...ws.map(w => w.t)),
        h: Math.max(...ws.map(w => w.h)),
        x0: ws[0].l,
        x1: Math.max(...ws.map(w => w.l + w.w)),
        conf: ws.reduce((s, w) => s + w.conf, 0) / ws.length,
      });
    });
    lines.sort((a, b) => a.top - b.top || a.x0 - b.x0);
    return lines;
  }

  function splitLineCells(line, gapThresh) {
    const cells = [];
    const xs = [];
    let cur = [line.words[0]];
    for (let i = 1; i < line.words.length; i++) {
      const prev = cur[cur.length - 1];
      const w = line.words[i];
      const gap = w.l - (prev.l + prev.w);
      if (gap > gapThresh) {
        cells.push(cur.map(x => x.text).join(' '));
        xs.push(cur[0].l);
        cur = [w];
      } else cur.push(w);
    }
    cells.push(cur.map(x => x.text).join(' '));
    xs.push(cur[0].l);
    return cells.length >= 2 ? { cells, xs } : null;
  }

  function columnsAligned(run, h50) {
    const n = run[0].xs.length;
    for (let k = 0; k < n; k++) {
      const vals = run.map(r => r.xs[k]);
      if (Math.max(...vals) - Math.min(...vals) > 1.4 * h50) return false;
    }
    return true;
  }

  const headingTrim = t => t.replace(/[.\s]+$/, '');

  /**
   * Geometry-aware OCR → Markdown: headings by relative font size,
   * tables by column alignment, lists by bullets, paragraphs merged by
   * tesseract paragraph ids with de-hyphenation.
   */
  function ocrLinesToMarkdown(lines) {
    if (!lines || !lines.length) return { md: '', conf: 0 };
    const h50 = median(lines.map(l => l.h)) || 10;
    // column gap threshold: ~2x median glyph height catches tab/table gutters
    // without splitting dense prose (intra-word gaps are ~0.2-0.5x height)
    const gapThresh = Math.max(18, h50 * 1.8);

    const blocks = [];
    let para = null;
    let list = null;
    const flush = () => { if (para) { blocks.push(para.text); para = null; } if (list) { blocks.push(list.items.join('\n')); list = null; } };

    let i = 0;
    while (i < lines.length) {
      const L = lines[i];
      const rowInfo = splitLineCells(L, gapThresh);
      if (rowInfo) {
        const run = [{ cells: rowInfo.cells, xs: rowInfo.xs }];
        let j = i + 1;
        while (j < lines.length) {
          const r = splitLineCells(lines[j], gapThresh);
          if (r && r.cells.length === rowInfo.cells.length) { run.push(r); j++; } else break;
        }
        if (run.length >= 2 && run[0].cells.length >= 2 && run[0].cells.length <= 10 && columnsAligned(run, h50)) {
          flush();
          blocks.push(renderTable(run.map(r => r.cells), true));
          i = j;
          continue;
        }
      }
      // heading?
      if (L.h >= 1.38 * h50 && L.words.length <= 14 && L.text.length <= 90) {
        flush();
        const level = L.h >= 1.75 * h50 ? 1 : 2;
        blocks.push('#'.repeat(level) + ' ' + headingTrim(L.text));
        i++; continue;
      }
      // bullets / numbered
      const bm = BULLET_RE.exec(L.text);
      const nm = NUMBERED_RE.exec(L.text);
      if (bm) {
        if (para) { blocks.push(para.text); para = null; }
        if (!list) list = { items: [] };
        list.items.push('- ' + L.text.replace(BULLET_RE, ''));
        i++; continue;
      }
      if (nm) {
        if (para) { blocks.push(para.text); para = null; }
        if (!list) list = { items: [] };
        list.items.push(nm[1] + '. ' + L.text.replace(NUMBERED_RE, ''));
        i++; continue;
      }
      if (list) { blocks.push(list.items.join('\n')); list = null; }
      // paragraph text
      if (para && para.parId === L.parId) {
        para.text = /\d\-$/.test(para.text) || /[A-Za-z]\-$/.test(para.text)
          ? para.text.slice(0, -1) + L.text
          : para.text + ' ' + L.text;
      } else {
        if (para) blocks.push(para.text);
        para = { parId: L.parId, text: L.text };
      }
      i++;
    }
    flush();
    const conf = lines.reduce((s, l) => s + l.conf, 0) / lines.length;
    return { md: collapseBlankLines(blocks.join('\n\n')), conf: Math.round(conf) };
  }

  /* --------------- Plain text → Markdown (PDF native / TXT) --------------- */
  function plainTextToMarkdown(text) {
    const raw = String(text || '').replace(/\r\n?/g, '\n');
    const lines = raw.split('\n').map(l => l.replace(/[ \t]+$/, ''));
    const out = [];
    let i = 0;
    const isBlank = l => !l.trim();
    while (i < lines.length) {
      const l = lines[i];
      // fenced-by-indent code: >=2 consecutive lines starting with 2+ spaces/tab that look like code
      if (/^(\s{2,}|\t)\S/.test(l) && !BULLET_RE.test(l) && !NUMBERED_RE.test(l)) {
        let j = i;
        const block = [];
        while (j < lines.length && (/^(\s{2,}|\t)/.test(lines[j]) || isBlank(lines[j])) && !isBlank(lines[j])) { block.push(lines[j]); j++; }
        if (block.length >= 2 && looksLikeCode(block.join('\n'))) {
          const body = block.join('\n').split('\n').map(x => x.replace(/^(\s{2}|\t)/, '')).join('\n');
          out.push('```' + guessCodeLanguage(block.join('\n')) + '\n' + body + '\n```');
          i = j; continue;
        }
      }
      // multi-space column table: >=2 consecutive lines splitting into same >=2 cell count
      const cellsOf = s => s.trim().split(/ {2,}|\t/).filter(x => x !== '');
      if (!isBlank(l) && !l.includes('|')) {
        const c0 = cellsOf(l);
        if (c0.length >= 2 && c0.length <= 10) {
          const run = [c0]; let j = i + 1;
          while (j < lines.length && !isBlank(lines[j]) && !lines[j].includes('|')) {
            const c = cellsOf(lines[j]);
            if (c.length !== c0.length) break;
            run.push(c); j++;
          }
          if (run.length >= 2) {
            out.push(renderTable(run, true));
            i = j; continue;
          }
        }
      }
      // bullets
      if (BULLET_RE.test(l)) { out.push(l.replace(BULLET_RE, '- ')); i++; continue; }
      // ALL-CAPS standalone heading
      const bare = l.trim();
      if (bare && bare.length <= 70 && bare.length >= 3) {
        const letters = bare.replace(/[^A-Za-z]/g, '');
        const upper = bare.replace(/[^A-Z]/g, '');
        const prevBlank = out.length === 0 || isBlank(out[out.length - 1]);
        const nextBlank = i + 1 >= lines.length || isBlank(lines[i + 1]);
        if (letters.length >= 3 && upper.length / letters.length > 0.9 && prevBlank && nextBlank) {
          out.push('## ' + headingTrim(bare)); i++; continue;
        }
      }
      out.push(l); i++;
    }
    return collapseBlankLines(dehyphenate(normalizeLists(out.join('\n'))));
  }

  /** Light cleanup of model output: unwrap ```markdown fences, trim. */
  function sanitizeAIMarkdown(md) {
    let t = String(md || '').trim();
    const m = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/.exec(t);
    if (m) t = m[1].trim();
    return collapseBlankLines(t);
  }

  /* ---------------------------- share hash ---------------------------- */
  function encodeShare(md) {
    return btoa(unescape(encodeURIComponent(md))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeShare(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(escape(atob(b + '==='.slice(0, (4 - b.length % 4) % 4))));
  }
  const haveBtoa = typeof btoa === 'function';
  if (!haveBtoa) { // Node fallback for tests
    global.btoa = s => Buffer.from(s, 'binary').toString('base64');
    global.atob = s => Buffer.from(s, 'base64').toString('binary');
  }

  return {
    estimateTokens, statsOf, slugify, todayISO, buildFrontMatter, splitFrontMatter,
    firstHeadingTitle, collapseBlankLines, normalizeLists, fixHeadings, tidyTables,
    minifyTables, dehyphenate, guessCodeLanguage, looksLikeCode, wrapCodeBlocks,
    compactMarkdown, splitChunks, detectDelimiter, parseCSV, csvToMarkdown, renderTable,
    median, parseTSV, ocrLinesToMarkdown, plainTextToMarkdown, sanitizeAIMarkdown,
    encodeShare, decodeShare, BULLET_RE, NUMBERED_RE,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MDPure;
if (typeof document === 'undefined') { /* Node: stop here */ }
else

/* ============================ Browser app ============================ */
(function () {
'use strict';
const P = MDPure;

const BASE = new URL('.', location.href).href;
const V = {
  tesseractCore: new URL('vendor/tesseract/core', BASE).href,
  tesseractWorker: new URL('vendor/tesseract/worker.min.js', BASE).href,
  tessdata: new URL('vendor/tesseract/tessdata', BASE).href,
  tessdataRemote: 'https://tessdata.projectnaptha.com/4.0.0_fast',
  pdfjs: new URL('vendor/pdfjs/pdf.min.mjs', BASE).href,
  pdfjsWorker: new URL('vendor/pdfjs/pdf.worker.min.mjs', BASE).href,
  mammoth: new URL('vendor/mammoth/mammoth.browser.min.js', BASE).href,
  jszip: new URL('vendor/jszip/jszip.min.js', BASE).href,
};

const AI_PROMPT = [
  'You are a precise Markdown converter. Convert this image into clean GitHub-flavored Markdown.',
  'Rules: reproduce ALL text faithfully; preserve the heading hierarchy (#, ##, ###), lists (- or 1.),',
  'tables as markdown tables with | pipes, and code in fenced blocks with a language tag.',
  'Transcribe charts or diagrams as a compact markdown table of the data they show, plus a one-line summary.',
  'Do NOT add YAML front matter. Do NOT add commentary or wrap the whole output in code fences.',
  'If the image contains no readable text, describe it in 3 sentences or fewer.',
].join('\n');

const DEFAULTS = {
  engine: 'local', aiProvider: 'gemini',
  geminiKey: '', openaiKey: '',
  geminiModel: 'gemini-2.5-flash', openaiModel: 'gpt-4o-mini',
  lang: 'eng', theme: 'auto', downscale: true, frontMatter: true,
};
const MAX_FILE_MB = 15;

/* ----------------------------- tiny DOM utils ----------------------------- */
const $ = id => document.getElementById(id);
const els = {
  engineLocal: $('engineLocal'), engineAI: $('engineAI'),
  byokBanner: $('byokBanner'), byokProviderName: $('byokProviderName'), byokDismiss: $('byokDismiss'),
  dropCard: $('dropCard'), pasteHint: $('pasteHint'), browseBtn: $('browseBtn'), fileInput: $('fileInput'),
  dropOverlay: $('dropOverlay'),
  queueSection: $('queueSection'), overallProgress: $('overallProgress'), queueStatus: $('queueStatus'),
  queueList: $('queueList'), cancelBtn: $('cancelBtn'),
  studio: $('studio'), fileChips: $('fileChips'), thumbWrap: $('thumbWrap'),
  pageNav: $('pageNav'), pagePrev: $('pagePrev'), pageNext: $('pageNext'), pageLabel: $('pageLabel'),
  sourceMeta: $('sourceMeta'), titleInput: $('titleInput'), fmToggle: $('fmToggle'),
  promptSelect: $('promptSelect'), tabEdit: $('tabEdit'), tabPreview: $('tabPreview'),
  editor: $('editor'), preview: $('preview'),
  copyBtn: $('copyBtn'), downloadBtn: $('downloadBtn'), moreBtn: $('moreBtn'), moreMenu: $('moreMenu'),
  copyTextBtn: $('copyTextBtn'), copyHTMLBtn: $('copyHTMLBtn'), rerunAIBtn: $('rerunAIBtn'),
  shareLinkBtn: $('shareLinkBtn'), resetBtn: $('resetBtn'),
  statTokens: $('statTokens'), statChars: $('statChars'), statWords: $('statWords'),
  statSaved: $('statSaved'), statConf: $('statConf'),
  btnHeadings: $('btnHeadings'), btnLists: $('btnLists'), btnTables: $('btnTables'),
  btnDehyph: $('btnDehyph'), btnBlank: $('btnBlank'), btnCode: $('btnCode'), btnCompact: $('btnCompact'),
  chunkSelect: $('chunkSelect'), chunkCustom: $('chunkCustom'), chunkOverlap: $('chunkOverlap'),
  chunkNav: $('chunkNav'), chunkZipBtn: $('chunkZipBtn'),
  recentSection: $('recentSection'), recentSearch: $('recentSearch'), recentList: $('recentList'), recentClear: $('recentClear'),
  settingsModal: $('settingsModal'), settingsBtn: $('settingsBtn'),
  setEngineLocal: $('setEngineLocal'), setEngineAI: $('setEngineAI'), setProvider: $('setProvider'),
  geminiKey: $('geminiKey'), openaiKey: $('openaiKey'), geminiModel: $('geminiModel'), openaiModel: $('openaiModel'),
  setLang: $('setLang'), setTheme: $('setTheme'), setDownscale: $('setDownscale'), setFM: $('setFM'),
  testKeyBtn: $('testKeyBtn'), clearKeysBtn: $('clearKeysBtn'), clearHistoryBtn: $('clearHistoryBtn'),
  saveSettingsBtn: $('saveSettingsBtn'), closeSettingsBtn: $('closeSettingsBtn'),
  helpModal: $('helpModal'), helpBtn: $('helpBtn'), closeHelpBtn: $('closeHelpBtn'),
  toasts: $('toasts'),
};

function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  els.toasts.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

/* ------------------------------- settings ------------------------------- */
let settings = { ...DEFAULTS };
try {
  const raw = localStorage.getItem('mdgen.settings');
  if (raw) settings = { ...DEFAULTS, ...JSON.parse(raw) };
} catch (e) { /* corrupted -> defaults */ }
function saveSettings() { localStorage.setItem('mdgen.settings', JSON.stringify(settings)); }

function applyTheme() {
  const html = document.documentElement;
  if (settings.theme === 'dark' || settings.theme === 'light') html.dataset.theme = settings.theme;
  else delete html.dataset.theme;
}
applyTheme();

function currentEngine() { return els.engineAI.checked ? 'ai' : 'local'; }
function syncEngineUI() {
  const engine = currentEngine();
  els.byokBanner.hidden = !(engine === 'ai' && !byokDismissed);
  if (engine === 'ai') els.byokProviderName.textContent = settings.aiProvider === 'openai' ? 'OpenAI' : 'Google';
  if (engine === 'ai' && !currentKey()) {
    toast(`No ${settings.aiProvider === 'openai' ? 'OpenAI' : 'Gemini'} API key yet — add one in Settings ⚙`, 'error');
    openSettings();
  }
}
let byokDismissed = false;
function currentKey() { return settings.aiProvider === 'openai' ? settings.openaiKey : settings.geminiKey; }

/* ------------------------- history (IndexedDB) ------------------------- */
const IDB = {
  db: null,
  open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open('mdgen', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('docs')) {
          const s = db.createObjectStore('docs', { keyPath: 'id', autoIncrement: true });
          s.createIndex('ts', 'ts');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  },
  tx(mode, fn) {
    return this.open().then(db => db ? new Promise((resolve, reject) => {
      const t = db.transaction('docs', mode);
      const out = fn(t.objectStore('docs'));
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
    }) : null);
  },
  add(doc) {
    return this.tx('readwrite', s => { s.add(doc); }).then(() => this.trim());
  },
  trim() {
    return this.tx('readwrite', s => {
      const all = s.getAll();
      all.onsuccess = () => {
        const docs = all.result.sort((a, b) => b.ts - a.ts);
        docs.slice(50).forEach(d => s.delete(d.id));
      };
    });
  },
  list() {
    return this.tx('readonly', s => s.getAll()).then(r => (r || []).sort((a, b) => b.ts - a.ts));
  },
  del(id) { return this.tx('readwrite', s => s.delete(id)); },
  clear() { return this.tx('readwrite', s => s.clear()); },
};

/* ------------------------------ lazy loaders ------------------------------ */
function injectScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(el);
  });
}
let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import(/* @vite-ignore */ V.pdfjs).then(m => {
    m.GlobalWorkerOptions.workerSrc = V.pdfjsWorker;
    return m;
  });
  return pdfjsPromise;
}

async function probeLocal(url) {
  try {
    const r = await fetch(url);
    if (r.body) r.body.cancel().catch(() => {}); // headers only, no download
    return r.ok;
  } catch { return false; }
}

/* ------------------------------- OCR engine ------------------------------- */
let ocrWorker = null, ocrWorkerLang = null;
async function getOCRWorker(onProgress) {
  const lang = settings.lang || 'eng';
  if (ocrWorker && ocrWorkerLang === lang) return ocrWorker;
  if (ocrWorker) { try { await ocrWorker.terminate(); } catch { /* ok */ } ocrWorker = null; }
  const opts = langPath => Tesseract.createWorker(lang, 1, {
    workerPath: V.tesseractWorker,
    corePath: V.tesseractCore,
    langPath,
    gzip: true,
    cacheMethod: 'none',
    logger: onProgress,
  });
  onProgress({ status: 'loading OCR engine', progress: 0.02 });
  if (lang !== 'eng') { // extra languages may not be bundled; probe, mirror fallback
    const local = await probeLocal(`${V.tessdata}/${lang}.traineddata.gz`);
    if (!local) toast(`${lang} language pack will download once from mirror…`);
    try {
      ocrWorker = await opts(local ? V.tessdata : V.tessdataRemote);
    } catch {
      ocrWorker = await opts(V.tessdataRemote);
    }
  } else {
    ocrWorker = await opts(V.tessdata); // eng is bundled in-repo
  }
  ocrWorkerLang = lang;
  return ocrWorker;
}

async function ocrCanvas(canvas, onProgress) {
  const worker = await getOCRWorker(onProgress);
  const { data } = await worker.recognize(canvas, {}, { text: true, tsv: true });
  if (data.tsv) {
    const lines = P.parseTSV(data.tsv);
    const { md, conf } = P.ocrLinesToMarkdown(lines);
    if (md.trim()) return { raw: data.text || '', md: wrapIfCode(md), conf };
  }
  // fallback: no geometry
  const md = P.plainTextToMarkdown(data.text || '');
  return { raw: data.text || '', md, conf: data.confidence ? Math.round(data.confidence) : 0 };
}
function wrapIfCode(md) { return P.wrapCodeBlocks(md); }

/* ---------------------------- image preprocessing ---------------------------- */
async function fileToBitmap(file) {
  try { return await createImageBitmap(file); } catch { /* fallthrough to <img> */ }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
    img.src = url;
  });
}

function preprocessBitmap(src, srcW, srcH) {
  let w = srcW, h = srcH;
  const longest = Math.max(w, h);
  if (settings.downscale && longest > 2600) { const s = 2600 / longest; w = Math.round(w * s); h = Math.round(h * s); }
  else if (longest < 900) { const s = Math.min(2, 900 / longest * 1.35); w = Math.round(w * s); h = Math.round(h * s); }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  // grayscale + contrast stretch (OCR accuracy boost on photos/screens)
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = d[i + 1] = d[i + 2] = y;
    hist[y]++;
  }
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  const range = Math.max(24, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let y = (d[i] - lo) * 255 / range;
    y = y < 0 ? 0 : y > 255 ? 255 : y;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* -------------------------------- AI engine -------------------------------- */
function canvasToJpegB64(canvas, maxEdge) {
  maxEdge = maxEdge || 1600;
  let out = canvas;
  const longest = Math.max(canvas.width, canvas.height);
  if (longest > maxEdge) {
    const s = maxEdge / longest;
    out = document.createElement('canvas');
    out.width = Math.round(canvas.width * s); out.height = Math.round(canvas.height * s);
    out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
  }
  return out.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function aiCanvasToMD(canvas, fileName, onProgress) {
  const b64 = canvasToJpegB64(canvas);
  onProgress({ status: `sending to ${settings.aiProvider === 'openai' ? 'OpenAI' : 'Gemini'}`, progress: 0.4 });
  let md;
  if (settings.aiProvider === 'openai') md = await callOpenAI(b64);
  else md = await callGemini(b64);
  onProgress({ status: 'receiving Markdown', progress: 0.9 });
  return { raw: md, md: P.sanitizeAIMarkdown(md), conf: null };
}

async function callGemini(b64) {
  const key = settings.geminiKey;
  if (!key) throw new Error('Missing Gemini API key — add it in Settings.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.geminiModel)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: AI_PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
      generationConfig: { temperature: 0 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error('Gemini rejected the key or request — check the key in Settings.');
    if (res.status === 429) throw new Error('Gemini free-tier quota reached — retry later or use Local OCR.');
    if (res.status === 404) throw new Error(`Model "${settings.geminiModel}" not found — update the model name in Settings.`);
    throw new Error(`Gemini error ${res.status}: ${(data.error && data.error.message) || res.statusText}`);
  }
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map(p => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned an empty response — try Local OCR.');
  return text;
}

async function callOpenAI(b64) {
  const key = settings.openaiKey;
  if (!key) throw new Error('Missing OpenAI API key — add it in Settings.');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: settings.openaiModel,
      temperature: 0,
      max_completion_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: AI_PROMPT },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } },
        ],
      }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('OpenAI rejected the key — check it in Settings.');
    if (res.status === 429) throw new Error('OpenAI rate limit / insufficient quota.');
    if (res.status === 404) throw new Error(`Model "${settings.openaiModel}" not found — update the model name in Settings.`);
    throw new Error(`OpenAI error ${res.status}: ${(data.error && data.error.message) || res.statusText}`);
  }
  const text = (((data.choices || [])[0] || {}).message || {}).content || '';
  if (!text.trim()) throw new Error('OpenAI returned an empty response — try Local OCR.');
  return text;
}

/* ------------------------------ converters ------------------------------ */
async function convertImageFile(file, onProgress) {
  const bmp = await fileToBitmap(file);
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  const canvas = preprocessBitmap(bmp, w, h);
  onProgress({ status: currentEngine() === 'ai' ? 'preparing image' : 'recognizing text', progress: 0.1 });
  if (currentEngine() === 'ai') return { ...(await aiCanvasToMD(canvas, file.name, onProgress)), canvas, engine: settings.aiProvider === 'openai' ? 'openai' : 'gemini-' + settings.geminiModel };
  const r = await ocrCanvas(canvas, onProgress);
  return { ...r, canvas, engine: 'tesseract-local' };
}

function contentItemsToLines(tc) {
  const lines = [];
  let cur = { text: '', height: 0 };
  const heights = [];
  tc.items.forEach(it => {
    const s = it.str || '';
    const hgt = it.height || (it.transform ? Math.abs(it.transform[5] || 0) : 0);
    if (hgt) heights.push(hgt);
    cur.text += (cur.text && !/[\s-]$/.test(cur.text) && /^\S/.test(s) ? ' ' : '') + s;
    cur.height = Math.max(cur.height, hgt);
    if (it.hasEOL) { if (cur.text.trim()) lines.push({ ...cur }); cur = { text: '', height: 0 }; }
  });
  if (cur.text.trim()) lines.push(cur);
  const med = P.median(heights) || 0;
  return { lines, med };
}

async function convertPDFFile(file, onProgress) {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = doc.numPages;
  const pageThumbs = [];
  const pageMDs = [];
  let engineUsed = '';
  for (let p = 1; p <= n; p++) {
    if (cancelRequested) throw new Error('Cancelled');
    onProgress({ status: `PDF page ${p}/${n}`, progress: (p - 1) / n * 0.9 });
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const { lines, med } = contentItemsToLines(tc);
    const textLen = lines.reduce((s, l) => s + l.text.trim().length, 0);
    let md, engine;
    if (textLen >= 40) {
      // native text layer -> fast, lossless, free
      md = lines.map(l => {
        const t = l.text.trim();
        if (med && l.height >= med * 1.35 && t.length <= 90 && t.split(/\s+/).length <= 14) {
          return (l.height >= med * 1.7 ? '# ' : '## ') + t.replace(/[.\s]+$/, '');
        }
        return t;
      }).join('\n');
      md = P.plainTextToMarkdown(md);
      engine = 'pdf-native';
    } else {
      const viewport = page.getViewport({ scale: Math.min(2.5, Math.max(1.4, 1800 / page.getViewport({ scale: 1 }).width)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (currentEngine() === 'ai') {
        const r = await aiCanvasToMD(canvas, file.name, onProgress);
        md = r.md; engine = settings.aiProvider === 'openai' ? 'openai' : 'gemini-' + settings.geminiModel;
      } else {
        const r = await ocrCanvas(canvas, p2 => onProgress({ status: `OCR page ${p}/${n}: ${p2.status}`, progress: ((p - 1) + (p2.progress || 0)) / n * 0.9 }));
        md = r.md; engine = 'tesseract-local';
      }
    }
    engineUsed = engineUsed && engineUsed.split('+').includes(engine) ? engineUsed : (engineUsed ? engineUsed + '+' + engine : engine);
    pageMDs.push(md);
    const thumb = document.createElement('canvas');
    const tv = page.getViewport({ scale: 0.35 });
    thumb.width = Math.ceil(tv.width); thumb.height = Math.ceil(tv.height);
    await page.render({ canvasContext: thumb.getContext('2d'), viewport: tv }).promise;
  }
  const merged = n === 1 ? pageMDs[0]
    : pageMDs.map((m, i) => `## Page ${i + 1}\n\n${m.trim() || '_(no text found)_'}`).join('\n\n');
  return { raw: merged, md: P.collapseBlankLines(merged), conf: null, pages: n, engine: engineUsed || 'pdf' };
}

function htmlToMarkdown(root) {
  const walk = (node, listDepth) => {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const kids = [...node.childNodes].map(c => walk(c, listDepth)).join('');
    switch (tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return '\n\n' + '#'.repeat(+tag[1]) + ' ' + kids.trim() + '\n\n';
      case 'p': return '\n\n' + kids.trim() + '\n\n';
      case 'br': return '\n';
      case 'strong': case 'b': return '**' + kids.trim() + '**';
      case 'em': case 'i': return '*' + kids.trim() + '*';
      case 'code': return '`' + kids + '`';
      case 'pre': return '\n\n```\n' + node.textContent.replace(/\n+$/, '') + '\n```\n\n';
      case 'a': {
        const href = node.getAttribute('href') || '';
        const label = kids.trim() || href;
        return href && !href.startsWith('#') ? `[${label}](${href})` : label;
      }
      case 'img': return `![${node.getAttribute('alt') || 'image'}](${node.getAttribute('src') || ''})`;
      case 'li': {
        const marker = node.parentElement && node.parentElement.tagName.toLowerCase() === 'ol' ? '1. ' : '- ';
        return '\n' + '  '.repeat(listDepth) + marker + kids.trim().replace(/\n+/g, ' ');
      }
      case 'ul': case 'ol': return '\n' + [...node.children].map(c => walk(c, listDepth + 1)).join('') + '\n';
      case 'table': {
        const rows = [...node.querySelectorAll('tr')].map(tr =>
          [...tr.querySelectorAll('th,td')].map(td => td.textContent.trim().replace(/\s+/g, ' ')));
        return rows.length ? '\n\n' + P.renderTable(rows, true) + '\n\n' : '';
      }
      case 'blockquote': return '\n\n> ' + kids.trim().replace(/\n/g, '\n> ') + '\n\n';
      case 'hr': return '\n\n---\n\n';
      case 'script': case 'style': return '';
      default: return kids;
    }
  };
  return P.collapseBlankLines(walk(root, 0).trim());
}

async function convertDOCXFile(file, onProgress) {
  await injectScript(V.mammoth);
  onProgress({ status: 'extracting DOCX', progress: 0.3 });
  const result = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(result.value, 'text/html');
  onProgress({ status: 'converting to Markdown', progress: 0.7 });
  const md = htmlToMarkdown(doc.body);
  if (!md.trim()) throw new Error('DOCX had no extractable text.');
  return { raw: md, md, conf: null, engine: 'docx' };
}

async function convertTextFile(file, kind) {
  const text = await file.text();
  if (kind === 'csv') {
    const { md, totalRows, truncated } = P.csvToMarkdown(text, 200);
    return { raw: text, md, conf: null, engine: 'csv', extra: `${totalRows} rows${truncated ? ' (showing 200)' : ''}` };
  }
  const md = P.looksLikeCode(text)
    ? '```' + P.guessCodeLanguage(text) + '\n' + text.trim() + '\n```'
    : P.collapseBlankLines(text);
  return { raw: text, md, conf: null, engine: 'txt' };
}

function kindOf(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext) || file.type.startsWith('image/')) return 'image';
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (ext === 'docx' || file.type.includes('wordprocessingml')) return 'docx';
  if (ext === 'csv') return 'csv';
  if (ext === 'txt' || file.type === 'text/plain') return 'txt';
  return 'unknown';
}

/* -------------------------------- pipeline -------------------------------- */
const state = {
  results: [],        // {id, name, title, md, engine, conf, extra, pages, canvas, raw}
  activeId: null,
  rawLen: 0,
  chunks: { parts: null, index: 0, savedFull: '' },
  pageIndex: 0,
};
let cancelRequested = false;

function setProgress(frac, text) {
  els.overallProgress.style.width = Math.round(Math.min(1, Math.max(0, frac)) * 100) + '%';
  if (text) els.queueStatus.textContent = text;
}

function queueItem(name) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="q-state">⏳</span><span class="q-name"></span><span class="q-msg"></span>`;
  li.querySelector('.q-name').textContent = name;
  els.queueList.appendChild(li);
  return li;
}

async function runFiles(files) {
  const list = [...files];
  if (!list.length) return;
  if (location.protocol === 'file:' && list.some(f => ['pdf'].includes(kindOf(f)))) {
    toast('Serve MDgen over http(s) for PDF support (see README)', 'error');
  }
  state.results = [];
  state.chunks = { parts: null, index: 0, savedFull: '' };
  cancelRequested = false;
  els.queueSection.hidden = false;
  els.queueList.innerHTML = '';
  els.dropCard.hidden = true;
  els.studio.hidden = true;
  renderFileChips();

  let done = 0;
  for (const file of list) {
    const li = queueItem(file.name);
    const msg = m => { li.querySelector('.q-msg').textContent = m; };
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast(`${file.name} is over ${MAX_FILE_MB} MB — attempting anyway, may be slow`);
    }
    try {
      if (cancelRequested) throw new Error('Cancelled');
      const kind = kindOf(file);
      let r;
      const base = done / list.length;
      const progress = p => setProgress(base + (p.progress || 0) / list.length, `Converting ${done + 1}/${list.length} — ${file.name}`);
      msg('starting…');
      if (kind === 'image') r = await convertImageFile(file, p => { progress(p); msg(p.status || ''); });
      else if (kind === 'pdf') r = await convertPDFFile(file, p => { progress(p); msg(p.status || ''); });
      else if (kind === 'docx') r = await convertDOCXFile(file, p => { progress(p); msg(p.status || ''); });
      else if (kind === 'csv' || kind === 'txt') r = await convertTextFile(file, kind);
      else throw new Error(`Unsupported file type: ${file.name}`);
      const titleStem = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      const result = {
        id: Date.now() + Math.random().toString(16).slice(2),
        name: file.name,
        title: P.firstHeadingTitle(r.md) || titleStem || 'document',
        md: r.md, raw: r.raw || '', engine: r.engine || kind,
        conf: r.conf, extra: r.extra || '', pages: r.pages || 0,
        canvas: r.canvas || null,
      };
      state.results.push(result);
      state.rawLen = (r.raw || '').length;
      li.classList.add('done'); li.querySelector('.q-state').textContent = '✅'; msg(result.engine);
    } catch (err) {
      const errMsg = (err && (err.message || err.statusText)) || String(err) || 'Conversion failed';
      li.classList.add('error'); li.querySelector('.q-state').textContent = '⚠️';
      msg(errMsg === 'Cancelled' ? 'cancelled' : errMsg);
      if (errMsg === 'Cancelled') { setProgress(0, 'Cancelled'); break; }
      if (kindOf(file) === 'image' && currentEngine() === 'local') {
        msg(errMsg + ' — handwriting/complex layout? Try AI Vision');
      }
    } finally {
      done++;
      setProgress(done / list.length, `Done ${done}/${list.length}`);
    }
  }
  setTimeout(() => { els.queueSection.hidden = true; setProgress(0, ''); }, 900);

  if (state.results.length) {
    showResult(state.results[state.results.length - 1].id);
    renderFileChips();
    saveToHistory();
  } else {
    els.dropCard.hidden = false;
  }
}

async function saveToHistory() {
  for (const r of state.results) {
    let thumb = '';
    try {
      if (r.canvas) {
        const t = document.createElement('canvas');
        const s = Math.min(1, 160 / Math.max(r.canvas.width, r.canvas.height));
        t.width = Math.round(r.canvas.width * s); t.height = Math.round(r.canvas.height * s);
        t.getContext('2d').drawImage(r.canvas, 0, 0, t.width, t.height);
        thumb = t.toDataURL('image/jpeg', 0.6);
      }
    } catch { /* ignore */ }
    try { await IDB.add({ title: r.title, md: r.md, engine: r.engine, thumb, ts: Date.now() }); } catch { /* ignore */ }
  }
  renderRecent();
}

/* --------------------------------- studio --------------------------------- */
function renderFileChips() {
  els.fileChips.innerHTML = '';
  if (state.results.length < 2) { els.fileChips.hidden = true; return; }
  els.fileChips.hidden = false;
  state.results.forEach(r => {
    const b = document.createElement('button');
    b.className = 'fc' + (r.id === state.activeId ? ' active' : '');
    b.textContent = r.name;
    b.setAttribute('role', 'tab');
    b.onclick = () => showResult(r.id);
    els.fileChips.appendChild(b);
  });
}

function activeResult() { return state.results.find(r => r.id === state.activeId); }

function defaultMeta(r) {
  return {
    title: r ? r.title : 'document',
    source: r ? r.name : '',
    created: P.todayISO(),
    engine: r ? r.engine : '',
    tags: [],
    language: settings.lang,
    token_estimate: P.estimateTokens(r ? r.md : ''),
  };
}

function showResult(id) {
  state.activeId = id;
  state.chunks = { parts: null, index: 0, savedFull: '' };
  const r = activeResult();
  els.studio.hidden = false;
  els.dropCard.hidden = true;
  els.chunkSelect.value = '0';
  els.chunkCustom.hidden = true;
  els.chunkNav.innerHTML = '';
  els.chunkZipBtn.hidden = true;
  els.titleInput.value = r ? r.title : '';
  els.fmToggle.checked = settings.frontMatter;
  const body = r ? r.md : '';
  els.editor.value = settings.frontMatter ? P.buildFrontMatter(defaultMeta(r), body) : body;
  // preview pane
  els.thumbWrap.innerHTML = '';
  if (r && r.canvas) { els.thumbWrap.appendChild(r.canvas); }
  else els.thumbWrap.textContent = r && r.pages ? `📄 ${r.pages} page${r.pages > 1 ? 's' : ''} converted` : '—';
  els.pageNav.hidden = true;
  els.sourceMeta.textContent = r ? `${r.name} · engine: ${r.engine}${r.extra ? ' · ' + r.extra : ''}` : '';
  // confidence chip
  if (r && typeof r.conf === 'number' && r.conf > 0) {
    els.statConf.hidden = false;
    els.statConf.textContent = `OCR confidence ${r.conf}%`;
    els.statConf.classList.toggle('low', r.conf < 65);
    if (r.conf < 65) toast('Low OCR confidence — try AI Vision for better accuracy', 'error');
  } else els.statConf.hidden = true;
  const rawTok = P.estimateTokens(r ? r.raw : '');
  const cleanTok = P.estimateTokens(r ? r.md : '');
  if (r && rawTok > cleanTok) {
    els.statSaved.hidden = false;
    els.statSaved.textContent = `(saves ~${Math.round((1 - cleanTok / rawTok) * 100)}% tokens vs raw)`;
  } else els.statSaved.hidden = true;
  renderFileChips();
  updateStats();
  renderPreview();
  focusEditorStart();
}

function focusEditorStart() {
  els.editor.focus({ preventScroll: true });
  els.editor.setSelectionRange(0, 0);
}

function updateStats() {
  const s = P.statsOf(els.editor.value);
  els.statTokens.textContent = `~${s.tokens.toLocaleString()} tokens`;
  els.statChars.textContent = `${s.chars.toLocaleString()} chars`;
  els.statWords.textContent = `${s.words.toLocaleString()} words`;
}

function renderPreview() {
  if (els.preview.hidden) return;
  try {
    const { body } = P.splitFrontMatter(els.editor.value);
    els.preview.innerHTML = DOMPurify.sanitize(marked.parse(body || els.editor.value));
  } catch (e) {
    els.preview.textContent = 'Preview unavailable: ' + e.message;
  }
}

/* --------------------------------- chunks --------------------------------- */
function currentChunkTokens() {
  const v = els.chunkSelect.value;
  if (v === 'custom') return Math.max(500, +els.chunkCustom.value || 8000);
  return +v;
}
function applyChunks() {
  const max = currentChunkTokens();
  const md = els.editor.value;
  if (!max) {
    state.chunks = { parts: null, index: 0, savedFull: '' };
    els.chunkNav.innerHTML = ''; els.chunkZipBtn.hidden = true;
    updateStats(); return;
  }
  const parts = P.splitChunks(md, max, els.chunkOverlap.checked ? 1 : 0);
  if (parts.length <= 1) {
    state.chunks = { parts: null, index: 0, savedFull: '' };
    els.chunkNav.innerHTML = ''; els.chunkZipBtn.hidden = true;
    toast('Fits in one chunk — no split needed');
    return;
  }
  state.chunks = { parts, index: 0, savedFull: md };
  els.chunkNav.innerHTML = '';
  const full = document.createElement('button');
  full.textContent = 'full'; full.onclick = () => selectChunk(-1);
  els.chunkNav.appendChild(full);
  parts.forEach((p, i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1} (~${P.estimateTokens(p).toLocaleString()})`;
    b.onclick = () => selectChunk(i);
    els.chunkNav.appendChild(b);
  });
  els.chunkZipBtn.hidden = false;
  selectChunk(0);
  toast(`Split into ${parts.length} chunks`);
}
function selectChunk(i) {
  const c = state.chunks;
  if (!c.parts) return;
  c.index = i;
  els.editor.value = i < 0 ? c.savedFull : c.parts[i];
  [...els.chunkNav.children].forEach((b, k) => b.classList.toggle('active', k === i + 1));
  updateStats(); renderPreview();
}
function currentFullDoc() {
  return state.chunks.parts ? state.chunks.savedFull : els.editor.value;
}

/* --------------------------------- export --------------------------------- */
function copyText(t, msg) {
  navigator.clipboard.writeText(t).then(() => toast(msg || 'Copied!'))
    .catch(() => { // fallback
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); toast(msg || 'Copied!');
    });
}
function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function currentSlug() {
  const r = activeResult();
  const { meta } = P.splitFrontMatter(els.editor.value);
  return P.slugify(els.titleInput.value || meta.title || (r && r.title));
}
function currentFilename() {
  return `${currentSlug()}-${P.todayISO().replace(/-/g, '')}.md`;
}

async function downloadZip() {
  await injectScript(V.jszip);
  const zip = new JSZip();
  if (state.chunks.parts) {
    state.chunks.parts.forEach((p, i) => zip.file(`${currentSlug()}-part-${String(i + 1).padStart(2, '0')}.md`, p));
    zip.file('index.md', `# ${currentSlug()} — ${state.chunks.parts.length} chunks\n\n` +
      state.chunks.parts.map((p, i) => `- part ${i + 1}: ~${P.estimateTokens(p)} tokens`).join('\n'));
  } else {
    state.results.forEach((r, i) => {
      zip.file(`${String(i + 1).padStart(2, '0')}-${P.slugify(r.title)}.md`,
        P.buildFrontMatter(defaultMeta(r), r.md));
    });
    zip.file('index.md', '# MDgen export\n\n' + state.results.map((r, i) =>
      `- [${P.slugify(r.title)}](${String(i + 1).padStart(2, '0')}-${P.slugify(r.title)}.md) — ${r.name} (${r.engine})`).join('\n'));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(`${currentSlug() || 'mdgen'}-${P.todayISO().replace(/-/g, '')}.zip`, blob);
  toast('ZIP downloaded');
}

/* --------------------------------- recent --------------------------------- */
async function renderRecent() {
  const docs = await IDB.list().catch(() => []) || [];
  els.recentSection.hidden = !docs.length;
  els.recentList.innerHTML = '';
  const q = (els.recentSearch.value || '').toLowerCase();
  docs.filter(d => !q || (d.title || '').toLowerCase().includes(q) || (d.md || '').toLowerCase().includes(q))
    .forEach(d => {
      const li = document.createElement('li');
      li.innerHTML = `
        ${d.thumb ? '<img alt="" />' : '<img alt="" style="visibility:hidden" />'}
        <div><div class="r-title"></div><div class="r-meta"></div></div>
        <button class="r-del" aria-label="Delete" title="Delete">×</button>`;
      if (d.thumb) li.querySelector('img').src = d.thumb;
      li.querySelector('.r-title').textContent = d.title || 'untitled';
      li.querySelector('.r-meta').textContent = `${new Date(d.ts).toLocaleString()} · ${d.engine} · ~${P.estimateTokens(d.md)} tok`;
      li.querySelector('.r-del').onclick = ev => { ev.stopPropagation(); IDB.del(d.id).then(renderRecent); };
      li.onclick = () => {
        const r = {
          id: 'history-' + d.id, name: (d.title || 'document') + '.md', title: d.title || 'document',
          md: d.md, raw: '', engine: d.engine, conf: null, extra: 'from history', pages: 0, canvas: null,
        };
        state.results = [r];
        showResult(r.id);
      };
      els.recentList.appendChild(li);
    });
}

/* --------------------------------- editor --------------------------------- */
let editorTimer = 0;
els.editor.addEventListener('input', () => {
  updateStats();
  clearTimeout(editorTimer);
  editorTimer = setTimeout(renderPreview, 250);
  const r = activeResult();
  if (r && !state.chunks.parts) r.md = els.editor.value; // keep result in sync
});

els.titleInput.addEventListener('input', () => {
  const r = activeResult();
  if (r) r.title = els.titleInput.value;
  const { hasFM, meta, body } = P.splitFrontMatter(els.editor.value);
  if (hasFM) { meta.title = els.titleInput.value; els.editor.value = P.buildFrontMatter(meta, body); updateStats(); }
  renderFileChips();
});

els.fmToggle.addEventListener('change', () => {
  const { hasFM, meta, body } = P.splitFrontMatter(els.editor.value);
  if (els.fmToggle.checked && !hasFM) {
    els.editor.value = P.buildFrontMatter({ ...defaultMeta(activeResult()), title: els.titleInput.value || 'document' }, body);
  } else if (!els.fmToggle.checked && hasFM) {
    els.editor.value = body.replace(/^\n+/, '');
  }
  updateStats(); renderPreview();
});

els.promptSelect.addEventListener('change', () => {
  const p = els.promptSelect.value;
  els.promptSelect.value = '';
  if (!p) return;
  els.editor.value = p + '\n\n' + els.editor.value;
  updateStats(); renderPreview();
  toast('Prompt inserted at top — copy everything into your AI chat');
});

/* tabs */
function setTab(preview) {
  els.tabEdit.classList.toggle('active', !preview);
  els.tabPreview.classList.toggle('active', preview);
  els.tabEdit.setAttribute('aria-selected', String(!preview));
  els.tabPreview.setAttribute('aria-selected', String(preview));
  els.editor.hidden = preview;
  els.preview.hidden = !preview;
  if (preview) renderPreview();
}
els.tabEdit.onclick = () => setTab(false);
els.tabPreview.onclick = () => setTab(true);

/* cleanup buttons */
const cleanups = [
  [els.btnHeadings, P.fixHeadings, 'Heading hierarchy fixed'],
  [els.btnLists, P.normalizeLists, 'Lists normalized'],
  [els.btnTables, P.tidyTables, 'Tables tidied'],
  [els.btnDehyph, P.dehyphenate, 'De-hyphenated'],
  [els.btnBlank, P.collapseBlankLines, 'Blank lines trimmed'],
  [els.btnCode, P.wrapCodeBlocks, 'Code blocks wrapped'],
];
cleanups.forEach(([btn, fn, msg]) => {
  btn.onclick = () => {
    const before = els.editor.value;
    const after = fn(before);
    els.editor.value = after;
    updateStats(); renderPreview();
    const r = activeResult(); if (r) r.md = after;
    toast(after === before ? msg + ' (no changes needed)' : msg);
  };
});

els.btnCompact.onclick = () => {
  const before = els.editor.value;
  const after = P.compactMarkdown(before);
  els.editor.value = after;
  const b = P.estimateTokens(before), a = P.estimateTokens(after);
  updateStats(); renderPreview();
  const r = activeResult(); if (r) r.md = after;
  toast(a >= b ? 'Already compact' : `Compacted: ~${b.toLocaleString()} → ~${a.toLocaleString()} tokens (−${Math.round((1 - a / b) * 100)}%)`);
};

/* chunker */
els.chunkSelect.addEventListener('change', () => {
  els.chunkCustom.hidden = els.chunkSelect.value !== 'custom';
  applyChunks();
});
els.chunkCustom.addEventListener('change', applyChunks);
els.chunkOverlap.addEventListener('change', applyChunks);
els.chunkZipBtn.onclick = downloadZip;

/* export buttons */
els.copyBtn.onclick = () => copyText(els.editor.value);
els.downloadBtn.onclick = () => {
  const parts = state.chunks.parts;
  if (parts) { downloadZip(); return; }
  downloadBlob(currentFilename(), new Blob([els.editor.value], { type: 'text/markdown;charset=utf-8' }));
  toast('Downloaded ' + currentFilename());
};
els.copyTextBtn.onclick = () => {
  const { body } = P.splitFrontMatter(els.editor.value);
  const plain = (body || els.editor.value)
    .replace(/```(\w*)\n?/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^- \[ \] /gm, '☐ ')
    .replace(/^- /gm, '• ')
    .replace(/^\s*\|\s*/gm, '')
    .replace(/\s*\|\s*/g, '\t')
    .replace(/^\|\s*$/gm, '')
    .replace(/^\t?-{3,}\t?$/gm, '');
  copyText(plain.replace(/\n{3,}/g, '\n\n').trim(), 'Plain text copied!');
  closeMore();
};
els.copyHTMLBtn.onclick = () => {
  const { body } = P.splitFrontMatter(els.editor.value);
  copyText(DOMPurify.sanitize(marked.parse(body || els.editor.value)), 'HTML copied!');
  closeMore();
};
els.shareLinkBtn.onclick = () => {
  const md = els.editor.value;
  if (md.length > 6000) { toast('Too long for a share link (6k chars max) — download instead', 'error'); return; }
  copyText(`${location.origin}${location.pathname}#md=${P.encodeShare(md)}`, 'Share link copied!');
  closeMore();
};
els.resetBtn.onclick = () => { resetUI(); closeMore(); };
els.rerunAIBtn.onclick = async () => {
  closeMore();
  const r = activeResult();
  if (!r) return;
  if (!currentKey()) { toast('Add an AI API key in Settings first', 'error'); openSettings(); return; }
  els.engineAI.checked = true; syncEngineUI();
  try {
    els.dropCard.hidden = true;
    toast('Re-running with AI Vision…');
    let canvas = r.canvas;
    if (!canvas) { // PDFs: rebuild from stored name unavailable -> ask for fresh drop
      toast('Re-drop the file to re-run with AI Vision', 'error');
      return;
    }
    const out = await aiCanvasToMD(canvas, r.name, () => {});
    r.md = out.md; r.engine = currentEngine() === 'ai' ? (settings.aiProvider === 'openai' ? 'openai' : 'gemini-' + settings.geminiModel) : r.engine;
    r.conf = null;
    showResult(r.id);
    toast('AI Vision conversion done');
  } catch (e) { toast(e.message, 'error'); }
};

function closeMore() { els.moreMenu.hidden = true; els.moreBtn.setAttribute('aria-expanded', 'false'); }
els.moreBtn.onclick = () => {
  els.moreMenu.hidden = !els.moreMenu.hidden;
  els.moreBtn.setAttribute('aria-expanded', String(!els.moreMenu.hidden));
};
document.addEventListener('click', e => {
  if (!els.moreMenu.hidden && !e.target.closest('.menu-wrap')) closeMore();
});

function resetUI() {
  state.results = []; state.activeId = null;
  state.chunks = { parts: null, index: 0, savedFull: '' };
  els.studio.hidden = true;
  els.dropCard.hidden = false;
  els.editor.value = '';
  els.fileInput.value = '';
}

/* ---------------------------- input: paste/dnd ---------------------------- */
document.addEventListener('paste', e => {
  if (e.target.closest('input[type="text"], input[type="search"], input[type="password"], input[type="number"]')) return;
  if (e.target === els.editor) return; // let user paste text into editor
  const items = (e.clipboardData && e.clipboardData.items) || [];
  const files = [...items].filter(it => it.kind === 'file').map(it => it.getAsFile()).filter(Boolean);
  if (files.length) {
    e.preventDefault();
    runFiles(files.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${P.todayISO()}-${i + 1}.${(f.type.split('/')[1] || 'png')}`, { type: f.type })));
  } else {
    toast('Clipboard has no image — copy a screenshot first');
  }
});

let dragDepth = 0;
window.addEventListener('dragenter', e => {
  if (![...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files')) return;
  dragDepth++;
  els.dropOverlay.hidden = false;
});
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; els.dropOverlay.hidden = true; } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.hidden = true;
  const files = [...(e.dataTransfer && e.dataTransfer.files || [])];
  if (files.length) runFiles(files);
});

els.browseBtn.onclick = () => els.fileInput.click();
els.dropCard.addEventListener('click', e => { if (!e.target.closest('button')) els.fileInput.click(); });
els.fileInput.addEventListener('change', () => { runFiles(els.fileInput.files); els.fileInput.value = ''; });

els.cancelBtn.onclick = async () => {
  cancelRequested = true;
  if (ocrWorker) { try { const w = ocrWorker; ocrWorker = null; ocrWorkerLang = null; await w.terminate(); } catch { /* ok */ } }
  toast('Cancelled');
};

/* -------------------------------- settings -------------------------------- */
function openSettings() {
  els.setEngineLocal.checked = settings.engine === 'local';
  els.setEngineAI.checked = settings.engine === 'ai';
  els.setProvider.value = settings.aiProvider;
  els.geminiKey.value = settings.geminiKey;
  els.openaiKey.value = settings.openaiKey;
  els.geminiModel.value = settings.geminiModel;
  els.openaiModel.value = settings.openaiModel;
  els.setLang.value = settings.lang;
  els.setTheme.value = settings.theme;
  els.setDownscale.checked = settings.downscale;
  els.setFM.checked = settings.frontMatter;
  if (!els.settingsModal.open) els.settingsModal.showModal();
}
els.settingsBtn.onclick = openSettings;
els.helpBtn.onclick = () => els.helpModal.showModal();
els.closeHelpBtn.onclick = () => els.helpModal.close();
els.closeSettingsBtn.onclick = () => els.settingsModal.close();

els.saveSettingsBtn.onclick = () => {
  settings.engine = els.setEngineAI.checked ? 'ai' : 'local';
  settings.aiProvider = els.setProvider.value;
  settings.geminiKey = els.geminiKey.value.trim();
  settings.openaiKey = els.openaiKey.value.trim();
  settings.geminiModel = els.geminiModel.value.trim() || DEFAULTS.geminiModel;
  settings.openaiModel = els.openaiModel.value.trim() || DEFAULTS.openaiModel;
  settings.lang = els.setLang.value;
  settings.theme = els.setTheme.value;
  settings.downscale = els.setDownscale.checked;
  settings.frontMatter = els.setFM.checked;
  saveSettings(); applyTheme();
  els.engineAI.checked = settings.engine === 'ai';
  els.engineLocal.checked = settings.engine === 'local';
  syncEngineUI();
  els.settingsModal.close();
  toast('Settings saved');
};
els.clearKeysBtn.onclick = () => {
  els.geminiKey.value = ''; els.openaiKey.value = '';
  settings.geminiKey = ''; settings.openaiKey = '';
  saveSettings(); toast('Keys cleared from this device');
};
els.clearHistoryBtn.onclick = async () => {
  await IDB.clear().catch(() => {});
  renderRecent(); toast('History cleared');
};
els.testKeyBtn.onclick = async () => {
  const provider = els.setProvider.value;
  const key = (provider === 'openai' ? els.openaiKey : els.geminiKey).value.trim();
  if (!key) { toast('Enter a key first', 'error'); return; }
  els.testKeyBtn.disabled = true; els.testKeyBtn.textContent = 'Testing…';
  try {
    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(els.geminiModel.value.trim() || DEFAULTS.geminiModel)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with: OK' }] }] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast('Gemini key works ✓');
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: els.openaiModel.value.trim() || DEFAULTS.openaiModel, max_completion_tokens: 4, messages: [{ role: 'user', content: 'Reply with: OK' }] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast('OpenAI key works ✓');
    }
  } catch (e) { toast(`Key test failed (${e.message}) — check key and model name`, 'error'); }
  els.testKeyBtn.disabled = false; els.testKeyBtn.textContent = 'Test key';
};

/* engine radios */
[els.engineLocal, els.engineAI].forEach(r => r.addEventListener('change', () => {
  settings.engine = currentEngine(); saveSettings(); syncEngineUI();
}));
els.byokDismiss.onclick = () => { byokDismissed = true; els.byokBanner.hidden = true; };

/* recent */
els.recentSearch.addEventListener('input', renderRecent);
els.recentClear.onclick = async () => { await IDB.clear().catch(() => {}); renderRecent(); };

/* keyboard */
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); resetUI(); }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); if (!els.studio.hidden) copyText(els.editor.value); }
  if (e.key === 'Escape' && cancelRequested === false && !els.queueSection.hidden) els.cancelBtn.click();
});

/* --------------------------------- boot --------------------------------- */
function loadShareHash() {
  if (!location.hash.startsWith('#md=')) return false;
  try {
    const md = P.decodeShare(location.hash.slice(4));
    const r = {
      id: 'shared', name: 'shared.md', title: P.firstHeadingTitle(P.splitFrontMatter(md).body) || 'shared document',
      md, raw: '', engine: 'shared', conf: null, extra: 'from share link', pages: 0, canvas: null,
    };
    state.results = [r];
    showResult(r.id);
    toast('Loaded shared Markdown');
    return true;
  } catch { toast('Invalid share link', 'error'); return false; }
}

function boot() {
  if (location.protocol === 'file:') {
    toast('MDgen works best served over http — see README (python3 -m http.server)', 'error');
  }
  if (matchMedia('(pointer:coarse)').matches) els.pasteHint.hidden = false;
  els.engineAI.checked = settings.engine === 'ai';
  els.engineLocal.checked = settings.engine !== 'ai';
  els.byokBanner.hidden = true;
  renderRecent();
  if (!loadShareHash()) els.dropCard.hidden = false;
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register(new URL('sw.js', BASE)).catch(() => {});
  }
}
boot();

})();
