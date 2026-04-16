/**
 * Service Validation Script
 *
 * Run this script to test all new services against your Adobe Experience Platform.
 *
 * Usage:
 *   npx ts-node scripts/test-services.ts
 *
 * Required Environment Variables (add to .env.local):
 *   ADOBE_CLIENT_ID - Your Adobe IMS client ID
 *   ADOBE_CLIENT_SECRET - Your Adobe IMS client secret
 *   ADOBE_ORG_ID - Your Adobe organization ID
 *   ADOBE_SANDBOX_NAME - Your sandbox name (e.g., 'prod', 'dev')
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Load .env.local file manually (no dotenv dependency)
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value !== undefined && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}
loadEnvFile();

// Configuration
const IMS_URL = process.env.ADOBE_IMS_URL || 'https://ims-na1.adobelogin.com';
const PLATFORM_URL = process.env.ADOBE_PLATFORM_URL || 'https://platform.adobe.io';

const CLIENT_ID = process.env.ADOBE_CLIENT_ID;
const CLIENT_SECRET = process.env.ADOBE_CLIENT_SECRET;
const ORG_ID = process.env.ADOBE_ORG_ID;
const SANDBOX_NAME = process.env.ADOBE_SANDBOX_NAME || 'prod';

interface TestResult {
  service: string;
  endpoint: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  responseTime?: number;
}

const results: TestResult[] = [];

async function getAccessToken(): Promise<string> {
  console.log('\n🔐 Authenticating with Adobe IMS...\n');

  if (!CLIENT_ID || !CLIENT_SECRET || !ORG_ID) {
    throw new Error('Missing required environment variables: ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_ORG_ID');
  }

  const response = await axios.post(
    `${IMS_URL}/ims/token/v3`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'openid,AdobeID,read_organizations,additional_info.projectedProductContext',
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  console.log('✅ Authentication successful!\n');
  return response.data.access_token;
}

function getHeaders(accessToken: string) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'x-api-key': CLIENT_ID!,
    'x-gw-ims-org-id': ORG_ID!,
    'x-sandbox-name': SANDBOX_NAME,
    'Accept': 'application/json',
  };
}

async function testEndpoint(
  service: string,
  endpoint: string,
  url: string,
  headers: Record<string, string>
): Promise<void> {
  const startTime = Date.now();

  try {
    const response = await axios.get(url, { headers, timeout: 30000 });
    const responseTime = Date.now() - startTime;

    results.push({
      service,
      endpoint,
      status: 'PASS',
      message: `Status ${response.status} - ${getItemCount(response.data)} items`,
      responseTime,
    });

    console.log(`  ✅ ${endpoint}: ${response.status} (${responseTime}ms)`);
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    // 403/404 might be expected for some endpoints (no permission or not available)
    if (status === 403 || status === 404) {
      results.push({
        service,
        endpoint,
        status: 'SKIP',
        message: `Status ${status} - ${message}`,
        responseTime,
      });
      console.log(`  ⚠️  ${endpoint}: ${status} - ${message} (${responseTime}ms)`);
    } else {
      results.push({
        service,
        endpoint,
        status: 'FAIL',
        message: `Status ${status} - ${message}`,
        responseTime,
      });
      console.log(`  ❌ ${endpoint}: ${status} - ${message} (${responseTime}ms)`);
    }
  }
}

function getItemCount(data: any): number | string {
  if (Array.isArray(data)) return data.length;
  if (data?.results) return data.results.length;
  if (data?.items) return data.items.length;
  if (data?.children) return data.children.length;
  if (data?.sandboxes) return data.sandboxes.length;
  if (data?.labels) return data.labels.length;
  if (data?.policies) return data.policies.length;
  return 'N/A';
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       AEP Migrator - Service Validation Script');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nConfiguration:`);
  console.log(`  Organization: ${ORG_ID}`);
  console.log(`  Sandbox: ${SANDBOX_NAME}`);
  console.log(`  Platform URL: ${PLATFORM_URL}`);

  let accessToken: string;

  try {
    accessToken = await getAccessToken();
  } catch (error: any) {
    console.error('\n❌ Authentication failed:', error.message);
    console.error('\nPlease check your credentials in .env.local:');
    console.error('  ADOBE_CLIENT_ID=your_client_id');
    console.error('  ADOBE_CLIENT_SECRET=your_client_secret');
    console.error('  ADOBE_ORG_ID=your_org_id@AdobeOrg');
    console.error('  ADOBE_SANDBOX_NAME=prod');
    process.exit(1);
  }

  const headers = getHeaders(accessToken);

  // Test Identity Service
  console.log('\n📋 Testing Identity Service...');
  await testEndpoint(
    'Identity',
    'List Namespaces',
    `${PLATFORM_URL}/data/core/idnamespace/identities`,
    headers
  );

  // Test Profile Service
  console.log('\n📋 Testing Profile Service...');
  await testEndpoint(
    'Profile',
    'List Merge Policies',
    `${PLATFORM_URL}/data/core/ups/config/mergePolicies`,
    headers
  );
  await testEndpoint(
    'Profile',
    'List Computed Attributes',
    `${PLATFORM_URL}/data/core/ca/attributes`,
    headers
  );

  // Test Flow Service
  console.log('\n📋 Testing Flow Service...');
  await testEndpoint(
    'Flow Service',
    'List Connection Specs',
    `${PLATFORM_URL}/data/foundation/flowservice/connectionSpecs`,
    headers
  );
  await testEndpoint(
    'Flow Service',
    'List Connections',
    `${PLATFORM_URL}/data/foundation/flowservice/connections`,
    headers
  );
  await testEndpoint(
    'Flow Service',
    'List Flows',
    `${PLATFORM_URL}/data/foundation/flowservice/flows`,
    headers
  );

  // Test Sandbox Service
  console.log('\n📋 Testing Sandbox Service...');
  await testEndpoint(
    'Sandbox',
    'List Sandboxes',
    `${PLATFORM_URL}/data/foundation/sandbox-management/sandboxes`,
    headers
  );

  // Test Sandbox Tooling
  console.log('\n📋 Testing Sandbox Tooling...');
  await testEndpoint(
    'Sandbox Tooling',
    'List Packages',
    `${PLATFORM_URL}/data/foundation/exim/packages`,
    headers
  );

  // Test Policy Service
  console.log('\n📋 Testing Policy Service...');
  await testEndpoint(
    'Policy',
    'List Labels',
    `${PLATFORM_URL}/data/foundation/dulepolicy/labels`,
    headers
  );
  await testEndpoint(
    'Policy',
    'List Policies',
    `${PLATFORM_URL}/data/foundation/dulepolicy/policies`,
    headers
  );
  await testEndpoint(
    'Policy',
    'List Marketing Actions',
    `${PLATFORM_URL}/data/foundation/dulepolicy/marketingActions`,
    headers
  );

  // Test existing services (Schema, Dataset, Audiences)
  console.log('\n📋 Testing Existing Services...');
  await testEndpoint(
    'Schema Registry',
    'List Schemas',
    `${PLATFORM_URL}/data/foundation/schemaregistry/tenant/schemas`,
    { ...headers, 'Accept': 'application/vnd.adobe.xed-id+json' }
  );
  await testEndpoint(
    'Catalog',
    'List Datasets',
    `${PLATFORM_URL}/data/foundation/catalog/datasets`,
    headers
  );
  await testEndpoint(
    'Segmentation',
    'List Audiences',
    `${PLATFORM_URL}/data/core/ups/segment/definitions`,
    headers
  );

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                        SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⚠️  Skipped: ${skipped} (no permission or not available)`);
  console.log(`  📊 Total:   ${results.length}`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.service}: ${r.endpoint} - ${r.message}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Script error:', error.message);
  process.exit(1);
});
