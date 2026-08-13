/* Core Recall — local-first flashcards, FSRS-5 scheduler. No build step, no deps. */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
/* DAY, clamp, schedule, fmtInterval, parseCSV come from core.js */
const uid =() => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* scheduler + parsing live in core.js (pure, unit-tested) */
const plan = (card, g, now) => schedule(card, g, now, db.settings.ret / 100);

/* ---------------- store ---------------- */
const KEY = 'core-recall-v1';
let db, view = 'home', openDeck = null;

function blank() {
  // lastBackup starts "now" so a fresh install isn't nagged on day one
  return { decks: [], cards: [], log: [], lastBackup: Date.now(),
    settings: { new: 20, max: 200, ret: 90, theme: 'light' } };
}
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { db = seed(); }
  db.settings = Object.assign(blank().settings, db.settings);
  save();  // persist the first-run seed so card ids stay stable across reloads
}
// ponytail: whole DB in one localStorage blob. Move to IndexedDB past ~10k cards.
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

function newCard(deck, front, back) {
  return { id: uid(), deck, front, back, due: Date.now(), s: 0, d: 0, reps: 0, lapses: 0, last: 0, state: 0 };
}
function seed() {
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

/* ---------------- derived ---------------- */
const deckOf = id => db.decks.find(d => d.id === id);
const cardsOf = id => db.cards.filter(c => c.deck === id);
const todayLog = () => { const k = dayKey(Date.now()); return db.log.filter(l => dayKey(l.t) === k); };

function counts(deckId) {
  const now = Date.now(), c = { n: 0, l: 0, d: 0 };
  for (const card of cardsOf(deckId)) {
    if (!card.reps) c.n++;
    else if (card.due <= now) (card.state === 2 ? c.l++ : c.d++);
  }
  return c;
}

/** Session queue for a deck, respecting the daily caps. */
function buildQueue(deckId) {
  const now = Date.now(), t = todayLog();
  const newLeft = Math.max(0, db.settings.new - t.filter(l => l.n).length);
  const revLeft = Math.max(0, db.settings.max - t.filter(l => !l.n).length);
  const all = cardsOf(deckId);
  const due = all.filter(c => c.reps && c.due <= now).sort((a, b) => a.due - b.due).slice(0, revLeft);
  const fresh = all.filter(c => !c.reps).slice(0, newLeft);
  // interleave new cards evenly through the review queue
  const q = due.slice();
  if (fresh.length) {
    const step = Math.max(1, Math.floor((q.length + fresh.length) / fresh.length));
    fresh.forEach((c, i) => q.splice(Math.min(q.length, i * step + i), 0, c));
  }
  if (deckOf(deckId)?.shuffle) for (let i = q.length - 1; i > 0; i--) {   // Fisher-Yates
    const j = Math.floor(Math.random() * (i + 1));
    [q[i], q[j]] = [q[j], q[i]];
  }
  return q;
}

/* ---------------- ui helpers ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 2600);
}
const icon = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24"><use href="#i-${n}"/></svg>`;

let sheetSave = null;
function openSheet(title, bodyHTML, onSave, okLabel = '保存') {
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = bodyHTML;
  $('#sheet-ok').textContent = okLabel;
  $('#sheet-ok').hidden = !onSave;
  sheetSave = onSave;
  $('#scrim').hidden = $('#sheet').hidden = false;
  setTimeout(() => $('#sheet-body input, #sheet-body textarea')?.focus(), 350);
}
function closeSheet() { $('#scrim').hidden = $('#sheet').hidden = true; sheetSave = null; }

function speak(text) {
  if (!window.speechSynthesis) return toast('この端末は読み上げに対応していません');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[぀-ヿ一-龯]/.test(text) ? 'ja-JP' : 'en-US';
  speechSynthesis.speak(u);
}

/* ---------------- home ---------------- */
function renderHome() {
  const banner = $('#backup-banner');
  const stale = db.cards.length > 0 && Date.now() - db.lastBackup > 7 * DAY;
  banner.innerHTML = stale
    ? `<div class="banner">${icon('warn')}<p>データのバックアップ（JSON出力）を行ってください</p><button id="banner-export">出力</button></div>`
    : '';

  const list = $('#deck-list');
  if (!db.decks.length) {
    list.innerHTML = `<li class="empty"><b>デッキがありません</b>右上の＋から最初のデッキを作りましょう。</li>`;
  } else {
    list.innerHTML = db.decks.map(d => {
      const c = counts(d.id), total = cardsOf(d.id).length;
      const clear = c.n + c.l + c.d === 0;
      return `<li><button class="deck-row" data-deck="${d.id}">
        ${icon('folder')}
        <span class="name">${esc(d.name)}</span>
        ${clear && total ? `${icon('check', 'ic done')}` : `<span class="counts">
          <span class="${c.n ? 'n' : 'zero'}">${c.n}</span>
          <span class="${c.l ? 'l' : 'zero'}">${c.l}</span>
          <span class="${c.d ? 'd' : 'zero'}">${c.d}</span></span>`}
        ${icon('chevron', 'ic chev')}
      </button></li>`;
    }).join('');
  }

  // 12 weeks of activity, columns = weeks, rows = weekday
  const per = {};
  db.log.forEach(l => { const k = dayKey(l.t); per[k] = (per[k] || 0) + 1; });
  const max = Math.max(1, ...Object.values(per));
  const today = startOfDay(Date.now());
  const cells = [];
  const back = 83 + ((new Date(today).getDay() + 6) % 7); // pad so the last column ends this week
  for (let i = back; i >= 0; i--) {
    const t = today - i * DAY, n = per[dayKey(t)] || 0;
    const lvl = n === 0 ? 0 : Math.min(4, Math.ceil(n / max * 4));
    cells.push(`<i data-l="${lvl}" title="${dayKey(t)}: ${n}"></i>`);
  }
  $('#heatmap').innerHTML = cells.join('');
}

/* ---------------- stats ---------------- */
function renderStats() {
  const t = todayLog();
  $('#s-today').textContent = t.length;
  $('#s-total').textContent = db.log.length.toLocaleString();

  const days = new Set(db.log.map(l => dayKey(l.t)));
  let streak = 0, cur = startOfDay(Date.now());
  if (!days.has(dayKey(cur))) cur -= DAY;              // today not studied yet: streak still alive
  while (days.has(dayKey(cur))) { streak++; cur -= DAY; }
  $('#s-streak').textContent = streak;

  const wd = ['日', '月', '火', '水', '木', '金', '土'];
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = startOfDay(Date.now()) - i * DAY;
    last7.push({ label: wd[new Date(d).getDay()], n: db.log.filter(l => dayKey(l.t) === dayKey(d)).length });
  }
  $('#bars').innerHTML = barsHTML(last7);

  const g = [1, 2, 3, 4].map(n => db.log.filter(l => l.g === n).length);
  const sum = g.reduce((a, b) => a + b, 0) || 1;
  const names = ['もう一度', '難しい', '普通', '簡単'];
  $('#retention').innerHTML = g.map((n, i) =>
    `<li><i style="background:var(--g${i + 1})"></i><span>${names[i]}</span><b style="color:var(--g${i + 1})">${Math.round(n / sum * 100)}%</b></li>`).join('');
  $('#stackbar').innerHTML = g.map((n, i) => `<i style="width:${n / sum * 100}%;background:var(--g${i + 1})"></i>`).join('');

  const fc = [];
  for (let i = 0; i < 7; i++) {
    const from = startOfDay(Date.now()) + i * DAY, to = from + DAY;
    fc.push({ label: i === 0 ? '今日' : wd[new Date(from).getDay()], n: db.cards.filter(c => c.reps && c.due < to && c.due >= (i ? from : 0)).length });
  }
  $('#forecast').innerHTML = barsHTML(fc);
}
function barsHTML(rows) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.map(r => `<div class="b"><b>${r.n || ''}</b><i style="height:${r.n / max * 100}%"></i><span>${r.label}</span></div>`).join('');
}

