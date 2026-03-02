import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import NewsItem from '@/lib/models/NewsItem';
import IngestionRun from '@/lib/models/IngestionRun';
import Agent from '@/lib/models/Agent';
import {
  successResponse,
  errorResponse,
  safeEqual,
  validateLength,
} from '@/lib/utils/api-helpers';
import { CHANNELS, type Channel } from '@/lib/news/types';
import { buildDedupeKey, classifyChannel, computeFeaturedScore, extractDomain } from '@/lib/news/normalize';

export async function GET(req: NextRequest) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const channel = searchParams.get('channel') as Channel | null;
  const featuredOnly = searchParams.get('featuredOnly') === 'true';
  const limitParam = parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(Math.max(limitParam, 1), 50);

  const filter: any = { status: 'active' };
  if (channel && CHANNELS.includes(channel)) filter.channel = channel;
  if (featuredOnly) filter.isFeatured = true;

  const [items, lastRun] = await Promise.all([
    NewsItem.find(filter)
      .sort({ isFeatured: -1, featuredScore: -1, ingestedAt: -1 })
      .limit(limit)
      .populate('linkedTopicId', 'title status')
      .lean(),
    IngestionRun.findOne({ kind: 'news_ingestion', status: { $in: ['success', 'partial'] } })
      .sort({ startedAt: -1 })
      .lean(),
  ]);

  const lastIngestion = lastRun
    ? { at: lastRun.finishedAt ?? lastRun.startedAt, status: lastRun.status, provider: lastRun.provider }
    : null;

  return successResponse({ items, lastIngestion, count: items.length });
}

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key') ?? '';
  const expected = process.env.ADMIN_KEY ?? '';

  if (!adminKey || !expected || !safeEqual(adminKey, expected))
    return errorResponse('Forbidden', 'Valid X-Admin-Key header required (manual headline creation)', 403);

  await connectDB();

  const body = await req.json();
  const { title, summary, sourceName, sourceUrl, category, channel, publishedAt, tags } = body;

  if (!title) return errorResponse('Missing fields', '"title" is required', 400);

  const lenErr = validateLength({ title: { value: title, max: 220 } });
  if (lenErr) return lenErr;
  if (summary) {
    const sErr = validateLength({ summary: { value: summary, max: 500 } });
    if (sErr) return sErr;
  }

  const sourceDomain = extractDomain(sourceUrl);
  const pub = publishedAt ? new Date(publishedAt) : undefined;
  const dedupeKey = buildDedupeKey(title, sourceDomain, pub);
  const assignedChannel = (channel && CHANNELS.includes(channel))
    ? channel
    : classifyChannel(title, summary, category);

  const existing = await NewsItem.findOne({ dedupeKey });
  if (existing) return errorResponse('Duplicate', 'A similar headline already exists', 409);

  const item = await NewsItem.create({
    title: title.trim(),
    summary: summary?.trim(),
    sourceName: sourceName?.trim(),
    sourceUrl: sourceUrl?.trim(),
    sourceDomain,
    category: category?.trim(),
    channel: assignedChannel,
    publishedAt: pub,
    tags: Array.isArray(tags) ? tags.map((t: string) => String(t).trim()).slice(0, 10) : [],
    provider: 'manual',
    dedupeKey,
    featuredScore: computeFeaturedScore(title, pub, sourceDomain),
    isFeatured: true,
  });

  return successResponse({ newsItem: item }, 201);
}
