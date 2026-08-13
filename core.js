/* Pure logic: FSRS-5 scheduler + CSV parsing. No DOM — runnable in node for the self-check. */
'use strict';

const DAY = 86400000;

/* FSRS-5 default weights (open-spaced-repetition defaults). */
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const retrievability = (elapsedDays, s) => Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
const intervalDays = (s, ret) => s / FACTOR * (Math.pow(ret, 1 / DECAY) - 1);
const initD = g => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
const nextD = (d, g) => clamp(
  W[7] * initD(4) + (1 - W[7]) * (d + -W[6] * (g - 3) * (10 - d) / 9), // damping + mean reversion
  1, 10);

/** New memory state {s,d} after grading `card` (unreviewed when reps === 0). */
function fsrs(card, g, now) {
  if (!card.reps) return { s: clamp(W[g - 1], 0.01, 36500), d: initD(g) };
  const elapsed = Math.max(0, (now - card.last) / DAY);
  const r = retrievability(elapsed, card.s);
  const d = nextD(card.d, g);
  let s;
  if (elapsed < 1) {                       // same-day repeat
    s = card.s * Math.exp(W[17] * (g - 3 + W[18]));
  } else if (g === 1) {                    // forgot
    s = Math.min(card.s, W[11] * Math.pow(d, -W[12]) *
      (Math.pow(card.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
  } else {                                 // recalled
    s = card.s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(card.s, -W[9]) *
      (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  }
  return { s: clamp(s, 0.01, 36500), d };
}

/** What the card becomes after grading. Used for both the button previews and the commit. */
function schedule(card, g, now, retention = 0.9) {
  const { s, d } = fsrs(card, g, now);
  // ponytail: one 1-minute relearning step. Add graduated steps only if recall proves too coarse.
  const days = g === 1 ? 1 / 1440 : clamp(Math.round(intervalDays(s, retention)), 1, 36500);
  return { s, d, days, due: now + days * DAY, state: g === 1 ? 2 : 1 };
}

function fmtInterval(days) {
  if (days < 1 / 24) return '<1m';
  if (days < 1) return Math.round(days * 24) + 'h';
  if (days < 30) return Math.round(days) + 'd';
  if (days < 365) return (days / 30.4).toFixed(days < 90 ? 1 : 0) + 'mo';
  return (days / 365).toFixed(1) + 'y';
}

/** Minimal RFC4180 parser; auto-detects TSV (Anki's export format). */
function parseCSV(text) {
  const delim = /\t/.test(text.split('\n')[0]) ? '\t' : ',';
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const out = rows.filter(r => r.length >= 2 && r[0].trim() && r[1].trim() && !r[0].startsWith('#'));
  return out.length > 1 && isHeader(out[0]) ? out.slice(1) : out;
}
const HEADERS = ['front', 'back', 'question', 'answer', 'term', 'definition', 'word', 'meaning', '表', '裏', '質問', '答え', '単語', '意味'];
const isHeader = row => row.slice(0, 2).every(c => HEADERS.includes(c.trim().toLowerCase()));

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { DAY, W, clamp, fsrs, schedule, fmtInterval, parseCSV, intervalDays, retrievability });
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DAY, W, clamp, fsrs, schedule, fmtInterval, parseCSV, intervalDays, retrievability };
}
export { DAY, W, clamp, fsrs, schedule, fmtInterval, parseCSV, intervalDays, retrievability };



