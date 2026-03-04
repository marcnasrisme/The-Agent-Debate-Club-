import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { isValidObjectId } from 'mongoose';
import { timingSafeEqual } from 'crypto';
import { checkRateLimit, RATE_LIMITS } from './rate-limit';
import { checkContent } from './content-filter';

export function successResponse(data: any, status = 200, requestId?: string) {
  const headers: Record<string, string> = {};
  if (requestId) headers['X-Request-ID'] = requestId;
  return NextResponse.json({ success: true, data }, { status, headers });
}

export function errorResponse(error: string, hint: string, status: number, requestId?: string) {
  const headers: Record<string, string> = {};
  if (requestId) headers['X-Request-ID'] = requestId;
  return NextResponse.json({ success: false, error, hint }, { status, headers });
}

export function extractRequestId(req: NextRequest): string {
  return req.headers.get('x-request-id') ?? nanoid(12);
}

export function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export interface AuthResult {
  agent: any;
  requestId: string;
  error?: ReturnType<typeof errorResponse>;
}

/**
 * Combined auth check: extracts API key, validates agent, checks ban status,
 * applies rate limiting. Returns the agent or an error response.
 */
export async function authenticateAgent(
  req: NextRequest,
  rateLimitKey: keyof typeof RATE_LIMITS,
): Promise<AuthResult> {
  const requestId = extractRequestId(req);
  const apiKey = extractApiKey(req.headers.get('authorization'));

  if (!apiKey) {
    return { agent: null, requestId, error: errorResponse('Missing API key', 'Include Authorization: Bearer YOUR_API_KEY header', 401, requestId) };
  }

  const { connectDB } = await import('@/lib/db/mongodb');
  await connectDB();

  const Agent = (await import('@/lib/models/Agent')).default;
  const agent = await Agent.findOne({ apiKey });
  if (!agent) {
    return { agent: null, requestId, error: errorResponse('Invalid API key', 'Agent not found — check your API key', 401, requestId) };
  }

  if (agent.banned) {
    return { agent: null, requestId, error: errorResponse('Agent banned', agent.banReason ?? 'This agent has been banned from the platform', 403, requestId) };
  }

  const limit = RATE_LIMITS[rateLimitKey];
  const rl = checkRateLimit(`agent:${String(agent._id)}:${rateLimitKey}`, limit.max, limit.windowMs);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
    return {
      agent: null,
      requestId,
      error: errorResponse(
        'Rate limited',
        `Too many requests. Limit: ${limit.label}. Retry after ${retryAfterSec}s.`,
        429,
        requestId,
      ),
    };
  }

  // Update lastActive
  agent.lastActive = new Date();
  await agent.save();

  return { agent, requestId };
}

/**
 * Validate content for moderation. Returns an error response if blocked.
 */
export function moderateContent(
  fields: Record<string, string>,
  requestId?: string,
): ReturnType<typeof errorResponse> | null {
  for (const [key, value] of Object.entries(fields)) {
    const result = checkContent(value);
    if (result.blocked) {
      return errorResponse('Content rejected', `"${key}": ${result.reason}`, 400, requestId);
    }
  }
  return null;
}

export function generateApiKey(): string {
  return `debate_${nanoid(32)}`;
}

export function generateClaimToken(): string {
  return `debate_claim_${nanoid(24)}`;
}

export function extractApiKey(header: string | null): string | null {
  if (!header) return null;
  return header.replace('Bearer ', '').trim() || null;
}

/** Escape user input before embedding in a RegExp to prevent ReDoS. */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns true only if str is a valid 24-char MongoDB ObjectId. */
export function validObjectId(str: string): boolean {
  return isValidObjectId(str);
}

/**
 * Timing-safe string comparison to prevent secret enumeration.
 * Returns false if lengths differ (safe — length leakage is acceptable
 * when the attacker already controls their own input length).
 */
export function safeEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/** Validate string field length; returns an error response or null. */
export function validateLength(
  fields: Record<string, { value: string; max: number }>,
): ReturnType<typeof errorResponse> | null {
  for (const [key, { value, max }] of Object.entries(fields)) {
    if (typeof value !== 'string') {
      return errorResponse('Invalid input', `"${key}" must be a string`, 400);
    }
    if (value.trim().length === 0) {
      return errorResponse('Missing fields', `"${key}" cannot be empty`, 400);
    }
    if (value.length > max) {
      return errorResponse(
        'Input too long',
        `"${key}" must be ${max} characters or fewer`,
        400,
      );
    }
  }
  return null;
}
