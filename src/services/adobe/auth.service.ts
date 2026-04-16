import axios, { AxiosError } from 'axios';
import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { retryWithBackoff } from '@/utils/api-helpers';
import type { AdobeCredentials, AuthToken } from '@/types';

const logger = createLogger('AdobeAuthService');

// ============================================================================
// Types
// ============================================================================

interface IMSTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

interface IMSErrorResponse {
  error: string;
  error_description: string;
}

// ============================================================================
// Adobe IMS OAuth Service
// ============================================================================

export class AdobeAuthService {
  private imsUrl: string;

  constructor() {
    this.imsUrl = config.adobe.imsUrl;
  }

  /**
   * Get OAuth access token using client credentials (OAuth Server-to-Server)
   */
  async getAccessToken(credentials: AdobeCredentials): Promise<AuthToken> {
    logger.info('Requesting Adobe IMS access token', {
      orgId: credentials.orgId,
      clientId: credentials.clientId,
    });

    return retryWithBackoff(
      async () => {
        try {
          const response = await axios.post<IMSTokenResponse>(
            `${this.imsUrl}${adobeEndpoints.auth.token}`,
            new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: credentials.clientId,
              client_secret: credentials.clientSecret,
              scope: [
                'openid',
                'AdobeID',
                'read_organizations',
                'additional_info.projectedProductContext',
                'additional_info.roles',
              ].join(','),
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            }
          );

          logger.info('Successfully obtained access token', {
            expiresIn: response.data.expires_in,
          });

          return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            tokenType: response.data.token_type,
            expiresIn: response.data.expires_in,
          };
        } catch (error) {
          const axiosError = error as AxiosError<IMSErrorResponse>;
          const errorMessage =
            axiosError.response?.data?.error_description ||
            axiosError.message ||
            'Unknown error';

          logger.error('Failed to obtain access token', {
            error: errorMessage,
            status: axiosError.response?.status,
          });

          throw new Error(`Adobe IMS authentication failed: ${errorMessage}`);
        }
      },
      {
        maxAttempts: 3,
        onRetry: (attempt, error) => {
          logger.warn(`Auth retry attempt ${attempt}`, { error: error.message });
        },
      }
    );
  }

  /**
   * Validate credentials by attempting to get an access token
   */
  async validateCredentials(credentials: AdobeCredentials): Promise<boolean> {
    try {
      await this.getAccessToken(credentials);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get headers required for Adobe Platform API calls
   */
  getApiHeaders(
    accessToken: string,
    orgId: string,
    sandboxName: string = 'prod'
  ): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': '', // Will be set per-request with client ID
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandboxName,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Get headers required for Adobe Reactor API calls
   */
  getReactorHeaders(
    accessToken: string,
    orgId: string
  ): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': '', // Will be set per-request with client ID
      'x-gw-ims-org-id': orgId,
      Accept: 'application/vnd.api+json;revision=1',
      'Content-Type': 'application/vnd.api+json',
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const adobeAuthService = new AdobeAuthService();
