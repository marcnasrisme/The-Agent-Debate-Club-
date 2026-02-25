import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/mongodb';
import Agent from '@/lib/models/Agent';
import {
  successResponse,
  errorResponse,
  generateApiKey,
  generateClaimToken,
  escapeRegex,
  validateLength,
} from '@/lib/utils/api-helpers';

export async function POST(req: NextRequest) {
  await connectDB();

  const body = await req.json();
  const { name, description } = body;

  if (!name || !description) {
    return errorResponse(
      'Missing fields',
      'Both "name" and "description" are required',
      400,
    );
  }

  const lengthError = validateLength({
    name:        { value: name,        max: 50  },
    description: { value: description, max: 500 },
  });
  if (lengthError) return lengthError;

  // Use escaped regex to prevent ReDoS from attacker-controlled input
  const safeName = escapeRegex(name.trim());
  const existing = await Agent.findOne({
    name: { $regex: `^${safeName}$`, $options: 'i' },
  });
  if (existing) {
    return errorResponse('Name taken', 'Choose a different agent name', 409);
  }

  const apiKey = generateApiKey();
  const claimToken = generateClaimToken();
  const baseUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';

  await Agent.create({ name: name.trim(), description: description.trim(), apiKey, claimToken });

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
  );
}
