import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEEDS,
  getFeedGroupCounts,
  getFeedsForPipeline,
} from '../lib/feeds.ts';
import { canonicalizeArticleUrl } from '../lib/urls.ts';

test('feed configuration preserves existing feeds and adds one AP feed', () => {
  assert.equal(FEEDS.length, 65);
  assert.equal(new Set(FEEDS.map(feed => feed.id)).size, 65);
  assert.equal(new Set(FEEDS.map(feed => feed.url)).size, 65);
  assert.equal(getFeedsForPipeline('daily-brief').length, 65);
  assert.equal(getFeedsForPipeline('legal-scan').length, 11);
  assert.deepEqual(getFeedGroupCounts(), {
    rai: 23,
    aisa: 18,
    rapporten: 23,
    legal: 11,
  });
});

test('all feed labels use ASCII hyphens', () => {
  for (const feed of FEEDS) {
    assert.equal(feed.label.includes('—'), false, feed.label);
    assert.equal(feed.label.includes('–'), false, feed.label);
  }
});

test('Google redirect URLs resolve to a clean direct source URL', () => {
  const result = canonicalizeArticleUrl(
    'https://www.google.com/url?url=https%3A%2F%2Fexample.com%2Fnews%2F%3Futm_source%3Dalert%26id%3D2'
  );
  assert.equal(result, 'https://example.com/news?id=2');
});

test('tracking parameters and fragments are removed', () => {
  const result = canonicalizeArticleUrl(
    'https://example.com/article/?utm_medium=email&gclid=abc&keep=1#section'
  );
  assert.equal(result, 'https://example.com/article?keep=1');
});
