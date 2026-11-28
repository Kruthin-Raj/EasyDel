import { NextResponse } from 'next/server';
import { resolveApkRelease } from '@/lib/app-release';

export const dynamic = 'force-dynamic';

export async function GET() {
  const release = await resolveApkRelease();
  return NextResponse.json(release, { headers: { 'Cache-Control': 'no-store' } });
}
