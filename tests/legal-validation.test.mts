import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLegalResults } from '../lib/legal.ts';

test('accepts an explicitly labelled legal candidate', () => {
  const result = parseLegalResults(JSON.stringify([{
    is_legal_change: true,
    candidate_type: 'guidance',
    candidate_legal_status: null,
    change_type: 'guidance',
    jurisdiction: 'EU',
    identifier: null,
    instrument: null,
    provision: null,
    candidate_summary: 'Mogelijke nieuwe guidance is gepubliceerd.',
    candidate_rationale: 'De bron beschrijft een nieuwe publicatie.',
    evidence: ['Nieuwe guidance gepubliceerd'],
    affected_modules: ['MOD-CORE'],
    primary_source_url: null,
    confidence: 7,
  }]), 1);

  assert.equal(result[0].is_legal_change, true);
});

test('rejects a confirmed rather than candidate outcome', () => {
  assert.throws(() => parseLegalResults(JSON.stringify([{
    is_legal_change: true,
    candidate_status: 'confirmed',
    candidate_type: 'guidance',
    candidate_legal_status: 'applicable',
    change_type: 'guidance',
    jurisdiction: 'EU',
    identifier: null,
    instrument: null,
    provision: null,
    candidate_summary: 'Definitief.',
    candidate_rationale: 'Definitief.',
    evidence: [],
    affected_modules: [],
    primary_source_url: null,
    confidence: 10,
  }]), 1));
});

test('normalizes conservative aliases instead of rejecting a whole batch', () => {
  const results = parseLegalResults(JSON.stringify([
    {
      is_legal_change: true,
      candidate_type: 'court-decision',
      candidate_legal_status: null,
      change_type: 'clarification',
      jurisdiction: 'European Union',
      identifier: null,
      instrument: null,
      provision: null,
      candidate_summary: 'Een rechterlijke uitspraak verduidelijkt de toepassing.',
      candidate_rationale: 'De bron beschrijft een concrete uitspraak.',
      evidence: ['De uitspraak is gepubliceerd.'],
      affected_modules: [],
      primary_source_url: null,
      confidence: 7,
    },
    {
      is_legal_change: true,
      candidate_type: 'unexpected-category',
      candidate_legal_status: null,
      change_type: 'unexpected-change',
      jurisdiction: 'unknown',
      identifier: null,
      instrument: null,
      provision: null,
      candidate_summary: 'Een mogelijk juridisch signaal.',
      candidate_rationale: 'Handmatige beoordeling is nodig.',
      evidence: [],
      affected_modules: [],
      primary_source_url: null,
      confidence: 6,
    },
  ]), 2);

  assert.equal(results[0].is_legal_change, true);
  if (results[0].is_legal_change) {
    assert.equal(results[0].candidate_type, 'case_law');
    assert.equal(results[0].change_type, 'none');
    assert.equal(results[0].jurisdiction, 'EU');
  }
  assert.equal(results[1].is_legal_change, true);
  if (results[1].is_legal_change) {
    assert.equal(results[1].candidate_type, 'other');
    assert.equal(results[1].change_type, 'none');
    assert.equal(results[1].jurisdiction, null);
  }
});

test('requires exactly one result per input article', () => {
  assert.throws(
    () => parseLegalResults('[{"is_legal_change":false,"confidence":4}]', 2),
    /1 results for 2 articles/
  );
});
