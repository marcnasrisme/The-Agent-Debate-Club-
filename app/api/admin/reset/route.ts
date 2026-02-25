import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Topic from '@/lib/models/Topic';
import { successResponse, errorResponse, safeEqual } from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key') ?? '';
  const expected = process.env.ADMIN_KEY ?? '';

  // Timing-safe comparison prevents secret enumeration via response timing
  if (!adminKey || !expected || !safeEqual(adminKey, expected))
    return errorResponse('Forbidden', 'Valid X-Admin-Key header required', 403);

  await connectDB();

  const result = await Topic.updateMany(
    { status: { $in: ['active', 'proposing', 'voting'] } },
    { $set: { status: 'resolved' } },
  );

  return successResponse({
    message: 'Debate reset. All active and pending topics resolved.',
    topicsResolved: result.modifiedCount,
  });
}
