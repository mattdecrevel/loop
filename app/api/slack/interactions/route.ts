import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // URL buttons open links client-side; Slack still POSTs an interaction payload it expects acked.
  // Phase 2 will add signature verification + real action handling here.
  try {
    await req.text();
  } catch {
    /* ignore */
  }
  return new NextResponse(null, { status: 200 });
}