/* ---------------- settings ---------------- */
function renderSettings() {
  $('#set-new').value = db.settings.new;
  $('#set-max').value = db.settings.max;
  $('#set-ret').value = db.settings.ret;
  $$('#swatches .swatch').forEach(b => b.setAttribute('aria-pressed', b.dataset.theme === db.settings.theme));
}
function applyTheme() {
  // an imported backup (or an older one, naming the retired "system") can carry a
  // theme this build doesn't have — don't leave --surface undefined
  if (!$(`[data-theme="${db.settings.theme}"]`)) { db.settings.theme = 'light'; save(); }
  document.documentElement.className = `theme-${db.settings.theme}`;
  // keep the iOS status bar / PWA chrome in step with the surface colour
  $('#meta-theme').content = getComputedStyle(document.body).backgroundColor;
}

/* ---------------- deck detail ---------------- */
function renderDeck() {
  const d = deckOf(openDeck);
  if (!d) return closeDeck();
  const c = counts(d.id), cards = cardsOf(d.id);
  $('#dv-title').textContent = d.name;
  $('#dv-counts').innerHTML =
    `<div class="n"><b>${c.n}</b><span>新規</span></div>
     <div class="l"><b>${c.l}</b><span>学習中</span></div>
     <div class="d"><b>${c.d}</b><span>復習</span></div>`;
  $('#opt-reverse').checked = !!d.reverse;
  $('#opt-shuffle').checked = !!d.shuffle;
  $('#btn-study').disabled = buildQueue(d.id).length === 0;
  $('#btn-study').textContent = $('#btn-study').disabled
    ? (cards.length ? '今日の分は終了しました' : 'カードがありません') : '学習を開始';
  const label = $('#dv-cards-label');
  label.hidden = !cards.length;
  label.textContent = `カード（${cards.length}枚）`;
  $('#dv-cards').innerHTML = cards.map(c => `<li><button class="row card-row" data-card="${c.id}">
      <span class="q">${esc(c.front)}</span><span class="a">${esc(c.back)}</span>
      <span class="meta">${c.reps ? `次回 ${new Date(c.due).toLocaleDateString('ja-JP')} · ${c.reps}回 · 忘却${c.lapses}` : '未学習'}</span>
    </button></li>`).join('');
}
function openDeckView(id) { openDeck = id; $('#deck-view').hidden = false; renderDeck(); }
function closeDeck() { $('#deck-view').hidden = true; openDeck = null; render(); }

