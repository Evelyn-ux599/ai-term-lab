export const LEARN_MS = 10 * 60 * 1000;
export const SPEAK_MS = 3 * 60 * 1000;
export const STORAGE_KEY = 'ai-term-lab:v1';

export function emptyState() {
  return { version: 1, termId: null, sound: true, session: null, completed: [] };
}

export function createSession(termId, now = Date.now(), id = crypto.randomUUID()) {
  return { id, termId, phase: 'learn', status: 'running', remaining: LEARN_MS, deadline: now + LEARN_MS };
}

// Deadlines (not interval counts) keep time accurate across background tabs and reloads.
export function settle(session, now = Date.now()) {
  if (!session || session.status !== 'running') return session;
  let next = { ...session, remaining: Math.max(0, session.deadline - now) };
  if (next.phase === 'learn' && now >= next.deadline) {
    next = { ...next, phase: 'speak', deadline: next.deadline + SPEAK_MS };
    next.remaining = Math.max(0, next.deadline - now);
  }
  if (next.phase === 'speak' && now >= next.deadline) {
    next = { ...next, status: 'done', remaining: 0, finishedAt: next.deadline, deadline: null };
  }
  return next;
}

export function pauseSession(session, now = Date.now()) {
  const next = settle(session, now);
  return next?.status === 'running' ? { ...next, status: 'paused', deadline: null } : next;
}

export function resumeSession(session, now = Date.now()) {
  return session?.status === 'paused' ? { ...session, status: 'running', deadline: now + session.remaining } : session;
}

export function recordCompletion(state) {
  const s = state.session;
  if (s?.status !== 'done' || state.completed.some(record => record.id === s.id)) return state;
  return { ...state, completed: [...state.completed, { id: s.id, termId: s.termId, finishedAt: s.finishedAt }] };
}

export function hydrate(raw, validIds) {
  const clean = emptyState();
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return clean;
    clean.termId = validIds.has(data.termId) ? data.termId : null;
    clean.sound = typeof data.sound === 'boolean' ? data.sound : true;
    const seen = new Set();
    clean.completed = Array.isArray(data.completed) ? data.completed.filter(r => {
      if (!r || typeof r.id !== 'string' || seen.has(r.id) || !validIds.has(r.termId) || !Number.isFinite(r.finishedAt)) return false;
      seen.add(r.id); return true;
    }) : [];
    const s = data.session;
    if (s && typeof s.id === 'string' && validIds.has(s.termId) && ['learn', 'speak'].includes(s.phase)
      && ['running', 'paused', 'done'].includes(s.status) && Number.isFinite(s.remaining) && s.remaining >= 0
      && s.remaining <= (s.phase === 'learn' ? LEARN_MS : SPEAK_MS)
      && (s.status !== 'running' || Number.isFinite(s.deadline))
      && (s.status !== 'done' || (s.phase === 'speak' && Number.isFinite(s.finishedAt)))) {
      clean.session = { id: s.id, termId: s.termId, phase: s.phase, status: s.status, remaining: s.remaining,
        deadline: s.status === 'running' ? s.deadline : null, ...(s.status === 'done' ? { finishedAt: s.finishedAt } : {}) };
      clean.termId = s.termId;
    }
    return clean;
  } catch { return clean; }
}

export function randomIndex(length, fill = array => crypto.getRandomValues(array)) {
  if (!Number.isInteger(length) || length < 1 || length > 0x100000000) throw new RangeError('Invalid pool length');
  const limit = Math.floor(0x100000000 / length) * length;
  const sample = new Uint32Array(1);
  do { fill(sample); } while (sample[0] >= limit);
  return sample[0] % length;
}

export function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
