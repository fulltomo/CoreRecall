/* node test.cjs — self-check for the scheduler and the CSV parser. */
const assert = require('assert');
const { DAY, fsrs, schedule, fmtInterval, parseCSV, retrievability } = require('./core.js');

const NOW = Date.UTC(2026, 0, 1);
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
assert.strictEqual(fmtInterval(1 / 1440), '<1m');
assert.strictEqual(fmtInterval(4), '4d');
assert.strictEqual(fmtInterval(400), '1.1y');

// --- CSV / TSV parsing
assert.deepStrictEqual(parseCSV('a,b\n"c,1","d""x"\n\n# note,skip\n,empty').map(r => r.slice(0, 2)),
  [['a', 'b'], ['c,1', 'd"x']]);
assert.deepStrictEqual(parseCSV('front\tback\r\nq\ta').map(r => r.slice(0, 2)), [['q', 'a']],
  'a recognised header row is dropped');
assert.deepStrictEqual(parseCSV('front\tback').map(r => r.slice(0, 2)), [['front', 'back']],
  'but not when it is the only row — that is real data');

console.log('all checks passed');