/* ---------------- review ---------------- */
let queue = [], current = null, answered = 0, flipped = false, sessionStart = 0, reviewDeck = null;

/** Which side of the card is the question — the deck's 表裏入れ替え option decides. */
const faces = card => deckOf(reviewDeck)?.reverse
  ? { q: card.back, a: card.front }
  : { q: card.front, a: card.back };

function paintFaces() {
  const { q, a } = faces(current);
  $('#rv-front').textContent = q;
  $('#rv-front2').textContent = q;
  $('#rv-back').textContent = a;
}

function startReview(deckId) {
  reviewDeck = deckId;
  queue = buildQueue(deckId);
  if (!queue.length) return toast('今日の学習は完了しています');
  answered = 0; sessionStart = Date.now();
  $('#rv-deck').textContent = deckOf(deckId).name;
  $('#rv-done').hidden = true;
  $('#review').hidden = false;
  nextCard();
}
function endReview() {
  $('#review').hidden = true;
  speechSynthesis?.cancel();
  if (openDeck) renderDeck();
  render();
}
function nextCard() {
  current = queue[0];
  if (!current) return finishReview();
  flipped = false;
  // Snap back to the front with no animation: rotating back would show the *next*
  // card's answer for the length of the flip. The new card fades in instead.
  const f = $('#rv-flip');
  f.classList.add('no-anim');
  f.classList.remove('flipped', 'enter');
  paintFaces();
  void f.offsetWidth;              // commit the un-flip and rewind the enter animation
  f.classList.remove('no-anim');
  f.classList.add('enter');
  $('#rating').classList.add('hidden');
  const total = answered + queue.length;
  $('#rv-count').textContent = `${answered + 1} / ${total}`;
  $('#rv-bar').style.width = (answered / total * 100) + '%';
  const now = Date.now();
  [1, 2, 3, 4].forEach(g => $('#iv' + g).textContent = fmtInterval(plan(current, g, now).days));
}
function flip() {
  if (!current || flipped) return;
  flipped = true;
  $('#rv-flip').classList.remove('enter');   // don't let the entrance fight the flip
  $('#rv-flip').classList.add('flipped');
  $('#rating').classList.remove('hidden');
}
function grade(g) {
  if (!current || !flipped) return;
  const now = Date.now();
  const r = plan(current, g, now);
  const wasNew = !current.reps;
  Object.assign(current, { s: r.s, d: r.d, due: r.due, state: r.state, last: now, reps: current.reps + 1 });
  if (g === 1) current.lapses++;
  db.log.push({ t: now, g, n: wasNew ? 1 : 0, c: current.id });
  save();

  queue.shift();
  if (g === 1) queue.splice(Math.min(queue.length, 3), 0, current); // show again later this session
  else answered++;
  nextCard();
}
function finishReview() {
  const mins = Math.max(1, Math.round((Date.now() - sessionStart) / 60000));
  $('#rv-done-sub').textContent = `${answered}枚を復習しました（約${mins}分）`;
  $('#rv-done').hidden = false;
  $('#rating').classList.add('hidden');
}

