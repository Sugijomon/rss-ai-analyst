import Parser from 'rss-parser';
import { z } from 'zod';
import type { FeedDefinition, SourceLevel } from './feeds';
import { canonicalizeArticleUrl } from './urls';

const parser = new Parser();

const FeedArticleSchema = z.object({
  feedId: z.string().min(1),
  feedLabel: z.string().min(1),
  sourceLevel: z.enum(['primary', 'secondary']),
  title: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.date(),
  content: z.string(),
}).strict();

export interface FeedArticle {
  feedId: string;
  feedLabel: string;
  sourceLevel: SourceLevel;
  title: string;
  url: string;
  publishedAt: Date;
  content: string;
}

export interface FeedFetchFailure {
  feedId: string;
  label: string;
  message: string;
}

interface FetchFeedOptions {
  hoursLookback: number;
  maxArticlesPerFeed: number;
}

export async function fetchFeedArticles(
  feeds: readonly FeedDefinition[],
  options: FetchFeedOptions
): Promise<{ articles: FeedArticle[]; failures: FeedFetchFailure[] }> {
  const cutoff = new Date(Date.now() - options.hoursLookback * 60 * 60 * 1000);
  const articles: FeedArticle[] = [];
  const failures: FeedFetchFailure[] = [];
  const seenUrls = new Set<string>();

  for (const feedDefinition of feeds) {
    try {
      const feed = await parser.parseURL(feedDefinition.url);
      const recentItems = feed.items
        .filter(item => {
          const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
          return !Number.isNaN(publishedAt.getTime()) && publishedAt > cutoff;
        })
        .slice(0, options.maxArticlesPerFeed);

      for (const item of recentItems) {
        const url = canonicalizeArticleUrl(item.link || '');
        if (!url || seenUrls.has(url)) {
          continue;
        }

        const parsed = FeedArticleSchema.safeParse({
          feedId: feedDefinition.id,
          feedLabel: feedDefinition.label,
          sourceLevel: feedDefinition.sourceLevel,
          title: item.title || 'Untitled',
          url,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          content: item.content || item.contentSnippet || item.summary || '',
        });

        if (!parsed.success) {
          console.warn('Invalid feed item skipped:', feedDefinition.id, parsed.error.issues);
          continue;
        }

        seenUrls.add(url);
        articles.push(parsed.data);
      }
    } catch (error) {
      const failure = {
        feedId: feedDefinition.id,
        label: feedDefinition.label,
        message: error instanceof Error ? error.message : String(error),
      };
      failures.push(failure);
      console.error('Feed error ' + feedDefinition.label + ':', error);
    }
  }

  console.log('Total unique articles: ' + articles.length);
  return { articles, failures };
}
