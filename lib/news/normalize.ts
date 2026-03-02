import { createHash } from 'crypto';
import type { Channel } from './types';

/**
 * Build a dedupe key from title + source domain + date bucket (YYYY-MM-DD).
 * Two articles with the same headline from the same domain on the same day
 * are considered duplicates.
 */
export function buildDedupeKey(
  title: string,
  sourceDomain?: string,
  publishedAt?: Date,
): string {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 100);
  const domain = (sourceDomain ?? 'unknown').toLowerCase().replace(/^www\./, '');
  const dateBucket = publishedAt
    ? publishedAt.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const raw = `${normalizedTitle}|${domain}|${dateBucket}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

// ── Channel classification via keyword rules ────────────────────────────────

const CHANNEL_RULES: { channel: Channel; keywords: string[] }[] = [
  { channel: 'ai',       keywords: ['ai', 'artificial intelligence', 'machine learning', 'chatgpt', 'openai', 'llm', 'gpt', 'deepmind', 'neural', 'deep learning', 'generative'] },
  { channel: 'tech',     keywords: ['tech', 'software', 'hardware', 'startup', 'silicon valley', 'apple', 'google', 'microsoft', 'amazon', 'meta', 'programming', 'cyber', 'blockchain', 'crypto'] },
  { channel: 'business', keywords: ['earnings', 'stock', 'market', 'economy', 'gdp', 'inflation', 'fed', 'trade', 'ipo', 'revenue', 'profit', 'investment', 'finance', 'banking'] },
  { channel: 'policy',   keywords: ['congress', 'senate', 'parliament', 'regulation', 'law', 'legislation', 'government', 'policy', 'sanctions', 'election', 'vote', 'political'] },
  { channel: 'ethics',   keywords: ['ethics', 'bias', 'privacy', 'surveillance', 'rights', 'discrimination', 'fairness', 'accountability'] },
  { channel: 'sports',   keywords: ['nba', 'nfl', 'mlb', 'fifa', 'soccer', 'football', 'basketball', 'tennis', 'olympics', 'championship', 'tournament'] },
  { channel: 'culture',  keywords: ['movie', 'film', 'music', 'art', 'book', 'celebrity', 'entertainment', 'streaming', 'netflix', 'oscar', 'grammy'] },
  { channel: 'meme',     keywords: ['meme', 'viral', 'tiktok', 'trend', 'funny'] },
];

export function classifyChannel(title: string, description?: string, rawCategory?: string): Channel {
  const text = `${title} ${description ?? ''} ${rawCategory ?? ''}`.toLowerCase();

  for (const rule of CHANNEL_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) return rule.channel;
    }
  }

  return 'news';
}

// ── Featured score heuristic ────────────────────────────────────────────────

const QUALITY_SOURCES = new Set([
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com',
  'theguardian.com', 'washingtonpost.com', 'bloomberg.com', 'techcrunch.com',
  'arstechnica.com', 'wired.com', 'theverge.com', 'nature.com', 'science.org',
]);

const BOOST_KEYWORDS = ['breaking', 'exclusive', 'urgent', 'major', 'landmark'];

export function computeFeaturedScore(
  title: string,
  publishedAt: Date | undefined,
  sourceDomain: string | undefined,
): number {
  let score = 0;

  // Recency: articles from the last 6 hours get up to 5 points
  if (publishedAt) {
    const hoursAgo = (Date.now() - publishedAt.getTime()) / 3_600_000;
    score += Math.max(0, 5 - hoursAgo * 0.8);
  }

  // Source quality
  if (sourceDomain && QUALITY_SOURCES.has(sourceDomain)) {
    score += 2;
  }

  // Keyword boost
  const lower = title.toLowerCase();
  for (const kw of BOOST_KEYWORDS) {
    if (lower.includes(kw)) { score += 1.5; break; }
  }

  return Math.round(score * 100) / 100;
}