/* ---------------- card / deck editing ---------------- */
function cardSheet(card) {
  const isNew = !card;
  openSheet(isNew ? 'カードを追加' : 'カードを編集', `
    <div class="field"><label>表（質問）</label><textarea id="f-front">${esc(card?.front || '')}</textarea></div>
    <div class="field"><label>裏（答え）</label><textarea id="f-back">${esc(card?.back || '')}</textarea></div>
    ${isNew ? '<p class="help">保存後もシートは開いたままなので、続けて追加できます。</p>'
      : `<button class="text-btn danger" id="f-del">${'このカードを削除'}</button>`}`, () => {
    const front = $('#f-front').value.trim(), back = $('#f-back').value.trim();
    if (!front || !back) return toast('表と裏の両方を入力してください');
    if (isNew) {
      db.cards.push(newCard(openDeck, front, back));
      save(); renderDeck();
      $('#f-front').value = $('#f-back').value = ''; $('#f-front').focus();
      toast('追加しました');
      return false;                                  // keep the sheet open for rapid entry
    }
    card.front = front; card.back = back; save();
    if (current && current.id === card.id) paintFaces();
    renderDeck();
  });
  $('#f-del')?.addEventListener('click', () => {
    if (!confirm('このカードを削除しますか？')) return;
    db.cards = db.cards.filter(c => c.id !== card.id);
    queue = queue.filter(c => c.id !== card.id);
    save(); closeSheet(); renderDeck();
    if (current?.id === card.id) nextCard();
  });
}
function deckSheet() {
  openSheet('新しいデッキ', `<div class="field"><label>デッキ名</label><input id="f-name" placeholder="例：英単語"></div>`, () => {
    const name = $('#f-name').value.trim();
    if (!name) return toast('名前を入力してください');
    const d = { id: uid(), name, created: Date.now() };
    db.decks.push(d); save(); render();
    openDeckView(d.id);
  }, '作成');
}

