import test from 'node:test';
import assert from 'node:assert/strict';
import { terms } from '../src/terms.js';
import { LEARN_MS, SPEAK_MS, createSession, settle, pauseSession, resumeSession, recordCompletion, emptyState, hydrate, randomIndex, formatTime } from '../src/core.js';

test('100 unique, complete editorial entries with HTTPS references', () => {
  assert.equal(terms.length, 100);
  assert.equal(new Set(terms.map(t => t.id)).size, terms.length);
  for (const term of terms) {
    for (const field of ['id', 'english', 'chinese', 'definition', 'example', 'misconception', 'category']) assert.ok(typeof term[field] === 'string' && term[field].trim(), `${term.id}: ${field}`);
    assert.equal(new URL(term.reference).protocol, 'https:');
  }
});
test('learning transitions exactly at 10 min and speech finishes at 13 min', () => {
  const s = createSession('rag', 1000, 'one');
  assert.equal(settle(s, 1000 + LEARN_MS - 1).phase, 'learn');
  const speaking = settle(s, 1000 + LEARN_MS);
  assert.equal(speaking.phase, 'speak'); assert.equal(speaking.remaining, SPEAK_MS);
  assert.equal(settle(speaking, 1000 + LEARN_MS + SPEAK_MS - 1).status, 'running');
  assert.equal(settle(speaking, 1000 + LEARN_MS + SPEAK_MS).status, 'done');
});
test('background or reload time catches up across both phases', () => {
  const s = createSession('rag', 1000, 'one');
  const resumed = settle(s, 1000 + LEARN_MS + 5000);
  assert.equal(resumed.phase, 'speak'); assert.equal(resumed.remaining, SPEAK_MS - 5000);
  const finished = settle(s, 1000 + LEARN_MS + SPEAK_MS + 60000);
  assert.equal(finished.status, 'done'); assert.equal(finished.finishedAt, 1000 + LEARN_MS + SPEAK_MS);
});
test('pause freezes remaining time and resume establishes a new deadline', () => {
  const s = pauseSession(createSession('rag', 1000, 'one'), 11000);
  assert.equal(s.status, 'paused'); assert.equal(s.remaining, LEARN_MS - 10000);
  assert.equal(settle(s, 900000).remaining, s.remaining);
  const resumed = resumeSession(s, 900000);
  assert.equal(resumed.deadline, 900000 + s.remaining);
  assert.equal(settle(resumed, resumed.deadline).phase, 'speak');
});
test('pause at phase boundary does not reset or lose speech time', () => {
  const s = pauseSession(createSession('rag', 0, 'one'), LEARN_MS + 10000);
  assert.equal(s.phase, 'speak'); assert.equal(s.remaining, SPEAK_MS - 10000);
  assert.equal(s.status, 'paused');
});
test('completion is counted only once even after restoring the finished session', () => {
  let state = { ...emptyState(), termId: 'rag', session: settle(createSession('rag', 0, 'one'), LEARN_MS + SPEAK_MS) };
  state = recordCompletion(state);
  state = hydrate(JSON.stringify(state), new Set(['rag']));
  state = recordCompletion(state);
  assert.equal(state.completed.length, 1);
  assert.equal(recordCompletion({ ...emptyState(), session: createSession('rag', 0, 'two') }).completed.length, 0);
});
test('storage restores paused progress and rejects malformed or unknown records', () => {
  const validIds = new Set(['rag']);
  const state = { ...emptyState(), termId: 'rag', sound: false, session: pauseSession(createSession('rag', 0, 'one'), 10000) };
  assert.deepEqual(hydrate(JSON.stringify(state), validIds), state);
  assert.deepEqual(hydrate('{broken', validIds), emptyState());
  assert.equal(hydrate(JSON.stringify({ ...state, session: { ...state.session, remaining: -1 } }), validIds).session, null);
  assert.equal(hydrate(JSON.stringify({ ...state, session: { ...state.session, termId: 'missing' } }), validIds).session, null);
  assert.equal(hydrate(JSON.stringify({ version: 9 }), validIds).termId, null);
});
test('uniform random sampler rejects biased overflow instead of using it', () => {
  let calls = 0;
  const index = randomIndex(100, a => { a[0] = calls++ === 0 ? 0xffffffff : 123; });
  assert.equal(index, 23); assert.equal(calls, 2);
  assert.throws(() => randomIndex(0), RangeError);
  assert.equal(randomIndex(1, a => { a[0] = 0; }), 0);
});
test('clock rounds up partial seconds and never shows negative time', () => {
  assert.equal(formatTime(LEARN_MS), '10:00'); assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(-1), '00:00'); assert.equal(formatTime(SPEAK_MS), '03:00');
});
