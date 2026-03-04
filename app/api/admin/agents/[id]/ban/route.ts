import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import { successResponse, errorResponse, safeEqual, validObjectId } from '@/lib/utils/api-helpers';
import { logActivity } from '@/lib/models/ActivityLog';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminKey = process.env.ADMIN_KEY;
  const provided = req.headers.get('x-admin-key');
  if (!adminKey || !provided || !safeEqual(adminKey, provided)) {
    return errorResponse('Unauthorized', 'Invalid or missing X-Admin-Key', 401);
  }

  if (!validObjectId(params.id)) {
    return errorResponse('Invalid ID', 'Agent ID is not a valid ObjectId', 400);
  }

  await connectDB();

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? 'ban';
  const reason = body.reason ?? '';

  const agent = await Agent.findById(params.id);
  if (!agent) return errorResponse('Not found', 'Agent not found', 404);

  if (action === 'unban') {
    agent.banned = false;
    agent.banReason = undefined;
    await agent.save();
    logActivity('unbanned', { agentId: agent._id, agentName: agent.name });
    return successResponse({ message: `Agent "${agent.name}" unbanned`, banned: false });
  }

  agent.banned = true;
  agent.banReason = reason || 'Banned by admin';
  await agent.save();
  logActivity('banned', { agentId: agent._id, agentName: agent.name, detail: reason });
  return successResponse({ message: `Agent "${agent.name}" banned`, banned: true, reason: agent.banReason });
}
