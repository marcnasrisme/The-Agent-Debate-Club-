/**
 * News provider abstraction. Currently supports GNews.io (free tier: 100 req/day, 10 articles/req).
 * Add new providers by implementing the NewsProvider interface and registering them here.
 */

import type { NewsProvider, NormalizedHeadline, FetchHeadlinesParams, ProviderConfig } from './types';
import { buildDedupeKey, extractDomain } from './normalize';

// ── GNews.io Provider ───────────────────────────────────────────────────────

function createGNewsProvider(config: ProviderConfig): NewsProvider {
  const baseUrl = config.baseUrl ?? 'https://gnews.io/api/v4';

  return {
    name: 'gnews',

    async fetchHeadlines(params: FetchHeadlinesParams): Promise<NormalizedHeadline[]> {
      const url = new URL(`${baseUrl}/top-headlines`);
      url.searchParams.set('apikey', config.apiKey);
      url.searchParams.set('lang', config.language ?? 'en');
      if (config.country) url.searchParams.set('country', config.country);
      if (params.category) url.searchParams.set('topic', params.category);
      if (params.query) url.searchParams.set('q', params.query);
      url.searchParams.set('max', String(params.maxResults ?? 10));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const res = await fetch(url.toString(), { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[gnews] HTTP ${res.status}: ${body.slice(0, 200)}`);
          return [];
        }

        const data = await res.json();
        const articles: any[] = data.articles ?? [];

        return articles.map((a: any) => {
          const sourceDomain = extractDomain(a.url);
          const publishedAt = a.publishedAt ? new Date(a.publishedAt) : undefined;
          return {
            title: String(a.title ?? '').slice(0, 220),
            description: a.description ? String(a.description).slice(0, 500) : undefined,
            sourceName: a.source?.name,
            sourceUrl: a.url,
            sourceDomain,
            publishedAt,
            imageUrl: a.image,
            dedupeKey: buildDedupeKey(a.title ?? '', sourceDomain, publishedAt),
            providerName: 'gnews',
          };
        });
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          console.error('[gnews] Request timed out (10s)');
        } else {
          console.error('[gnews] Fetch failed:', err.message);
        }
        return [];
      }
    },
  };
}

// ── Provider factory ────────────────────────────────────────────────────────

export function getNewsProvider(): NewsProvider | null {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return null;

  const providerName = (process.env.NEWS_API_PROVIDER ?? 'gnews').toLowerCase();
  const config: ProviderConfig = {
    apiKey,
    baseUrl: process.env.NEWS_API_BASE_URL,
    country: process.env.NEWS_API_DEFAULT_COUNTRY,
    language: process.env.NEWS_API_DEFAULT_LANGUAGE,
  };

  switch (providerName) {
    case 'gnews':
    default:
      return createGNewsProvider(config);
  }
}
