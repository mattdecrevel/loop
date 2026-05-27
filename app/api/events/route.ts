import { NextRequest, NextResponse } from 'next/server';
import { authenticateProject } from '@/lib/auth';
import { validateIngest, ingestEvent } from '@/lib/ingest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const project = await authenticateProject(req.headers.get('authorization'));
  if (!project) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const v = validateIngest(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const result = await ingestEvent(project, v.event);
  return NextResponse.json(result, { status: 202 });
}
