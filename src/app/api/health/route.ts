import { NextResponse } from 'next/server';
import { isDatabaseConnected } from '@/lib/database';

export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    version: process.env.npm_package_version || '1.0.0',
  };

  const httpStatus = health.database === 'connected' ? 200 : 503;

  return NextResponse.json(health, { status: httpStatus });
}
