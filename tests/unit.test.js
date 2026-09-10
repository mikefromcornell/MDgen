/* MDgen unit tests — pure Markdown pipeline functions. Run: node tests/unit.test.js */
'use strict';
const P = require('../app.js');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  a === b ? pass++ : (fail++, console.log(`FAIL ${name}\n  got:  ${a}\n  want: ${b}`));
};
const ok = (name, cond, extra) => cond ? pass++ : (fail++, console.log(`FAIL ${name}`, extra || ''));
const W = (l, t, w, h, conf, text) => ({ l, t, w, h, conf, text });
const tsv = groups => {
  const rows = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'];
  groups.forEach(g => g.lines.forEach((ln, li) => ln.forEach((w, wi) =>
    rows.push(['5', 1, g.b, g.p, li + 1, wi + 1, w.l, w.t, w.w, w.h, w.conf, w.text].join('\t')))));
  return rows.join('\n');
};

/* tokens & stats */
eq('tokens 400 chars', P.estimateTokens('x'.repeat(400)), 100);
eq('stats words', P.statsOf('hello world\nfoo').words, 3);
/* slug */
eq('slug', P.slugify('Q3 Earnings: Final (v2)!'), 'q3-earnings-final-v2');
eq('slug fallback', P.slugify('!!!', 'image-001'), 'image-001');
/* front matter */
const fm = P.buildFrontMatter({ title: 'My Doc', source: 'a.png', created: '2026-09-10', engine: 'tesseract-local', tags: ['a', 'b'], token_estimate: 42 }, '# Hi\n\nbody');
const sp = P.splitFrontMatter(fm);
ok('fm has', sp.hasFM);
eq('fm title', sp.meta.title, 'My Doc');
eq('fm tags', sp.meta.tags, ['a', 'b']);
eq('fm body', sp.body.trim(), '# Hi\n\nbody');
ok('fm order stable', P.buildFrontMatter({ title: 'T', token_estimate: 9, tags: [], source: 's.png' }, 'b')
  .split('\n').indexOf('source: s.png') === 2);
