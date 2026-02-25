import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { isValidObjectId } from 'mongoose';
import { timingSafeEqual } from 'crypto';

export function successResponse(data: any, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(error: string, hint: string, status: number) {
  return NextResponse.json({ success: false, error, hint }, { status });
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
