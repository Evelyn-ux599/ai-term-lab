import { terms, termById } from './terms.js';
import { STORAGE_KEY, LEARN_MS, SPEAK_MS, emptyState, createSession, settle, pauseSession, resumeSession, recordCompletion, hydrate, randomIndex, formatTime } from './core.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const validIds = new Set(termById.keys());
const sound = new Sound();
let storageAvailable = true;
let state;
try { state = hydrate(localStorage.getItem(STORAGE_KEY), validIds); }
catch { state = emptyState(); storageAvailable = false; }
let spinning = false;
let animation = 0;
let revealAnswer = false;
let resultKey = '';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function announce(message) { $('announcement').textContent = message; }

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('save-status').textContent = storageAvailable
    ? '◉ 进度自动保存在当前浏览器'
    : '当前浏览器无法保存，刷新或关闭会丢失本次进度';
}

function reelRow(term) {
  const row = document.createElement('span'); row.className = 'reel-row';
  const name = document.createElement('strong'); name.textContent = term.chinese;
  const english = document.createElement('small'); english.textContent = term.english;
  row.append(name, english); return row;
}

function staticReel() {
  const current = termById.get(state.termId);
  let rows;
  if (current) {
    const index = terms.indexOf(current);
    rows = [terms[(index + terms.length - 1) % terms.length], current, terms[(index + 1) % terms.length]];
  } else {
    rows = [{ chinese: '保持好奇', english: 'STAY CURIOUS' }, { chinese: '下一个，会是什么？', english: 'ONE CONCEPT AT A TIME' }, { chinese: '慢慢弄懂', english: 'MAKE IT YOURS' }];
  }
  $('reel').replaceChildren(...rows.map(reelRow));
  $('reel').style.transform = 'translateY(0px)';
}

function renderResult() {
  const term = termById.get(state.termId);
  const speaking = state.session?.phase === 'speak' && state.session.status !== 'done';
  const key = `${term?.id || ''}:${speaking}:${revealAnswer}:${spinning}`;
  if (key === resultKey) return;
  resultKey = key;
  $('result').hidden = !term || spinning;
  $('empty-result').hidden = Boolean(term) || spinning;
  if (!term) return;
  $('category').textContent = term.category;
  $('term-number').textContent = `NO. ${String(terms.indexOf(term) + 1).padStart(3, '0')} / ${terms.length}`;
  $('result-title').textContent = term.chinese;
  $('result-english').textContent = term.english;
  $('definition').textContent = term.definition;
  $('example').textContent = term.example;
  $('misconception').textContent = term.misconception;
  $('reference').href = term.reference;
  $('answer-content').hidden = speaking && !revealAnswer;
  $('speaking-cover').hidden = !speaking;
  $('peek').textContent = revealAnswer ? '收起答案，继续表达' : '看一下提示答案';
}

function render() {
  const s = state.session;
  const running = s?.status === 'running';
  const paused = s?.status === 'paused';
  const done = s?.status === 'done';
  const speaking = s?.phase === 'speak' && !done;
  const active = running || paused;
  const remaining = s ? (done ? 0 : s.remaining) : LEARN_MS;
  $('timer').textContent = formatTime(remaining);
  $('timer').setAttribute('aria-label', `剩余 ${Math.ceil(remaining / 1000)} 秒`);
  $('phase-learn').classList.toggle('active', !speaking && !done);
  $('phase-speak').classList.toggle('active', speaking || done);
  document.querySelector('.practice-panel').classList.toggle('is-speaking', speaking);
  const duration = s?.phase === 'speak' ? SPEAK_MS : LEARN_MS;
  const progress = done ? 100 : s ? Math.min(100, Math.max(0, (1 - remaining / duration) * 100)) : 0;
  $('progress-fill').style.width = `${progress}%`;
  $('progress').setAttribute('aria-valuenow', String(Math.round(progress)));
  $('timer-status').textContent = done ? '这一轮，完成了。' : paused ? `${speaking ? '汇报' : '学习'}已暂停，准备好再继续` : running ? (speaking ? '现在，把它讲给一个人听' : '收集资料，整理你的理解') : state.termId ? '主题就绪，准备开始' : '先抽一个词，再开始练习';
  $('timer-message').textContent = done ? '复盘一下：哪里讲清楚了？哪里还想再查查？' : paused ? '剩余时间已保存。暂停也是练习的一部分。' : speaking ? '定义、问题、例子、边界。用自己的话就好。' : running ? '10 分钟结束后，自动进入 3 分钟汇报。' : '留一点时间，把知识变成自己的。';
  $('start').hidden = active;
  $('start').disabled = !state.termId || spinning;
  $('start-label').textContent = done ? '用这个词，再练一次' : '开始 10 分钟学习';
  $('timer-controls').hidden = !active;
  $('pause').textContent = paused ? '继续计时' : '暂停计时';
  $('draw').disabled = spinning;
  $('machine').disabled = spinning;
  $('draw-label').textContent = spinning ? '一个概念，正在靠近…' : state.termId ? '再抽一个 AI 术语' : '抽一个 AI 术语';
  $('draw-hint').textContent = active ? '本轮正在练习 · 换词前会提醒你结束本轮' : '每个词机会相同 · 点击滚轮也可以抽选';
  $('guide-title').textContent = speaking ? '不用完美，按这个顺序讲' : '带着这四个问题去学习';
  $('completed-count').textContent = String(state.completed.length);
  if (state.completed.length) {
    const last = state.completed.at(-1);
    $('record-description').textContent = `最近一轮：${termById.get(last.termId).chinese} · ${new Date(last.finishedAt).toLocaleDateString('zh-CN')}`;
  } else $('record-description').textContent = '一点点积累，就会有自己的表达。';
  $('sound').setAttribute('aria-pressed', String(state.sound));
  $('sound').setAttribute('aria-label', state.sound ? '关闭声音' : '开启声音');
  $('sound-label').textContent = state.sound ? '声音开' : '声音关';
  renderResult();
}