/* ---------------- import / export ---------------- */
function exportJSON() {
  db.lastBackup = Date.now(); save();
  const blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `core-recall-${dayKey(Date.now())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  render();
  toast('バックアップを出力しました');
}

let pendingImport = null;
function pickFile(kind) { pendingImport = kind; $('#file-input').value = ''; $('#file-input').click(); }

async function handleFile(file) {
  const text = await file.text();
  if (pendingImport === 'json') {
    let data;
    try { data = JSON.parse(text); } catch { return toast('JSON を読み込めませんでした'); }
    if (!Array.isArray(data.decks) || !Array.isArray(data.cards)) return toast('Core Recall のバックアップではありません');
    if (!confirm(`現在のデータを置き換えます。\nデッキ ${data.decks.length}件 / カード ${data.cards.length}枚を復元しますか？`)) return;
    db = Object.assign(blank(), data); save(); applyTheme(); render(); renderSettings();
    return toast('復元しました');
  }
  const rows = parseCSV(text);
  if (!rows.length) return toast('カードが見つかりませんでした');
  const name = file.name.replace(/\.[^.]+$/, '') || 'インポート';
  const deck = { id: uid(), name, created: Date.now() };
  db.decks.push(deck);
  rows.forEach(r => db.cards.push(newCard(deck.id, r[0].trim(), r[1].trim())));
  save(); render();
  toast(`「${name}」に ${rows.length}枚を取り込みました`);
}

function wipe() {
  if (!confirm('すべてのデッキ・カード・学習履歴を消去します。元に戻せません。続けますか？')) return;
  if (!confirm('本当によろしいですか？ 先に JSON バックアップを取ることを強くおすすめします。')) return;
  db = blank(); save(); render(); renderSettings();
  toast('すべてのデータを消去しました');
}

/* ---------------- routing ---------------- */
function render() {
  $$('.screen[data-tab]').forEach(s => s.hidden = s.dataset.tab !== view);
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.goto === view));
  ({ home: renderHome, stats: renderStats, settings: renderSettings })[view]();
}
function go(tab) {
  $('#deck-view').hidden = true; openDeck = null;  // tab bar always wins over a pushed screen
  view = tab; render();
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const t = e.target;
  const tab = t.closest('[data-goto]'); if (tab) return go(tab.dataset.goto);
  const deck = t.closest('[data-deck]'); if (deck) return openDeckView(deck.dataset.deck);
  const card = t.closest('[data-card]'); if (card) return cardSheet(db.cards.find(c => c.id === card.dataset.card));
  if (t.closest('[data-close="deck-view"]')) return closeDeck();
  if (t.closest('[data-close-review]')) return endReview();
  if (t.closest('[data-sheet-cancel]') || t.id === 'scrim') return closeSheet();
  if (t.closest('[data-edit]')) return cardSheet(current);
  const sp = t.closest('[data-speak]'); if (sp) return speak(faces(current)[sp.dataset.speak === 'front' ? 'q' : 'a']);
  const g = t.closest('[data-g]'); if (g) return grade(+g.dataset.g);
  const th = t.closest('[data-theme]');
  if (th) { db.settings.theme = th.dataset.theme; save(); applyTheme(); return renderSettings(); }
  if (t.closest('#banner-export') || t.closest('#btn-export')) return exportJSON();
});

$('#sheet-ok').onclick = () => { if (sheetSave && sheetSave() !== false) closeSheet(); };
$('#btn-add-deck').onclick = deckSheet;
$('#btn-add-card').onclick = () => cardSheet(null);
$('#btn-study').onclick = () => startReview(openDeck);
$('#btn-end').onclick = endReview;
$('#btn-del-deck').onclick = () => {
  const d = deckOf(openDeck);
  if (!confirm(`「${d.name}」と ${cardsOf(d.id).length}枚のカードを削除しますか？`)) return;
  db.cards = db.cards.filter(c => c.deck !== d.id);
  db.decks = db.decks.filter(x => x.id !== d.id);
  save(); closeDeck();
};
$('#rv-flip').onclick = e => { if (!e.target.closest('button')) flip(); };  // tools stay clickable
['reverse', 'shuffle'].forEach(k => {
  $('#opt-' + k).onchange = e => { deckOf(openDeck)[k] = e.target.checked; save(); renderDeck(); };
});
$('#btn-import-json').onclick = () => pickFile('json');
$('#btn-import-csv').onclick = () => pickFile('csv');
$('#btn-wipe').onclick = wipe;
$('#file-input').onchange = e => e.target.files[0] && handleFile(e.target.files[0]);

['new', 'max', 'ret'].forEach(k => {
  $('#set-' + k).onchange = e => {
    const lim = k === 'ret' ? [70, 97] : [0, 9999];
    db.settings[k] = clamp(parseInt(e.target.value) || 0, lim[0], lim[1]);
    e.target.value = db.settings[k]; save();
  };
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (!$('#review').hidden) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipped ? grade(3) : flip(); }
    if ('1234'.includes(e.key)) grade(+e.key);
    if (e.key === 'Escape') endReview();
  } else if (!$('#sheet').hidden && e.key === 'Escape') closeSheet();
  else if (!$('#deck-view').hidden && e.key === 'Escape') closeDeck();
});

/* ---------------- boot ---------------- */
load(); applyTheme(); render(); renderSettings();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
