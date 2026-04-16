import { NextRequest, NextResponse } from 'next/server';
import { adobeAuthService } from '@/services/adobe';
import { createLogger } from '@/utils/logger';

const logger = createLogger('API:Organizations:Validate');

// In-memory storage for demo mode (when MongoDB is not available)
// In production, use MongoDB
interface StoredOrg {
  id: string;
  name: string;
  type: 'source' | 'target';
  credentials: {
    clientId: string;
    clientSecret: string;
    orgId: string;
    sandboxName: string;
  };
  accessToken: string;
  tokenExpiresAt: Date;
}

// Global in-memory store (persists during server runtime)
declare global {
  var orgStore: Map<string, any> | undefined;
}

if (!global.orgStore) {
  global.orgStore = new Map();
}

const orgStore = global.orgStore;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientId, clientSecret, orgId, sandboxName, type } = body;

    // Validate required fields
    if (!clientId || !clientSecret || !orgId || !sandboxName || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Extract org name from orgId (e.g., "ABCD1234@AdobeOrg" -> "ABCD1234")
    const orgName = orgId.split('@')[0];

    if (type !== 'source' && type !== 'target') {
      return NextResponse.json(
        { success: false, error: 'Invalid organization type' },
        { status: 400 }
      );
    }

    logger.info('Validating organization credentials', { orgId, type });

    // Validate credentials with Adobe IMS
    const credentials = { clientId, clientSecret, orgId, sandboxName };

    try {
      const authResponse = await adobeAuthService.getAccessToken(credentials);

      // Generate a unique ID for this org
      const orgKey = `${type}-${orgId}`;
      const orgDbId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store in memory
      const storedOrg: StoredOrg = {
        id: orgDbId,
        name: orgName,
        type,
        credentials: {
          clientId,
          clientSecret,
          orgId,
          sandboxName,
        },
        accessToken: authResponse.accessToken,
        tokenExpiresAt: new Date(Date.now() + authResponse.expiresIn * 1000),
      };

      orgStore.set(orgKey, storedOrg);

      logger.info('Organization validated and stored', {
        id: orgDbId,
        orgName,
      });

      return NextResponse.json({
        success: true,
        organizationId: orgDbId,
        orgName: orgName,
        sandboxName: sandboxName,
        accessToken: authResponse.accessToken,
        tokenExpiresAt: new Date(Date.now() + authResponse.expiresIn * 1000).toISOString(),
        message: 'Credentials validated successfully',
      });
    } catch (authError) {
      logger.error('Authentication failed', { error: (authError as Error).message });

      return NextResponse.json(
        {
          success: false,
          error: `Authentication failed: ${(authError as Error).message}`,
        },
        { status: 401 }
      );
    }
  } catch (error) {
    logger.error('Error validating organization', { error });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Note: orgStore is accessible via global.orgStore in other API routes
