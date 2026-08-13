import { schedule } from './core.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export const KEY = 'core-recall-v1';
export let db = null;

const isRecord = v => Boolean(v && typeof v === 'object' && !Array.isArray(v));

export function normalizeDB(value) {
  if (!isRecord(value)) {
    return blank();
  }
  const b = blank();
  const decks = Array.isArray(value.decks) ? value.decks.filter(isRecord) : b.decks;
  const cards = Array.isArray(value.cards) ? value.cards.filter(isRecord) : b.cards;
  const log = Array.isArray(value.log) ? value.log.filter(isRecord) : b.log;
  const settings = (!value.settings || !isRecord(value.settings))
    ? b.settings
    : Object.assign(b.settings, value.settings);
  const lastBackup = typeof value.lastBackup === 'number' ? value.lastBackup : b.lastBackup;
  return { ...value, decks, cards, log, settings, lastBackup };
}

export function setDB(newDB) {
  db = normalizeDB(newDB);
}

export function blank() {
  return { decks: [], cards: [], log: [], lastBackup: Date.now(),
    settings: { new: 20, max: 200, ret: 90, theme: 'light' } };
}

export function load() {
  try { setDB(JSON.parse(localStorage.getItem(KEY)) || seed()); } catch { setDB(seed()); }
  save();
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function newCard(deck, front, back) {
  return { id: uid(), deck, front, back, due: Date.now(), s: 0, d: 0, reps: 0, lapses: 0, last: 0, state: 0 };
}

export function seed() {
  const d = blank();
  const deck = { id: uid(), name: '英単語', created: Date.now() };
  d.decks.push(deck);
  [['ubiquitous', '遍在する、どこにでもある'], ['ephemeral', 'つかの間の、短命な'],
   ['meticulous', '几帳面な、細部にこだわる'], ['candid', '率直な、ありのままの'],
   ['prudent', '慎重な、思慮深い'], ['resilient', '回復力のある、しなやかな'],
   ['ambiguous', '曖昧な、多義的な'], ['tenacious', '粘り強い、執拗な']]
    .forEach(([f, b]) => d.cards.push(newCard(deck.id, f, b)));
  return d;
}

export const deckOf = id => db.decks.find(d => d.id === id);
export const cardsOf = id => db.cards.filter(c => c.deck === id);
export const todayLog = () => { const k = dayKey(Date.now()); return db.log.filter(l => dayKey(l.t) === k); };

export function counts(deckId) {
  const now = Date.now(), c = { n: 0, l: 0, d: 0 };
  for (const card of cardsOf(deckId)) {
    if (!card.reps) c.n++;
    else if (card.due <= now) (card.state === 2 ? c.l++ : c.d++);
  }
  return c;
}

export function buildQueue(deckId) {
  const now = Date.now(), t = todayLog();
  const newLeft = Math.max(0, db.settings.new - t.filter(l => l.n).length);
  const revLeft = Math.max(0, db.settings.max - t.filter(l => !l.n).length);
  const all = cardsOf(deckId);
  const due = all.filter(c => c.reps && c.due <= now).sort((a, b) => a.due - b.due).slice(0, revLeft);
  const fresh = all.filter(c => !c.reps).slice(0, newLeft);
  const q = due.slice();
  if (fresh.length) {
    const step = Math.max(1, Math.floor((q.length + fresh.length) / fresh.length));
    fresh.forEach((c, i) => q.splice(Math.min(q.length, i * step + i), 0, c));
  }
  if (deckOf(deckId)?.shuffle) for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}

export function plan(card, g, now) {
  return schedule(card, g, now, db.settings.ret / 100);
}
