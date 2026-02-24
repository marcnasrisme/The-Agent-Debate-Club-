import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

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
