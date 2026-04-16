import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================================================
// Sub-document Interfaces
// ============================================================================

export interface IMigrationAsset {
  id: string;
  type:
    | 'fieldGroup'
    | 'schema'
    | 'dataset'
    | 'audience'
    | 'launchProperty'
    | 'launchExtension'
    | 'launchDataElement'
    | 'launchRule'
    | 'launchEnvironment'
    // New asset types
    | 'identityNamespace'
    | 'mergePolicy'
    | 'computedAttribute'
    | 'flowConnection'
    | 'dataFlow'
    | 'sandbox'
    | 'dataUsageLabel'
    | 'governancePolicy';
  name: string;
  sourceId: string;
  targetId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  error?: string;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

export interface IMigrationLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  assetId?: string;
  assetType?: string;
  details?: Record<string, unknown>;
}

export interface IIdMapping {
  assetType: string;
  sourceId: string;
  targetId: string;
  name: string;
}

export interface IMigrationOptions {
  dryRun: boolean;
  conflictStrategy: 'skip' | 'overwrite' | 'rename';
  copyDependencies: boolean;
  includePublishing: boolean;
}

// ============================================================================
// Main Interface
// ============================================================================

export interface IMigrationJob extends Document {
  sourceOrg: mongoose.Types.ObjectId;
  targetOrg: mongoose.Types.ObjectId;
  assets: IMigrationAsset[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalAssets: number;
  completedAssets: number;
  failedAssets: number;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  logs: IMigrationLog[];
  idMappings: IIdMapping[];
  options: IMigrationOptions;
  createdAt: Date;
  updatedAt: Date;
  // Methods
  addLog(
    level: 'info' | 'warn' | 'error' | 'success',
    message: string,
    assetId?: string,
    assetType?: string,
    details?: Record<string, unknown>
  ): void;
  updateAssetStatus(
    assetId: string,
    status: IMigrationAsset['status'],
    targetId?: string,
    error?: string
  ): void;
  addIdMapping(
    assetType: string,
    sourceId: string,
    targetId: string,
    name: string
  ): void;
  getMapping(sourceId: string): IIdMapping | undefined;
  updateProgress(): void;
}

// ============================================================================
// Sub-document Schemas
// ============================================================================

const MigrationAssetSchema = new Schema<IMigrationAsset>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'fieldGroup',
        'schema',
        'dataset',
        'audience',
        'launchProperty',
        'launchExtension',
        'launchDataElement',
        'launchRule',
        'launchEnvironment',
      ],
      required: true,
    },
    name: { type: String, required: true },
    sourceId: { type: String, required: true },
    targetId: { type: String },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    error: { type: String },
    dependencies: [{ type: String }],
    metadata: { type: Schema.Types.Mixed },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { _id: false }
);

const MigrationLogSchema = new Schema<IMigrationLog>(
  {
    id: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'success'],
      required: true,
    },
    message: { type: String, required: true },
    assetId: { type: String },
    assetType: { type: String },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const IdMappingSchema = new Schema<IIdMapping>(
  {
    assetType: { type: String, required: true },
    sourceId: { type: String, required: true },
    targetId: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const MigrationOptionsSchema = new Schema<IMigrationOptions>(
  {
    dryRun: { type: Boolean, default: false },
    conflictStrategy: {
      type: String,
      enum: ['skip', 'overwrite', 'rename'],
      default: 'skip',
    },
    copyDependencies: { type: Boolean, default: true },
    includePublishing: { type: Boolean, default: false },
  },
  { _id: false }
);

// ============================================================================
// Main Schema
// ============================================================================

const MigrationJobSchema = new Schema<IMigrationJob>(
  {
    sourceOrg: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    targetOrg: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    assets: [MigrationAssetSchema],
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    progress: { type: Number, default: 0 },
    totalAssets: { type: Number, default: 0 },
    completedAssets: { type: Number, default: 0 },
    failedAssets: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    logs: [MigrationLogSchema],
    idMappings: [IdMappingSchema],
    options: {
      type: MigrationOptionsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================================
// Indexes
// ============================================================================

MigrationJobSchema.index({ createdBy: 1, createdAt: -1 });
MigrationJobSchema.index({ status: 1 });
MigrationJobSchema.index({ sourceOrg: 1, targetOrg: 1 });

// ============================================================================
// Methods
// ============================================================================

MigrationJobSchema.methods.addLog = function (
  level: 'info' | 'warn' | 'error' | 'success',
  message: string,
  assetId?: string,
  assetType?: string,
  details?: Record<string, unknown>
): void {
  this.logs.push({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    level,
    message,
    assetId,
    assetType,
    details,
  });
};

MigrationJobSchema.methods.updateAssetStatus = function (
  assetId: string,
  status: IMigrationAsset['status'],
  targetId?: string,
  error?: string
): void {
  const asset = this.assets.find((a: IMigrationAsset) => a.id === assetId);
  if (asset) {
    asset.status = status;
    if (targetId) asset.targetId = targetId;
    if (error) asset.error = error;
    if (status === 'in_progress') asset.startedAt = new Date();
    if (status === 'completed' || status === 'failed') {
      asset.completedAt = new Date();
    }
  }
  this.updateProgress();
};

MigrationJobSchema.methods.addIdMapping = function (
  assetType: string,
  sourceId: string,
  targetId: string,
  name: string
): void {
  this.idMappings.push({ assetType, sourceId, targetId, name });
};

MigrationJobSchema.methods.getMapping = function (
  sourceId: string
): IIdMapping | undefined {
  return this.idMappings.find((m: IIdMapping) => m.sourceId === sourceId);
};

MigrationJobSchema.methods.updateProgress = function (): void {
  const total = this.assets.length;
  const completed = this.assets.filter(
    (a: IMigrationAsset) => a.status === 'completed' || a.status === 'skipped'
  ).length;
  const failed = this.assets.filter(
    (a: IMigrationAsset) => a.status === 'failed'
  ).length;

  this.totalAssets = total;
  this.completedAssets = completed;
  this.failedAssets = failed;
  this.progress = total > 0 ? Math.round((completed / total) * 100) : 0;
};

// ============================================================================
// Model
// ============================================================================

export const MigrationJob: Model<IMigrationJob> =
  mongoose.models.MigrationJob ||
  mongoose.model<IMigrationJob>('MigrationJob', MigrationJobSchema);
