/* node test.cjs — self-check for the scheduler and the CSV parser. */
const assert = require('assert');

(async () => {
  const { schedule, fmtInterval, parseCSV, retrievability } = await import('./core.js');
  const { normalizeDB } = await import('./store.js');

  const NOW = Date.UTC(2026, 0, 1);

  // --- normalizeDB checks
  const blankState = normalizeDB(null);
  assert.deepStrictEqual(blankState.decks, [], 'null DB should produce empty decks');
  assert.strictEqual(blankState.settings.theme, 'light', 'default theme should be light');

  const dirtyDB = {
    decks: [{ id: 'd1' }, null, 42, 'str', [], { id: 'd2' }],
    cards: [null, { id: 'c1' }, 0],
    log: [{ id: 'l1' }, false, null],
    lastBackup: 12345,
    settings: { new: 10, max: 100 }
  };
  const cleanDB = normalizeDB(dirtyDB);
  assert.deepStrictEqual(cleanDB.decks, [{ id: 'd1' }, { id: 'd2' }], 'primitives, null, arrays must be stripped from decks');
  assert.deepStrictEqual(cleanDB.cards, [{ id: 'c1' }], 'primitives and null must be stripped from cards');
  assert.deepStrictEqual(cleanDB.log, [{ id: 'l1' }], 'primitives and null must be stripped from log');
  assert.strictEqual(cleanDB.lastBackup, 12345, 'valid lastBackup should be preserved');
  assert.strictEqual(cleanDB.settings.new, 10, 'valid settings should be preserved');
  assert.strictEqual(cleanDB.settings.ret, 90, 'missing settings should fallback to defaults');

  assert.deepStrictEqual(normalizeDB('string_not_obj').decks, [], 'primitive DB root should yield blank db');
  const fresh = { reps: 0, s: 0, d: 0, last: 0 };
  const after = (card, g, now) => {
    const r = schedule(card, g, now);
    return { ...card, s: r.s, d: r.d, due: r.due, last: now, reps: card.reps + 1, days: r.days };
  };

  // --- new cards: harder grades give shorter intervals and higher difficulty
  const first = [1, 2, 3, 4].map(g => after(fresh, g, NOW));
  assert.deepStrictEqual(first.map(c => c.days), [...first].map(c => c.days).sort((a, b) => a - b),
    'intervals must be monotonic across Again<Hard<Good<Easy');
  assert.ok(first[0].d > first[3].d, 'Again must leave the card harder than Easy');
  assert.ok(first[0].days < 1 / 24 && first[3].days >= 1, 'Again reschedules within the session, Easy in days');

  // --- repeated Good keeps growing the interval
  let c = after(fresh, 3, NOW), prev = 0;
  for (let i = 0; i < 8; i++) {
    assert.ok(c.days > prev, `interval must grow: ${c.days} <= ${prev}`);
    prev = c.days;
    c = after(c, 3, c.due);
  }
  assert.ok(prev > 30, `8 successful reviews should exceed a month, got ${prev}d`);

  // --- a lapse shrinks stability and never schedules further out than before
  const strong = c, lapsed = after(strong, 1, strong.due);
  assert.ok(lapsed.s < strong.s, 'forgetting must reduce stability');
  assert.ok(lapsed.d > strong.d, 'forgetting must raise difficulty');

  // --- difficulty stays inside [1,10] under adversarial grading
  let d1 = fresh, d2 = fresh;
  for (let i = 0; i < 40; i++) { d1 = after(d1, 1, d1.due || NOW); d2 = after(d2, 4, d2.due || NOW); }
  assert.ok(d1.d <= 10 && d1.d >= 1 && d2.d >= 1 && d2.d <= 10, 'difficulty out of range');

  // --- retrievability: 1 at t=0, ~0.9 after exactly one stability-length
  assert.strictEqual(retrievability(0, 5), 1);
  assert.ok(Math.abs(retrievability(5, 5) - 0.9) < 1e-9, 'R(S,S) must equal the 0.9 anchor');

  // --- lower target retention must produce longer intervals
  assert.ok(schedule(fresh, 3, NOW, 0.8).days >= schedule(fresh, 3, NOW, 0.95).days,
    'lower retention target => longer intervals');

  // --- interval labels
  assert.strictEqual(fmtInterval(1 / 1440), '<1分');
  assert.strictEqual(fmtInterval(4), '4日後');
  assert.strictEqual(fmtInterval(400), '1.1年後');

  // --- CSV / TSV parsing
  assert.deepStrictEqual(parseCSV('a,b\n"c,1","d""x"\n\n# note,skip\n,empty').map(r => r.slice(0, 2)),
    [['a', 'b'], ['c,1', 'd"x']]);
  assert.deepStrictEqual(parseCSV('front\tback\r\nq\ta').map(r => r.slice(0, 2)), [['q', 'a']],
    'a recognised header row is dropped');
  assert.deepStrictEqual(parseCSV('front\tback').map(r => r.slice(0, 2)), [['front', 'back']],
    'but not when it is the only row — that is real data');

  // --- contrast ratio checks for form controls and switch track (WCAG 1.4.11 >= 3:1)
  const fs = require('fs');
  const cssContent = fs.readFileSync('./app.css', 'utf8');
  const htmlContent = fs.readFileSync('./index.html', 'utf8');
  const jsContent = fs.readFileSync('./app.js', 'utf8');

  assert.ok(htmlContent.includes('すべてのデータを消去</span>'), 'wipe button label should be すべてのデータを消去');
  assert.ok(!htmlContent.includes('すべてのデータを消去（危険）'), 'wipe button label must not include (危険)');
  assert.ok(htmlContent.includes('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'), 'status bar style meta must be black-translucent');
  assert.ok(jsContent.includes("document.documentElement.className = `theme-${db.settings.theme}`;"), 'applyTheme must update documentElement class');

  const htmlBodyMatch = cssContent.match(/html,\s*body\s*\{([^}]+)\}/);
  assert.ok(htmlBodyMatch && /background\s*:\s*var\(--surface\)/.test(htmlBodyMatch[1]), 'html, body must set background to var(--surface)');

  // Verify .switch ruleset in app.css includes a border using var(--outline)
  const switchMatch = cssContent.match(/\.switch\s*\{([^}]+)\}/);
  assert.ok(switchMatch, '.switch CSS rule must exist in app.css');
  assert.ok(
    /border\s*:\s*[^;]*var\(--outline\)/.test(switchMatch[1]),
    '.switch in app.css must declare a border using var(--outline)'
  );

  // Extract --outline mix percentage from app.css
  const outlineMixMatch = cssContent.match(/--outline\s*:\s*color-mix\([^)]*var\(--ink\)\s*(\d+)%/);
  assert.ok(outlineMixMatch, '--outline color-mix definition must exist in app.css');
  const outlinePct = parseInt(outlineMixMatch[1], 10);

  function parseHexColor(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ];
  }
  function mixColors(c1, c2, weight1Pct) {
    const w1 = weight1Pct / 100, w2 = 1 - w1;
    return [
      Math.round(c1[0] * w1 + c2[0] * w2),
      Math.round(c1[1] * w1 + c2[1] * w2),
      Math.round(c1[2] * w1 + c2[2] * w2)
    ];
  }
  function calcLuminance([r, g, b]) {
    const [sr, sg, sb] = [r, g, b].map(v => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
  }
  function getContrastRatio(rgb1, rgb2) {
    const l1 = calcLuminance(rgb1), l2 = calcLuminance(rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // Extract theme base colors from .theme-<name> selectors in app.css
  const themeNames = ['light', 'paper', 'dark', 'slate', 'forest'];
  const parsedThemes = themeNames.map(name => {
    const themeMatch = cssContent.match(new RegExp(`\\.theme-${name}\\s*\\{([^}]+)\\}`));
    assert.ok(themeMatch, `.theme-${name} definition must exist in app.css`);
    const baseHexMatch = themeMatch[1].match(/--base\s*:\s*(#[0-9a-fA-F]{3,6})/);
    assert.ok(baseHexMatch, `--base color must be defined in .theme-${name}`);
    return { name, baseHex: baseHexMatch[1] };
  });

  // Extract polarity settings (--ink, --raise, --due) from app.css
  const extractPolarity = (pattern) => {
    const match = cssContent.match(pattern);
    assert.ok(match, 'Polarity theme section missing in app.css');
    const block = match[1];
    const inkHex = block.match(/--ink\s*:\s*(#[0-9a-fA-F]{3,6})/)[1];
    const raisePct = parseInt(block.match(/--raise\s*:\s*(\d+)%/)[1], 10);
    const dueHex = block.match(/--due\s*:\s*(#[0-9a-fA-F]{3,6})/)[1];
    return { inkHex, raisePct, dueHex };
  };

  const lightPolarity = extractPolarity(/\.theme-light\s*,\s*\.theme-paper\s*\{([\s\S]*?)\}/);
  const darkPolarity = extractPolarity(/\.theme-dark\s*,\s*\.theme-slate\s*,\s*\.theme-forest\s*\{([\s\S]*?)\}/);

  const whiteRGB = [255, 255, 255];

  parsedThemes.forEach(t => {
    const isDarkGroup = ['dark', 'slate', 'forest'].includes(t.name);
    const polarity = isDarkGroup ? darkPolarity : lightPolarity;

    const base = parseHexColor(t.baseHex);
    const ink = parseHexColor(polarity.inkHex);
    const due = parseHexColor(polarity.dueHex);
    const raise = polarity.raisePct;

    const cLowest = mixColors(whiteRGB, base, raise);
    const outline = mixColors(ink, base, outlinePct);
    const borderVsCard = getContrastRatio(outline, cLowest);
    const dueVsCard = getContrastRatio(due, cLowest);

    assert.ok(borderVsCard >= 3.0, `[Theme ${t.name}] switch border contrast ${borderVsCard.toFixed(2)}:1 must be >= 3.0`);
    assert.ok(dueVsCard >= 3.0, `[Theme ${t.name}] switch ON state contrast ${dueVsCard.toFixed(2)}:1 must be >= 3.0`);
  });

  // --- store.js database normalization regression tests
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear()
  };

  const store = await import('./store.js');

  const seeded = store.seed();
  assert.strictEqual(seeded.decks[0].name, '英単語（サンプル）', 'seed deck name must be 英単語（サンプル）');

  // setDB with log: null must allow todayLog() to return [] without exception
  store.setDB({ log: null });
  assert.doesNotThrow(() => {
    assert.deepStrictEqual(store.todayLog(), [], 'todayLog() must return [] when log is null');
  });

  // Invalid decks, cards, log values replaced with empty arrays
  store.setDB({ decks: null, cards: 'invalid', log: 123 });
  assert.deepStrictEqual(store.db.decks, [], 'invalid decks must be replaced with []');
  assert.deepStrictEqual(store.db.cards, [], 'invalid cards must be replaced with []');
  assert.deepStrictEqual(store.db.log, [], 'invalid log must be replaced with []');

  // settings: null or settings: [] replaced with default settings
  store.setDB({ settings: null });
  assert.deepStrictEqual(store.db.settings, store.blank().settings, 'settings: null replaced with defaults');
  store.setDB({ settings: [] });
  assert.deepStrictEqual(store.db.settings, store.blank().settings, 'settings: [] replaced with defaults');

  // Invalid elements within decks, cards, and log arrays are filtered out
  const validDeck = { id: 'd1', name: 'Test' };
  const validCard = { id: 'c1', deck: 'd1', reps: 0 };
  const validLog = { t: Date.now(), g: 3, n: 1, c: 'c1' };

  store.setDB({
    decks: [null, undefined, 123, 'str', true, [1, 2], validDeck],
    cards: [null, undefined, 456, 'card', false, [3, 4], validCard],
    log: [null, undefined, 789, 'log', true, [5, 6], validLog]
  });
  assert.deepStrictEqual(store.db.decks, [validDeck], 'invalid deck elements filtered out');
  assert.deepStrictEqual(store.db.cards, [validCard], 'invalid card elements filtered out');
  assert.deepStrictEqual(store.db.log, [validLog], 'invalid log elements filtered out');

  // Verify functions like todayLog() and counts() don't throw when arrays contained null elements prior to setDB
  store.setDB({ decks: [null], cards: [null], log: [null] });
  assert.doesNotThrow(() => store.todayLog());
  assert.doesNotThrow(() => store.counts('d1'));

  // load() normalizes corrupted persisted data and saves normalized DB to localStorage
  storage.set(store.KEY, JSON.stringify({ decks: [null, 'corrupted'], cards: null, log: [123], settings: null }));
  store.load();
  assert.deepStrictEqual(store.db.decks, []);
  assert.deepStrictEqual(store.db.cards, []);
  assert.deepStrictEqual(store.db.log, []);
  assert.deepStrictEqual(store.db.settings, store.blank().settings);
  assert.deepStrictEqual(JSON.parse(storage.get(store.KEY)), store.db, 'load() must persist normalized DB to localStorage');

  // Verify normalizeDB with malformed fields (non-array collections, invalid lastBackup, non-record settings)
  const malformedFields = store.normalizeDB({
    decks: {},
    cards: 'cards',
    log: null,
    lastBackup: '12345',
    settings: []
  });
  const expectedBlank = store.blank();
  assert.deepStrictEqual(malformedFields.decks, expectedBlank.decks, 'invalid decks fallback to []');
  assert.deepStrictEqual(malformedFields.cards, expectedBlank.cards, 'invalid cards fallback to []');
  assert.deepStrictEqual(malformedFields.log, expectedBlank.log, 'invalid log fallback to []');
  assert.deepStrictEqual(malformedFields.settings, expectedBlank.settings, 'invalid settings fallback to blank settings');
  assert.strictEqual(typeof malformedFields.lastBackup, 'number', 'invalid lastBackup falls back to default timestamp');

  console.log('all checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