function tick({ silent = false } = {}) {
  const previous = state.session;
  state.session = settle(state.session);
  const transitioned = previous && (previous.phase !== state.session.phase || previous.status !== state.session.status);
  if (transitioned) {
    state = recordCompletion(state);
    persist();
    revealAnswer = false;
    const done = state.session.status === 'done';
    if (!silent) sound.chime(done);
    announce(done ? '本轮计时结束，完成记录已保存。' : '学习时间结束，开始三分钟汇报。');
  }
  render();
}

function draw() {
  if (spinning) return;
  tick();
  if (state.session && state.session.status !== 'done' && !window.confirm('换词会结束当前这轮练习，且不会计入完成次数。确定换一个词吗？')) return;
  sound.unlock();
  const before = termById.get(state.termId) || terms[0];
  const target = terms[randomIndex(terms.length)];
  state.termId = target.id; state.session = null; revealAnswer = false;
  persist();
  spinning = true; $('machine').classList.add('spinning');
  $('machine').setAttribute('aria-busy', 'true');
  render();
  const rows = [terms[randomIndex(terms.length)], before];
  const steps = reducedMotion.matches ? 1 : 30;
  for (let i = 1; i < steps; i++) rows.push(terms[randomIndex(terms.length)]);
  rows.push(target, terms[randomIndex(terms.length)]);
  $('reel').replaceChildren(...rows.map(reelRow));
  const duration = reducedMotion.matches ? 160 : 2800;
  let start = null;
  let lastCell = 1;
  function frame(now) {
    start ??= now;
    const p = Math.min(1, (now - start) / duration);
    // A brief acceleration followed by a longer mechanical deceleration.
    const eased = p < 0.15 ? (p * p / 0.15) : 1 - Math.pow((1 - p) / 0.85, 2) * 0.85;
    const position = 1 + steps * eased;
    $('reel').style.transform = `translateY(${86 - position * 86}px)`;
    const cell = Math.floor(position + 0.5);
    if (cell !== lastCell) { sound.tick(p === 1); lastCell = cell; }
    if (p < 1) animation = requestAnimationFrame(frame);
    else {
      spinning = false; animation = 0;
      $('machine').classList.remove('spinning'); $('machine').removeAttribute('aria-busy');
      staticReel(); render();
      announce(`抽到${target.chinese}。${target.definition}。可以开始十分钟学习。`);
    }
  }
  animation = requestAnimationFrame(frame);
}

$('draw').addEventListener('click', draw);
$('machine').addEventListener('click', draw);
$('start').addEventListener('click', () => {
  if (!state.termId || spinning) return;
  sound.unlock();
  state.session = createSession(state.termId); revealAnswer = false;
  persist(); render(); announce('十分钟学习计时开始。');
  $('pause').focus({ preventScroll: true });
});
$('pause').addEventListener('click', () => {
  sound.unlock();
  state.session = state.session?.status === 'paused' ? resumeSession(state.session) : pauseSession(state.session);
  state = recordCompletion(state); persist(); render();
  announce(state.session?.status === 'paused' ? '已暂停，剩余时间已保存。' : state.session?.status === 'done' ? '本轮计时完成。' : '继续计时。');
});
$('restart').addEventListener('click', () => {
  if (!window.confirm('重新从 10 分钟学习开始？本轮尚未完成的进度将被替换。')) return;
  sound.unlock(); state.session = createSession(state.termId); revealAnswer = false;
  persist(); render(); announce('已重新开始十分钟学习。');
});
$('sound').addEventListener('click', () => {
  state.sound = !state.sound; sound.setEnabled(state.sound); persist(); render();
});
$('peek').addEventListener('click', () => { revealAnswer = !revealAnswer; renderResult(); });
$('about').addEventListener('click', () => $('about-dialog').showModal());
$('close-about').addEventListener('click', () => $('about-dialog').close());
$('about-dialog').addEventListener('click', event => {
  if (event.target === $('about-dialog')) {
    const rect = event.target.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
  }
});
document.addEventListener('visibilitychange', () => {
  // Do not replay missed sounds after a tab has been hidden.
  if (!document.hidden) tick({ silent: true });
});
window.addEventListener('pagehide', persist);
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  state = hydrate(event.newValue, validIds);
  if (animation) cancelAnimationFrame(animation);
  animation = 0; spinning = false; revealAnswer = false;
  $('machine').classList.remove('spinning'); $('machine').removeAttribute('aria-busy');
  sound.setEnabled(state.sound); staticReel(); tick({ silent: true });
});

$('term-total').textContent = terms.length;
sound.enabled = state.sound;
staticReel(); tick({ silent: true }); persist();
setInterval(() => tick({ silent: document.hidden }), 250);
