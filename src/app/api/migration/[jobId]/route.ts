import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/utils/logger';

const logger = createLogger('API:Migration:Status');

// Access global migration jobs
declare global {
  var migrationJobs: Map<string, any> | undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    const migrationJobs = global.migrationJobs;
    if (!migrationJobs) {
      return NextResponse.json(
        { error: 'No migration jobs found' },
        { status: 404 }
      );
    }

    const job = migrationJobs.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Migration job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      totalAssets: job.totalAssets,
      completedAssets: job.completedAssets,
      failedAssets: job.failedAssets,
      skippedAssets: job.skippedAssets,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      assets: job.assets.map((asset: any) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        status: asset.status,
        error: asset.error,
        sourceId: asset.sourceId,
        targetId: asset.targetId,
      })),
    });
  } catch (error) {
    logger.error('Error fetching migration status', { error });

    return NextResponse.json(
      { error: 'Failed to fetch migration status' },
      { status: 500 }
    );
  }
}
