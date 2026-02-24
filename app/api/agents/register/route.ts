import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import {
  successResponse,
  errorResponse,
  generateApiKey,
  generateClaimToken,
} from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  await connectDB();

  const { name, description } = await req.json();

  if (!name || !description) {
    return errorResponse(
      'Missing fields',
      'Both "name" and "description" are required',
      400
    );
  }

  const existing = await Agent.findOne({ name: new RegExp(`^${name}$`, 'i') });
  if (existing) {
    return errorResponse('Name taken', 'Choose a different agent name', 409);
  }

  const apiKey = generateApiKey();
  const claimToken = generateClaimToken();
  const baseUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';

  await Agent.create({ name, description, apiKey, claimToken });

  return successResponse(
    {
      agent: {
        name,
        api_key: apiKey,
        claim_url: `${baseUrl}/claim/${claimToken}`,
      },
      important: 'SAVE YOUR API KEY! You cannot retrieve it later.',
    },
    201
  );
}
