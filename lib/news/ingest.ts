import { connectDB } from '@/lib/db/mongodb';
import { getNewsProvider } from './provider';
import { classifyChannel, computeFeaturedScore } from './normalize';
import NewsItem from '@/lib/models/NewsItem';
import IngestionRun from '@/lib/models/IngestionRun';

const COOLDOWN_MS = 25 * 60 * 1000; // 25 minutes
const FEATURED_COUNT = 5;
const ARCHIVE_DAYS = 7;

export interface IngestionResult {
  status: 'skipped_no_key' | 'skipped_cooldown' | 'success' | 'partial' | 'error';
  fetched: number;
  inserted: number;
  deduped: number;
  message: string;
  cooldownMinutesRemaining?: number;
}

export async function runNewsIngestion(): Promise<IngestionResult> {
  const provider = getNewsProvider();
  if (!provider) {
    return { status: 'skipped_no_key', fetched: 0, inserted: 0, deduped: 0, message: 'NEWS_API_KEY not set — ingestion skipped' };
  }

  await connectDB();

  // Cooldown check
  const lastRun = await IngestionRun.findOne({
    kind: 'news_ingestion',
    status: { $in: ['success', 'partial'] },
  }).sort({ startedAt: -1 }).lean();

  if (lastRun?.startedAt) {
    const elapsed = Date.now() - new Date(lastRun.startedAt).getTime();
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60_000);
      return { status: 'skipped_cooldown', fetched: 0, inserted: 0, deduped: 0, message: `Cooldown active — ${remaining} min remaining`, cooldownMinutesRemaining: remaining };
    }
  }

  // Create run record
  const run = await IngestionRun.create({ provider: provider.name });

  try {
    const headlines = await provider.fetchHeadlines({ maxResults: 10 });
    run.fetchedCount = headlines.length;

    if (headlines.length === 0) {
      run.status = 'partial';
      run.finishedAt = new Date();
      run.errorMessage = 'Provider returned 0 articles';
      await run.save();
      return { status: 'partial', fetched: 0, inserted: 0, deduped: 0, message: 'Provider returned no articles — cached headlines still served' };
    }

    let inserted = 0;
    let deduped = 0;

    for (const h of headlines) {
      const channel = classifyChannel(h.title, h.description, h.category);
      const featuredScore = computeFeaturedScore(h.title, h.publishedAt, h.sourceDomain);

      const existing = await NewsItem.findOne({ dedupeKey: h.dedupeKey });
      if (existing) {
        existing.lastSeenAt = new Date();
        if (!existing.publishedAt && h.publishedAt) existing.publishedAt = h.publishedAt;
        if (!existing.rawDescription && h.description) existing.rawDescription = h.description;
        if (!existing.summary && h.description) existing.summary = h.description;
        existing.featuredScore = Math.max(existing.featuredScore, featuredScore);
        await existing.save();
        deduped++;
      } else {
        await NewsItem.create({
          title: h.title,
          summary: h.description,
          rawDescription: h.description,
          sourceName: h.sourceName,
          sourceUrl: h.sourceUrl,
          sourceDomain: h.sourceDomain,
          publishedAt: h.publishedAt,
          channel,
          provider: h.providerName,
          providerArticleId: h.providerArticleId,
          dedupeKey: h.dedupeKey,
          featuredScore,
        });
        inserted++;
      }
    }

    // Mark top N as featured, unmark others
    await NewsItem.updateMany({ status: 'active' }, { $set: { isFeatured: false } });
    const topItems = await NewsItem.find({ status: 'active' })
      .sort({ featuredScore: -1, importanceVoteCount: -1, ingestedAt: -1 })
      .limit(FEATURED_COUNT)
      .select('_id');
    if (topItems.length > 0) {
      await NewsItem.updateMany(
        { _id: { $in: topItems.map(i => i._id) } },
        { $set: { isFeatured: true } },
      );
    }

    // Archive old items
    const cutoff = new Date(Date.now() - ARCHIVE_DAYS * 86_400_000);
    await NewsItem.updateMany(
      { status: 'active', ingestedAt: { $lt: cutoff }, linkedTopicId: { $exists: false } },
      { $set: { status: 'archived' } },
    );

    run.insertedCount = inserted;
    run.dedupedCount = deduped;
    run.status = 'success';
    run.finishedAt = new Date();
    await run.save();

    return { status: 'success', fetched: headlines.length, inserted, deduped, message: `Ingested ${inserted} new, ${deduped} updated` };
  } catch (err: any) {
    run.status = 'error';
    run.errorMessage = err.message?.slice(0, 300);
    run.finishedAt = new Date();
    await run.save();
    return { status: 'error', fetched: 0, inserted: 0, deduped: 0, message: err.message ?? 'Unknown ingestion error' };
  }
}
