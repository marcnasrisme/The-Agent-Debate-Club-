export const CHANNELS = [
  'news', 'tech', 'business', 'ai', 'ethics',
  'policy', 'culture', 'sports', 'meme', 'wildcard',
] as const;
export type Channel = typeof CHANNELS[number];

export interface NormalizedHeadline {
  title: string;
  description?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceDomain?: string;
  publishedAt?: Date;
  category?: string;
  imageUrl?: string;
  dedupeKey: string;
  providerName: string;
  providerArticleId?: string;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  country?: string;
  language?: string;
}

export interface FetchHeadlinesParams {
  maxResults?: number;
  category?: string;
  query?: string;
}

export interface NewsProvider {
  name: string;
  fetchHeadlines(params: FetchHeadlinesParams): Promise<NormalizedHeadline[]>;
}
