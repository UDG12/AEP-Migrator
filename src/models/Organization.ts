import mongoose, { Schema, Document, Model } from 'mongoose';
import { encrypt, decrypt } from '@/utils/encryption';

// ============================================================================
// Interface
// ============================================================================

export interface IOrganization extends Document {
  name: string;
  type: 'source' | 'target';
  credentials: {
    clientId: string;
    clientSecret: string; // Encrypted
    orgId: string;
    technicalAccountId?: string;
    sandboxName: string;
  };
  accessToken?: string; // Encrypted
  tokenExpiresAt?: Date;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  // Methods
  getDecryptedCredentials(): {
    clientId: string;
    clientSecret: string;
    orgId: string;
    technicalAccountId?: string;
    sandboxName: string;
  };
  getDecryptedToken(): string | null;
  setAccessToken(token: string, expiresIn: number): void;
  isTokenValid(): boolean;
}

// ============================================================================
// Schema
// ============================================================================

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    type: {
      type: String,
      enum: ['source', 'target'],
      required: [true, 'Organization type is required'],
    },
    credentials: {
      clientId: {
        type: String,
        required: [true, 'Client ID is required'],
        trim: true,
      },
      clientSecret: {
        type: String,
        required: [true, 'Client Secret is required'],
      },
      orgId: {
        type: String,
        required: [true, 'Organization ID is required'],
        trim: true,
      },
      technicalAccountId: {
        type: String,
        trim: true,
      },
      sandboxName: {
        type: String,
        required: [true, 'Sandbox name is required'],
        default: 'prod',
        trim: true,
      },
    },
    accessToken: {
      type: String,
    },
    tokenExpiresAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSyncedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================================
// Indexes
// ============================================================================

OrganizationSchema.index({ createdBy: 1, type: 1 });
OrganizationSchema.index({ 'credentials.orgId': 1 });

// ============================================================================
// Pre-save Hook - Encrypt Sensitive Data
// ============================================================================

OrganizationSchema.pre('save', function (next) {
  if (this.isModified('credentials.clientSecret')) {
    this.credentials.clientSecret = encrypt(this.credentials.clientSecret);
  }
  if (this.isModified('accessToken') && this.accessToken) {
    this.accessToken = encrypt(this.accessToken);
  }
  next();
});

// ============================================================================
// Methods
// ============================================================================

OrganizationSchema.methods.getDecryptedCredentials = function () {
  return {
    clientId: this.credentials.clientId,
    clientSecret: decrypt(this.credentials.clientSecret),
    orgId: this.credentials.orgId,
    technicalAccountId: this.credentials.technicalAccountId,
    sandboxName: this.credentials.sandboxName,
  };
};

OrganizationSchema.methods.getDecryptedToken = function (): string | null {
  if (!this.accessToken) return null;
  return decrypt(this.accessToken);
};

OrganizationSchema.methods.setAccessToken = function (
  token: string,
  expiresIn: number
): void {
  this.accessToken = token; // Will be encrypted in pre-save
  this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
};

OrganizationSchema.methods.isTokenValid = function (): boolean {
  if (!this.accessToken || !this.tokenExpiresAt) return false;
  // Add 5 minute buffer
  return new Date() < new Date(this.tokenExpiresAt.getTime() - 5 * 60 * 1000);
};

// ============================================================================
// Model
// ============================================================================

export const Organization: Model<IOrganization> =
  mongoose.models.Organization ||
  mongoose.model<IOrganization>('Organization', OrganizationSchema);
