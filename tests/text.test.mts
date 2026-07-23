import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFeedText } from '../lib/text.ts';

test('removes Google Alerts markup and decodes HTML entities', () => {
  assert.equal(
    normalizeFeedText(
      'How the Digital Omnibus Could Unravel <b>Europe&#39;s</b> Safeguards &amp; Rules'
    ),
    "How the Digital Omnibus Could Unravel Europe's Safeguards & Rules"
  );
});

test('decodes numeric, hexadecimal and double-encoded entities', () => {
  assert.equal(
    normalizeFeedText('A&#32;B &#x26; C &amp;#39;test&amp;#39;'),
    "A B & C 'test'"
  );
});

test('normalizes whitespace after stripping HTML tags', () => {
  assert.equal(
    normalizeFeedText('<p>Nieuwe</p>\n  <strong>guidance</strong>'),
    'Nieuwe guidance'
  );
});
