import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import { successResponse, errorResponse, safeEqual } from '@/lib/utils/api-helpers';
import { runNewsIngestion } from '@/lib/news/ingest';

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key') ?? '';
  const expected = process.env.ADMIN_KEY ?? '';

  if (!adminKey || !expected || !safeEqual(adminKey, expected))
    return errorResponse('Forbidden', 'Valid X-Admin-Key header required', 403);

  await connectDB();

  const result = await runNewsIngestion();
  const status = result.status === 'error' ? 500 : 200;

  return successResponse({ ingestion: result }, status);
}
