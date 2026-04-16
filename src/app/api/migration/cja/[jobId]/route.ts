import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/utils/logger';

const logger = createLogger('API:CJAMigration:Job');

// Access the global CJA migration jobs
declare global {
  var cjaMigrationJobs: Map<string, any> | undefined;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const cjaMigrationJobs = global.cjaMigrationJobs;
    if (!cjaMigrationJobs) {
      return NextResponse.json(
        { error: 'No CJA migration jobs found' },
        { status: 404 }
      );
    }

    const job = cjaMigrationJobs.get(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'CJA migration job not found' },
        { status: 404 }
      );
    }

    // Convert Map to object for JSON serialization
    const idMappings: Record<string, string> = {};
    for (const [key, value] of job.idMappings.entries()) {
      idMappings[key] = value;
    }

    return NextResponse.json({
      ...job,
      idMappings,
    });
  } catch (error) {
    logger.error('Error fetching CJA migration job', { error });

    return NextResponse.json(
      { error: 'Failed to fetch CJA migration job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    const cjaMigrationJobs = global.cjaMigrationJobs;
    if (!cjaMigrationJobs) {
      return NextResponse.json(
        { error: 'No CJA migration jobs found' },
        { status: 404 }
      );
    }

    const job = cjaMigrationJobs.get(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'CJA migration job not found' },
        { status: 404 }
      );
    }

    // Cancel the job if it's still running
    if (job.status === 'running') {
      job.status = 'cancelled';
      job.updatedAt = new Date();
    }

    // Remove the job
    cjaMigrationJobs.delete(jobId);

    return NextResponse.json({
      success: true,
      message: 'CJA migration job deleted',
    });
  } catch (error) {
    logger.error('Error deleting CJA migration job', { error });

    return NextResponse.json(
      { error: 'Failed to delete CJA migration job' },
      { status: 500 }
    );
  }
}
