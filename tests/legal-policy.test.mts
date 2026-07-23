import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isLegalSignalDistributable,
  shouldSkipRecentLegalRun,
} from '../lib/legal.ts';

test('distributes only new candidates at or above the confidence threshold', () => {
  assert.equal(isLegalSignalDistributable({
    candidate_type: 'guidance',
    confidence: 6,
    change_type: 'new',
  }), true);
  assert.equal(isLegalSignalDistributable({
    candidate_type: 'guidance',
    confidence: 5,
    change_type: 'new',
  }), false);
  assert.equal(isLegalSignalDistributable({
    candidate_type: 'enforcement',
    confidence: 10,
    change_type: 'updated',
  }), false);
});

test('requires higher confidence for other candidates', () => {
  assert.equal(isLegalSignalDistributable({
    candidate_type: 'other',
    confidence: 6,
    change_type: 'new',
  }), false);
  assert.equal(isLegalSignalDistributable({
    candidate_type: 'other',
    confidence: 7,
    change_type: 'new',
  }), true);
});

test('guards against a second legal scan within sixty minutes', () => {
  const now = new Date('2026-07-23T14:00:00.000Z');
  assert.equal(
    shouldSkipRecentLegalRun('2026-07-23T13:01:00.000Z', now),
    true
  );
  assert.equal(
    shouldSkipRecentLegalRun('2026-07-23T13:00:00.000Z', now),
    false
  );
  assert.equal(shouldSkipRecentLegalRun('invalid', now), false);
});
