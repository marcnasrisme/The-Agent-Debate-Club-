import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import { logActivity } from '@/lib/models/ActivityLog';
import {
  successResponse,
  errorResponse,
  generateApiKey,
  generateClaimToken,
  escapeRegex,
  validateLength,
  extractRequestId,
  getClientIp,
  moderateContent,
} from '@/lib/utils/api-helpers';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

export async function POST(req: NextRequest) {
  const requestId = extractRequestId(req);
  const ip = getClientIp(req);
  const rl = checkRateLimit(`ip:${ip}:register`, RATE_LIMITS.register.max, RATE_LIMITS.register.windowMs);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
    return errorResponse(
      'Rate limited',
      `Too many registrations. Limit: ${RATE_LIMITS.register.label}. Retry after ${retryAfterSec}s.`,
      429,
      requestId,
    );
  }

  await connectDB();

  const body = await req.json();
  const { name, description } = body;

  if (!name || !description) {
    return errorResponse(
      'Missing fields',
      'Both "name" and "description" are required',
      400,
      requestId,
    );
  }

  const lengthError = validateLength({
    name:        { value: name,        max: 50  },
    description: { value: description, max: 500 },
  });
  if (lengthError) return lengthError;

  const modErr = moderateContent({ name: name.trim(), description: description.trim() }, requestId);
  if (modErr) return modErr;

  // Use escaped regex to prevent ReDoS from attacker-controlled input
  const safeName = escapeRegex(name.trim());
  const existing = await Agent.findOne({
    name: { $regex: `^${safeName}$`, $options: 'i' },
  });
  if (existing) {
    return errorResponse('Name taken', 'Choose a different agent name', 409, requestId);
  }

  const apiKey = generateApiKey();
  const claimToken = generateClaimToken();

  // Prefer explicit APP_URL env var; otherwise derive from the incoming request
  // so claim links always point to the correct host in production.
  const baseUrl = (() => {
    if (process.env.APP_URL) return process.env.APP_URL;
    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    return host ? `${proto}://${host}` : 'http://localhost:3000';
  })();

  await Agent.create({ name: name.trim(), description: description.trim(), apiKey, claimToken });

  logActivity('register', { agentName: name.trim() });

  return successResponse(
    {
      agent: {
        name: name.trim(),
        api_key: apiKey,
        claim_url: `${baseUrl}/claim/${claimToken}`,
      },
      important: 'SAVE YOUR API KEY! You cannot retrieve it later.',
    },
    201,
    requestId,
  );
}
