// Core Services
export { AdobeAuthService, adobeAuthService } from './auth.service';
export { AdobeBaseClient, type ClientOptions } from './base-client';

// Schema & Data Services
export { SchemaService, createSchemaService } from './schema.service';
export { DatasetService, createDatasetService } from './dataset.service';
export { AudienceService, createAudienceService } from './audience.service';
export { ReactorService, createReactorService } from './reactor.service';

// Identity Service
export { IdentityService, createIdentityService } from './identity.service';

// Profile Service (Merge Policies, Computed Attributes)
export { ProfileService, createProfileService } from './profile.service';

// Flow Service (Sources & Destinations)
export { FlowService, createFlowService } from './flow.service';

// Sandbox & Sandbox Tooling Service
export { SandboxToolingService, createSandboxToolingService } from './sandbox-tooling.service';

// Policy Service (Data Governance)
export { PolicyService, createPolicyService } from './policy.service';

// CJA Services
export {
  CJAConnectionService,
  createCJAConnectionService,
  CJADataViewService,
  createCJADataViewService,
  CJASegmentService,
  createCJASegmentService,
  CJACalculatedMetricService,
  createCJACalculatedMetricService,
} from '../cja';
