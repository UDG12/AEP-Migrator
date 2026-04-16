import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/database';
import { MigrationJob } from '@/models';
import { migrationService } from '@/services/migration.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('API:Migration:Retry');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    await connectToDatabase();

    const job = await MigrationJob.findById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Migration job not found' },
        { status: 404 }
      );
    }

    // Reset failed assets to pending
    let resetCount = 0;
    job.assets.forEach((asset) => {
      if (asset.status === 'failed') {
        asset.status = 'pending';
        asset.error = undefined;
        asset.startedAt = undefined;
        asset.completedAt = undefined;
        resetCount++;
      }
    });

    if (resetCount === 0) {
      return NextResponse.json(
        { error: 'No failed assets to retry' },
        { status: 400 }
      );
    }

    // Reset job status
    job.status = 'pending';
    job.completedAt = undefined;
    job.failedAssets = 0;
    job.addLog('info', `Retrying ${resetCount} failed assets`);

    await job.save();

    logger.info('Retrying failed assets', { jobId, resetCount });

    // Restart migration in background
    setImmediate(async () => {
      try {
        await migrationService.executeMigration(job._id.toString());
      } catch (error) {
        logger.error('Migration retry failed', {
          jobId: job._id,
          error: (error as Error).message,
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: `Retrying ${resetCount} failed assets`,
    });
  } catch (error) {
    logger.error('Error retrying migration', { error });

    return NextResponse.json(
      { error: 'Failed to retry migration' },
      { status: 500 }
    );
  }
}