/* headings */
eq('firstHeading', P.firstHeadingTitle('\ntext\n## **Real** Title\nmore'), 'Real Title');
eq('firstHeading skips page separators', P.firstHeadingTitle('## Page 1\n# Actual Doc'), 'Actual Doc');
eq('headings promote', P.fixHeadings('### A\n#### B\n### C'), '# A\n## B\n# C');
eq('headings no-skip', P.fixHeadings('# A\n### B\n## C'), '# A\n## B\n## C');
eq('headings fences safe', P.fixHeadings('```\n### not heading\n```\n### real'), '```\n### not heading\n```\n# real');
/* lists */
eq('lists', P.normalizeLists('• one\n· two\n– three'), '- one\n- two\n- three');
eq('ocr misread bullets', P.normalizeLists('¢ Launch\n« Reduce\n~ Note'), '- Launch\n- Reduce\n- Note');
eq('double misread bullet', P.normalizeLists('¢« Item here'), '- Item here');
eq('dollar untouched', P.normalizeLists('$50 per share'), '$50 per share');
/* cleanup */
eq('collapse', P.collapseBlankLines('a\n\n\n\n\nb   \n\n\n'), 'a\n\nb\n');
eq('dehyph', P.dehyphenate('infor-\nmation'), 'information');
/* tables */
const tidied = P.tidyTables('|a|b|\n|1|22|');
ok('tidy separator', /^\| -+ \| -+ \|$/m.test(tidied), tidied);
eq('minify round-trip', P.minifyTables(tidied), '|a|b|\n|---|---|\n|1|22|');
ok('escape pipes', P.renderTable([['x|y', 'z'], ['1', '2']], false).includes('x\\|y'));
/* code */
ok('looks code', P.looksLikeCode('function add(a, b) {\n  return a + b;\n}'));
ok('not code', !P.looksLikeCode('The quick brown fox jumps over the lazy dog. It was sunny.'));
eq('lang js', P.guessCodeLanguage('const x = () => 1;\nconsole.log(x);'), 'javascript');
eq('lang py', P.guessCodeLanguage('def f(x):\n    return x\nprint(f(1))'), 'python');
const wrapped = P.wrapCodeBlocks('Intro text here.\n\nfunction add(a, b) {\n  return a + b;\n}\n');
ok('wrap code', wrapped.includes('```javascript'), wrapped);
ok('wrap keeps prose', wrapped.startsWith('Intro text here.'));
/* compact */
const doc = fm + '\n\n| col a | col b |\n| 1 | 2 |\n\n\n\n\ntext   \n';
const compact = P.compactMarkdown(doc);
ok('compact smaller', compact.length < doc.length);
ok('compact valid table', compact.includes('|col a|col b|\n|---|---|\n|1|2|'));
ok('compact keeps fm', compact.startsWith('---\n'));
/* chunks */
const big = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} ` + 'w'.repeat(350)).join('\n\n');
const chunks = P.splitChunks(big, 2000, 1);
eq('chunk count', chunks.length, 3);
ok('chunk size bounded', chunks.every(c => P.estimateTokens(c) <= 2200), chunks.map(c => P.estimateTokens(c)));
const joined = chunks.join('\n\n');
ok('chunks preserve all paragraphs', Array.from({ length: 60 }, (_, i) => joined.includes(`Paragraph ${i}`)).every(Boolean));
eq('chunk passthrough', P.splitChunks('short doc', 8000, 1), ['short doc']);
/* csv */
const csv = 'name,age,city\n"Smith, John",30,"New ""York"""\nJane,25,LA';
const parsed = P.parseCSV(csv, 200);
eq('csv rows', parsed.rows.length, 3);
eq('csv quoted comma', parsed.rows[1][0], 'Smith, John');
eq('csv quoted quote', parsed.rows[1][2], 'New "York"');
eq('semi delim', P.detectDelimiter('a;b;c'), ';');
ok('csv md', P.csvToMarkdown(csv).md.includes('Smith, John'));
/* tsv → markdown: geometry */
const tHeading = P.ocrLinesToMarkdown(P.parseTSV(tsv([
  { b: 1, p: 1, lines: [[W(100, 10, 400, 40, 97, 'QUARTERLY'), W(510, 10, 300, 40, 97, 'REPORT')]] },
  { b: 2, p: 1, lines: [
    [W(100, 90, 90, 16, 95, 'Revenue'), W(200, 90, 60, 16, 95, 'grew'), W(270, 90, 40, 16, 95, 'by'), W(320, 90, 50, 16, 95, '15%')],
    [W(100, 120, 90, 16, 95, 'Profit'), W(200, 120, 70, 16, 95, 'also'), W(280, 120, 60, 16, 95, 'rose')],
  ] },
])));
ok('geometry heading', tHeading.md.startsWith('# QUARTERLY REPORT'), tHeading.md);
ok('geometry para merge', tHeading.md.includes('Revenue grew by 15%'), tHeading.md);
ok('geometry conf', tHeading.conf >= 90);
const tTable = P.ocrLinesToMarkdown(P.parseTSV(tsv([
  { b: 1, p: 1, lines: [
    [W(100, 10, 80, 16, 95, 'Name'), W(500, 10, 80, 16, 95, 'Qty')],
    [W(100, 40, 80, 16, 95, 'Apples'), W(500, 40, 60, 16, 95, '12')],
    [W(100, 70, 80, 16, 95, 'Pears'), W(500, 70, 60, 16, 95, '7')],
  ] },
])));
ok('geometry table', /\| Name\s*\|\s*Qty\s*\|/.test(tTable.md) && /\| Pears\s*\|\s*7\s*\|/.test(tTable.md), tTable.md);
const tProse = P.ocrLinesToMarkdown(P.parseTSV(tsv([
  { b: 1, p: 1, lines: [
    [W(100, 10, 60, 16, 95, 'The'), W(165, 10, 70, 16, 95, 'quick'), W(240, 10, 60, 16, 95, 'brown'), W(305, 10, 40, 16, 95, 'fox')],
    [W(100, 40, 50, 16, 95, 'over'), W(150, 40, 40, 16, 95, 'the'), W(195, 40, 50, 16, 95, 'lazy'), W(250, 40, 40, 16, 95, 'dog')],
  ] },
])));
ok('prose not tabled', !tProse.md.includes('|'), tProse.md);
const tBullets = P.ocrLinesToMarkdown(P.parseTSV(tsv([
  { b: 1, p: 1, lines: [
    [W(100, 10, 20, 16, 95, '•'), W(140, 10, 90, 16, 95, 'first'), W(240, 10, 70, 16, 95, 'item')],
    [W(100, 40, 20, 16, 95, '•'), W(140, 40, 90, 16, 95, 'second'), W(240, 40, 70, 16, 95, 'item')],
  ] },
])));
ok('geometry bullets', tBullets.md.includes('- first item') && tBullets.md.includes('- second item'), tBullets.md);
/* plain text */
const plain = P.plainTextToMarkdown('SYSTEM OVERVIEW\n\nRevenue grew.\n\n  npm install x\n  npm run build');
ok('plain heading', plain.includes('## SYSTEM OVERVIEW'), plain);
ok('plain code', plain.includes('```bash'), plain);
/* ai sanitize + share */
eq('sanitize fence', P.sanitizeAIMarkdown('```markdown\n# T\n\nbody\n```'), '# T\n\nbody');
eq('share roundtrip', P.decodeShare(P.encodeShare('# Héllo ✓ €')), '# Héllo ✓ €');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
