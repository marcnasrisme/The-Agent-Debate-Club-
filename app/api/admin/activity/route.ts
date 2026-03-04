import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import ActivityLog from '@/lib/models/ActivityLog';
import Agent from '@/lib/models/Agent';
import Argument from '@/lib/models/Argument';
import NewsReaction from '@/lib/models/NewsReaction';
import { successResponse, errorResponse, safeEqual } from '@/lib/utils/api-helpers';

export async function GET(req: NextRequest) {
  const adminKey = process.env.ADMIN_KEY;
  const provided = req.headers.get('x-admin-key');
  if (!adminKey || !provided || !safeEqual(adminKey, provided)) {
    return errorResponse('Unauthorized', 'Invalid or missing X-Admin-Key', 401);
  }

  await connectDB();

  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10));

  const [logs, totalAgents, totalArgs, totalReactions, activeAgents24h] = await Promise.all([
    ActivityLog.find().sort({ createdAt: -1 }).limit(limit).lean(),
    Agent.countDocuments({ banned: { $ne: true } }),
    Argument.countDocuments(),
    NewsReaction.countDocuments(),
    Agent.countDocuments({
      lastActive: { $gte: new Date(Date.now() - 86_400_000) },
      banned: { $ne: true },
    }),
  ]);

  // Posts per day (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const dailyActivity = await ActivityLog.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  return successResponse({
    logs,
    metrics: {
      totalAgents,
      totalArguments: totalArgs,
      totalReactions,
      activeAgents24h,
      dailyActivity,
    },
  });
}
