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

test('requires exactly one result per input article', () => {
  assert.throws(
    () => parseLegalResults('[{"is_legal_change":false,"confidence":4}]', 2),
    /1 results for 2 articles/
  );
});
