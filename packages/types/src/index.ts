import { z } from 'zod';

// API Types
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  commitSha: z.string(),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// Epic-01: Structured Authoring & Collaboration Types

// Role Types
export const RoleSchema = z.enum(['ADMIN', 'EDITOR', 'REVIEWER', 'READER']);
export type Role = z.infer<typeof RoleSchema>;

// User Types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type User = z.infer<typeof UserSchema>;

// Organization Types
export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Organization = z.infer<typeof OrganizationSchema>;

// Membership Types
export const MembershipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Membership = z.infer<typeof MembershipSchema>;

// Attachment Types
export const AttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  originalFileName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  uploadedBy: z.string(),
  uploadedAt: z.string(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

// TipTap Block Types
export const TipTapNodeSchema = z.object({
  type: z.string(),
  attrs: z.record(z.unknown()).optional(),
  content: z.array(z.unknown()).optional(),
});

export const TipTapDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(TipTapNodeSchema),
});

export type TipTapNode = z.infer<typeof TipTapNodeSchema>;
export type TipTapDocument = z.infer<typeof TipTapDocumentSchema>;

// Smart Block Types
export const SmartBlockTypeSchema = z.enum(['LEP', 'MEL', 'ChangeLog', 'RevisionBar', 'CrossRef']);
export type SmartBlockType = z.infer<typeof SmartBlockTypeSchema>;

export const SmartBlockSchema = z.object({
  type: SmartBlockTypeSchema,
  config: z.record(z.unknown()),
  content: TipTapDocumentSchema,
});

export type SmartBlock = z.infer<typeof SmartBlockSchema>;

// Block Types
export const BlockSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  content: TipTapDocumentSchema,
  smartBlock: SmartBlockSchema.optional(),
  attachments: z.array(z.string()), // Attachment IDs
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Block = z.infer<typeof BlockSchema>;

// Section Types
export const SectionStatusSchema = z.enum(['DRAFT', 'RELEASED']);
export type SectionStatus = z.infer<typeof SectionStatusSchema>;

export const SectionSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  title: z.string(),
  number: z.string(),
  status: SectionStatusSchema,
  blocks: z.array(BlockSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Section = z.infer<typeof SectionSchema>;

// Chapter Types
export const ChapterSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  title: z.string(),
  number: z.string(),
  sections: z.array(SectionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Chapter = z.infer<typeof ChapterSchema>;

// Manual Types
export const ManualStatusSchema = z.enum(['DRAFT', 'RELEASED']);
export type ManualStatus = z.infer<typeof ManualStatusSchema>;

export const ManualSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  title: z.string(),
  status: ManualStatusSchema,
  chapters: z.array(ChapterSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Manual = z.infer<typeof ManualSchema>;

// Version Types
export const VersionSchema = z.object({
  id: z.string(),
  etag: z.string(),
  manualId: z.string(),
  chapterId: z.string().optional(),
  sectionId: z.string().optional(),
  blockId: z.string().optional(),
  changeSetId: z.string(),
  createdAt: z.string(),
});

export type Version = z.infer<typeof VersionSchema>;

// ChangeSet Types
export const ChangeTypeSchema = z.enum(['CREATE', 'UPDATE', 'DELETE', 'MERGE']);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const ChangeSchema = z.object({
  id: z.string(),
  changeSetId: z.string(),
  entityType: z.enum(['manual', 'chapter', 'section', 'block']),
  entityId: z.string(),
  changeType: ChangeTypeSchema,
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  diff: z.string().optional(),
});

export type Change = z.infer<typeof ChangeSchema>;

export const ChangeSetSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  authorId: z.string(),
  changes: z.array(ChangeSchema),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'MERGED']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChangeSet = z.infer<typeof ChangeSetSchema>;

// ReleaseSnapshot Types
export const ReleaseSnapshotSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  changeSetId: z.string(),
  version: z.string(),
  contentSnapshot: z.record(z.unknown()),
  createdAt: z.string(),
});

export type ReleaseSnapshot = z.infer<typeof ReleaseSnapshotSchema>;

// Template Types
export const TemplateSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  blocks: z.array(TipTapDocumentSchema),
  smartBlocks: z.array(SmartBlockSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Template = z.infer<typeof TemplateSchema>;

// ETag and Optimistic Locking Types
export const ETagValidationSchema = z.object({
  ifMatch: z.string().optional(),
  etag: z.string(),
});

export type ETagValidation = z.infer<typeof ETagValidationSchema>;

export const ConflictErrorSchema = z.object({
  type: z.literal('conflict_error'),
  message: z.string(),
  currentEtag: z.string(),
  providedEtag: z.string().optional(),
});

export type ConflictError = z.infer<typeof ConflictErrorSchema>;

// Editor Types
export const EditorSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sectionId: z.string(),
  version: VersionSchema,
  isActive: z.boolean(),
  lastActivity: z.string(),
});

export type EditorSession = z.infer<typeof EditorSessionSchema>;

// Auth Types
export const AuthConfigSchema = z.object({
  provider: z.enum(['auth0', 'entra', 'keycloak']),
  clientId: z.string(),
  domain: z.string(),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// Shared API Response Types
export const ApiErrorSchema = z.object({
  type: 'validation_error' | 'authentication_error' | 'authorization_error' | 'not_found' | 'internal_error' | 'conflict_error',
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: ApiErrorSchema.optional(),
  etag: z.string().optional(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

// Diff Engine Types
export const DiffResultSchema = z.object({
  type: z.enum(['text', 'node', 'attribute']),
  path: z.string(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
});

export type DiffResult = z.infer<typeof DiffResultSchema>;

export const DiffSchema = z.object({
  changes: z.array(DiffResultSchema),
  summary: z.object({
    added: z.number(),
    removed: z.number(),
    modified: z.number(),
  }),
});

export type Diff = z.infer<typeof DiffSchema>;

// Epic-02: Configurable Review & Approval Types

// Workflow Definition Types
export const WorkflowStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  requiredRoles: z.array(RoleSchema),
  autoApproveConditions: z.array(z.string()).optional(), // JSON logic conditions
  approvalThreshold: z.number().min(1).optional(), // Minimum approvals required
  allowsRejection: z.boolean().default(true),
  maxDurationHours: z.number().optional(),
  nextStageId: z.string().optional(),
  parallelStages: z.array(z.string()).optional(), // IDs of stages that can run simultaneously
});

export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  entityType: z.enum(['manual', 'chapter', 'section']), // What can this workflow be applied to
  stages: z.array(WorkflowStageSchema),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// Approval Task Types
export const TaskStatusSchema = z.enum([
  'PENDING',      // Waiting for reviewer action
  'APPROVED',     // Reviewer approved
  'REJECTED',     // Reviewer rejected
  'DELEGATED',    // Task delegated to another user
  'SUSPENDED',    // Task suspended due to workflow conditions
  'COMPLETED',    // Task completed (for multi-stage approvals)
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ApprovalTaskSchema = z.object({
  id: z.string(),
  workflowInstanceId: z.string(),
  stageId: z.string(),
  assignedToUserId: z.string(),
  entityType: z.enum(['manual', 'chapter', 'section']),
  entityId: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  status: TaskStatusSchema,
  dueAt: z.string().optional(),
  completedAt: z.string().optional(),
  completedByUserId: z.string().optional(),
  commentsCount: z.number().default(0),
  attachments: z.array(z.string()), // Attachment IDs
  metadata: z.record(z.unknown()).optional(), // Flexible metadata (task context, custom fields)
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApprovalTask = z.infer<typeof ApprovalTaskSchema>;

// Workflow Instance Types
export const WorkflowInstanceStatusSchema = z.enum([
  'DRAFT',        // Being prepared/submitted
  'IN_PROGRESS',  // Currently executing
  'APPROVED',     // All stages approved
  'REJECTED',     // At least one stage rejected
  'SUSPENDED',    // Temporarily paused
  'CANCELLED',    // Workflow cancelled
  'COMPLETED',    // Fully completed
]);

export type WorkflowInstanceStatus = z.infer<typeof WorkflowInstanceStatusSchema>;

export const WorkflowInstanceSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  entityType: z.enum(['manual', 'chapter', 'section']),
  entityId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  initiatedByUserId: z.string(),
  currentStageId: z.string().optional(),
  status: WorkflowInstanceStatusSchema,
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  metadata: z.record(z.unknown()).optional(),
  scheduledAt: z.string().optional(), // For deferred start
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  cancelledByUserId: z.string().optional(),
  rejectionReason: z.string().optional(),
  tasks: z.array(ApprovalTaskSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;

// Comment Types
export const CommentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  userId: z.string(),
  content: z.string(),
  type: z.enum(['general', 'approval_reason', 'rejection_reason', 'delegation_note']).default('general'),
  isInternal: z.boolean().default(false), // Internal vs external comments
  attachments: z.array(z.string()), // Attachment IDs
  mentionedUserIds: z.array(z.string()).optional(), // @mentions for notifications
  parentCommentId: z.string().optional(), // For threaded discussions
  isResolved: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Comment = z.infer<typeof CommentSchema>;

// Checklist Types  
export const ChecklistItemSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(), // Optional for standalone checklists
  title: z.string(),
  description: z.string().optional(),
  isRequired: z.boolean().default(false),
  category: z.string().optional(), // Group related items
  sortOrder: z.number(),
  isChecked: z.boolean().default(false),
  checkedByUserId: z.string().optional(),
  checkedAt: z.string().optional(),
  notes: z.string().optional(),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  workflowInstanceId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  organizationId: z.string(),
  type: z.enum(['audit', 'review', 'compliance', 'custom']).default('audit'),
  templateId: z.string().optional(), // Reference to checklist template
  items: z.array(ChecklistItemSchema),
  isComplete: z.boolean().default(false),
  completedAt: z.string().optional(),
  completedByUserId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Checklist = z.infer<typeof ChecklistSchema>;

// Notification Types
export const NotificationChannelSchema = z.enum(['email', 'web_push', 'in_app', 'slack']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

export const NotificationTypeSchema = z.enum([
  'task_assigned',
  'task_due_soon',
  'task_overdue', 
  'comment_added',
  'workflow_status_change',
  'approval_request',
  'rejection_with_comments',
  'mention',
]);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  channels: z.array(NotificationChannelSchema),
  entityType: z.enum(['task', 'workflow_instance', 'comment']).optional(),
  entityId: z.string().optional(),
  isRead: z.boolean().default(false),
  readAt: z.string().optional(),
  scheduledFor: z.string().optional(), // For delayed/reminder notifications
  deliveredAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});

export type Notification = z.infer<typeof NotificationSchema>;

// PDF Generator Types
export const ValidationSignatureSchema = z.object({
  signerName: z.string(),
  signerRole: z.string(),
  signatureDate: z.string(),
  signaturePath: z.string().optional(), // Encrypted PDF signature
});

export type ValidationSignature = z.infer<typeof ValidationSignatureSchema>;

export const ApprovalLetterSchema = z.object({
  organizationName: z.string(),
  organizationLogoUrl: z.string().optional(),
  documentTitle: z.string(),
  documentType: z.string(),
  version: z.string(),
  workflowInstanceId: z.string(),
  approvalDetails: z.array(z.object({
    stageName: z.string(),
    approverName: z.string(),
    approverRole: z.string(),
    approvedAt: z.string(),
    comments: z.string().optional(),
  })),
  signatures: z.array(ValidationSignatureSchema),
  generatedAt: z.string(),
  validUntil: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ApprovalLetter = z.infer<typeof ApprovalLetterSchema>;

// Template Types for Reusable Configuration
export const ChecklistTemplateSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['audit', 'review', 'compliance', 'custom']).default('audit'),
  isDefault: z.boolean().default(false),
  items: z.array(ChecklistItemSchema.omit({
    taskId: true,
    checkedByUserId: true, 
    checkedAt: true,
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChecklistTemplate = z.infer<typeof ChecklistTemplateSchema>;

// Request/Response DTOs for API
export const CreateWorkflowInstanceDtoSchema = z.object({
  workflowDefinitionId: z.string(),
  entityType: z.enum(['manual', 'chapter', 'section']),
  entityId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  scheduledAt: z.string().optional(),
});

export type CreateWorkflowInstanceDto = z.infer<typeof CreateWorkflowInstanceDtoSchema>;

export const ApproveTaskDtoSchema = z.object({
  comment: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export type ApproveTaskDto = z.infer<typeof ApproveTaskDtoSchema>;

export const RejectTaskDtoSchema = z.object({
  reason: z.string(),
  comment: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export type RejectTaskDto = z.infer<typeof RejectTaskDtoSchema>;

// Workflow Analytics Types
export const WorkflowMetricsSchema = z.object({
  totalInstances: z.number(),
  completedInstances: z.number(),
  averageCompletionTimeHours: z.number(),
  averageTasksPerInstance: z.number(),
  approvalRate: z.number(), // Percentage of approvals vs rejections
  overdueTasksCount: z.number(),
  pendingTasksCount: z.number(),
  timeRange: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
});

export type WorkflowMetrics = z.infer<typeof WorkflowMetricsSchema>;

// Epic-03: Distribution & Reader Types

// Reader Entity Types
export const ReaderBundleSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  releaseSnapshotId: z.string(),
  version: z.string(),
  bundleUrl: z.string(), // CDN URL to static JSON bundle
  bundleSize: z.number(), // Size in bytes
  createdAt: z.string(),
  expiresAt: z.string().optional(), // For time-limited access
});

export type ReaderBundle = z.infer<typeof ReaderBundleSchema>;

// Reader Access Control
export const AccessPermissionSchema = z.object({
  userId: z.string(),
  manualId: z.string(),
  bundleId: z.string(),
  permission: z.enum(['READ', 'ANNOTATE', 'SUGGEST_EDIT', 'ADMIN']),
  grantedBy: z.string(),
  grantedAt: z.string(),
  expiresAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AccessPermission = z.infer<typeof AccessPermissionSchema>;

// Search and Indexing Types
export const SearchIndexSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  bundleId: z.string(),
  searchableText: z.string(),
  indexes: z.object({
    keywords: z.array(z.string()),
    phrases: z.array(z.string()),
    entities: z.array(z.string()), // Named entities (aircraft types, procedures, etc.)
    sections: z.object({
      chapterId: z.string(),
      sectionId: z.string(),
      blockId: z.string(),
      text: z.string(),
      position: z.number(),
    }).array(),
  }),
  createdAt: z.string(),
});

export type SearchIndex = z.infer<typeof SearchIndexSchema>;

export const SearchQuerySchema = z.object({
  query: z.string(),
  manualId: z.string().optional(),
  bundleId: z.string().optional(),
  filters: z.object({
    chapterId: z.string().optional(),
    sectionId: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    entities: z.array(z.string()).optional(),
  }).optional(),
  page: z.number().default(1),
  limit: z.number().default(10),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResultSchema = z.object({
  results: z.array(z.object({
    manualId: z.string(),
    chapterId: z.string(),
    sectionId: z.string(),
    blockId: z.string(),
    title: z.string(),
    excerpt: z.string(),
    highlight: z.string(),
    relevanceScore: z.number(),
    position: z.number(),
  })),
  totalResults: z.number(),
  page: z.number(),
  limit: z.number(),
  query: z.string(),
  processingTimeMs: z.number(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

// Annotations and Notes Types
export const AnnotationTypeSchema = z.enum(['HIGHLIGHT', 'NOTE', 'COMMENT', 'QUESTION', 'WARNING']);
export type AnnotationType = z.infer<typeof AnnotationTypeSchema>;

export const AnnotationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  manualId: z.string(),
  bundleId: z.string(),
  chapterId: z.string(),
  sectionId: z.string(),
  blockId: z.string(),
  selector: z.string(), // CSS selector or text range for positioning
  type: AnnotationTypeSchema,
  content: z.string(),
  color: z.string().optional(), // For highlights
  isPrivate: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;

export const ReaderSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  manualId: z.string(),
  bundleId: z.string(),
  currentChapterId: z.string().optional(),
  currentSectionId: z.string().optional(),
  readingProgress: z.number().default(0), // Percentage (0-100)
  readingTimeSeconds: z.number().default(0),
  lastAccessedAt: z.string(),
  bookmarks: z.array(z.object({
    chapterId: z.string(),
    sectionId: z.string(),
    blockId: z.string().optional(),
    title: z.string(),
    createdAt: z.string(),
  })),
  annotations: z.array(z.string()), // Annotation IDs
  notes: z.array(z.string()), // Note IDs
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReaderSession = z.infer<typeof ReaderSessionSchema>;

// Suggest Edit Types
export const SuggestEditSchema = z.object({
  id: z.string(),
  userId: z.string(),
  manualId: z.string(),
  bundleId: z.string(),
  chapterId: z.string(),
  sectionId: z.string(),
  blockId: z.string(),
  selector: z.string(), // Text selection within block
  currentText: z.string(),
  suggestedText: z.string(),
  reason: z.string(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  status: z.enum(['PENDING', 'REVIEWED', 'APPROVED', 'REJECTED', 'MIGRATED']).default('PENDING'),
  createdTaskId: z.string().optional(), // Link to editor task if created
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewerComments: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SuggestEdit = z.infer<typeof SuggestEditSchema>;

// Revision Bar Types
export const RevisionBarSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  bundleId: z.string(),
  chapterId: z.string(),
  sectionId: z.string(),
  blockId: z.string(),
  revisionType: z.enum(['NEW', 'UPDATED', 'MODIFIED', 'DELETED']),
  oldVersion: z.string().optional(),
  newVersion: z.string(),
  description: z.string(),
  authorName: z.string(),
  changedAt: z.string(),
});

export type RevisionBar = z.infer<typeof RevisionBarSchema>;

export const RevisionSummarySchema = z.object({
  manualId: z.string(),
  bundleId: z.string(),
  version: z.string(),
  totalRevisions: z.number(),
  newContent: z.number(),
  updatedContent: z.number(),
  modifiedContent: z.number(),
  deletedContent: z.number(),
  revisionBars: z.array(RevisionBarSchema),
  lastUpdated: z.string(),
});

export type RevisionSummary = z.infer<typeof RevisionSummarySchema>;

// Offline Support Types
export const OfflineCacheSchema = z.object({
  id: z.string(),
  userId: z.string(),
  bundleId: z.string(),
  cacheKey: z.string(),
  data: z.object({
    manual: z.unknown(),
    chapters: z.array(z.unknown()),
    sections: z.array(z.unknown()),
    blocks: z.array(z.unknown()),
    annotations: z.array(z.unknown()),
    searchIndex: z.unknown(),
  }),
  cachedAt: z.string(),
  expiresAt: z.string(),
  version: z.string(),
  checksum: z.string(),
});

export type OfflineCache = z.infer<typeof OfflineCacheSchema>;

export const OfflineCapabilitySchema = z.object({
  bundleId: z.string(),
  canCache: z.boolean(),
  estimatedSizeMB: z.number(),
  includesAnnotations: z.boolean(),
  includesSearchIndex: z.boolean(),
  lastSyncAt: z.string(),
  syncRequired: z.boolean(),
});

export type OfflineCapability = z.infer<typeof OfflineCapabilitySchema>;

// Feature Flags Types
export const FeatureFlagSchema = z.object({
  id: z.string(),
  name: z.string(),
  organizationId: z.string(),
  enabled: z.boolean(),
  description: z.string().optional(),
  conditions: z.array(z.object({
    userId: z.string().optional(),
    userRole: z.string().optional(),
    manualId: z.string().optional(),
    bundleId: z.string().optional(),
    expression: z.string().optional(), // JSON logic expression
  })),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

export const OperationallyCriticalFlagSchema = z.object({
  manualId: z.string(),
  bundleId: z.string(),
  isCritical: z.boolean(),
  requiredRoles: z.array(z.string()),
  accessMethod: z.enum(['CDN', 'EMAIL', 'FTP', 'OFFLINE_DOWNLOAD']),
  distributionChannels: z.array(z.string()),
  versionPinRequired: z.boolean(),
  auditLoggingRequired: z.boolean(),
});

export type OperationallyCriticalFlag = z.infer<typeof OperationallyCriticalFlagSchema>;

// API Request/Response Types for Reader
export const BundleMetadataSchema = z.object({
  manualId: z.string(),
  bundleId: z.string(),
  version: z.string(),
  title: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  publishedAt: z.string(),
  bundleSize: z.number(),
  bundleUrl: z.string(),
  requiresAuth: z.boolean(),
  offlineAvailable: z.boolean(),
  annotationCount: z.number().default(0),
  revisionCount: z.number().default(0),
});

export type BundleMetadata = z.infer<typeof BundleMetadataSchema>;

export const ManualReaderResponseSchema = z.object({
  bundle: BundleMetadataSchema,
  manual: z.object({
    id: z.string(),
    title: z.string(),
    organizationId: z.string(),
    chapters: z.array(z.object({
      id: z.string(),
      title: z.string(),
      number: z.string(),
      sections: z.array(z.object({
        id: z.string(),
        title: z.string(),
        number: z.string(),
        blocks: z.array(z.unknown()), // TipTap blocks
      })),
    })),
  }),
  userPermissions: z.object({
    canRead: z.boolean(),
    canAnnotate: z.boolean(),
    canSuggestEdit: z.boolean(),
    canDownloadOffline: z.boolean(),
  }),
});

export type ManualReaderResponse = z.infer<typeof ManualReaderResponseSchema>;

// Reader Analytics Types
export const ReaderAnalyticsSchema = z.object({
  userId: z.string(),
  manualId: z.string(),
  bundleId: z.string(),
  event: z.enum(['OPEN', 'SEARCH', 'ANNOTATE', 'SUGGEST_EDIT', 'BOOKMARK', 'DOWNLOAD']),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
  sessionId: z.string(),
});

export type ReaderAnalytics = z.infer<typeof ReaderAnalyticsSchema>;

// Epic-05: AI-driven Semantic Search Types

export const SearchQuerySchema = z.object({
  query: z.string().min(1),
  filters: z.object({
    manualId: z.string().optional(),
    version: z.string().optional(),
    contentType: z.enum(['PARAGRAPH', 'SECTION', 'CHAPTER']).optional(),
    organizationId: z.string().optional(),
  }).optional(),
  limit: z.number().min(1).max(10).default(5),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const CitationSchema = z.object({
  paragraphId: z.string(),
  manualId: z.string(),
  chapterNumber: z.string(),
  sectionNumber: z.string(),
  paragraphIndex: z.number(),
  content: z.string(),
  score: z.number(),
  highlightStart: z.number(),
  highlightEnd: z.number(),
  anchorId: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const AskResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  query: z.string(),
  searchTimeMs: z.number(),
  totalResults: z.number(),
  hasMoreResults: z.boolean(),
  searchTechniques: z.array(z.enum(['SEMANTIC', 'BM25', 'HYBRID'])),
});

export type AskResponse = z.infer<typeof AskResponseSchema>;

export const SearchIndexSchema = z.object({
  id: z.string(),
  contentHash: z.string(),
  manualId: z.string(),
  chapterId: z.string(),
  sectionId: z.string(),
  paragraphId: z.string().optional(),
  version: z.string(),
  contentType: z.enum(['PARAGRAPH', 'SECTION', 'CHAPTER']),
  title: z.string(),
  content: z.string(),
  semanticVector: z.array(z.number()).optional(),
  bm25Tokens: z.array(z.string()),
  wordCount: z.number(),
  anchorIds: z.array(z.string()),
  organizationId: z.string(),
  isReleased: z.boolean(),
  indexedAt: z.string(),
});

export type SearchIndex = z.infer<typeof SearchIndexSchema>;

export const IndexingJobSchema = z.object({
  id: z.string(),
  type: z.enum(['FULL_RECREATE', 'INCREMENTAL', 'MANUAL_TRIGGER']),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  progress: z.object({
    totalItems: z.number(),
    processedItems: z.number(),
    failedItems: z.number(),
    currentPhase: z.string(),
  }),
  triggeredBy: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type IndexingJob = z.infer<typeof IndexingJobSchema>;

export const SearchAnalyticsSchema = z.object({
  id: z.string(),
  query: z.string(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  responseTimeMs: z.number(),
  resultCount: z.number(),
  resultScores: z.array(z.number()),
  clickCount: z.number().default(0),
  outcome: z.enum(['SATISFIED', 'DISSAISFIED', 'NO_CLICK']).default('NO_CLICK'),
  userAgent: z.string().optional(),
  timestamp: z.string(),
});

export type SearchAnalytics = z.infer<typeof SearchAnalyticsSchema>;

// Epic-06: XML Ingest and Authoring Types

export const XmlDocumentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  originalXml: z.string(),
  parsedXml: z.record(z.any()),
  xsdSchema: z.string().optional(),
  validationErrors: z.array(z.object({
    line: z.number(),
    column: z.number(),
    message: z.string(),
    severity: z.enum(['ERROR', 'WARNING', 'INFO']),
    code: z.string().optional(),
  })),
  status: z.enum(['PENDING', 'VALIDATION_SUCCESS', 'VALIDATION_FAILED', 'MAPPED', 'FAILED']),
  organizationId: z.string(),
  uploadedBy: z.string(),
  uploadedAt: z.string(),
  processedAt: z.string().optional(),
});

export type XmlDocument = z.infer<typeof XmlDocumentSchema>;

export const XmlMappingSchema = z.object({
  id: z.string(),
  xmlDocumentId: z.string(),
  xmlElementPath: z.string(), // e.g., "Manual.Chapter.Section.Block"
  manualId: z.string().optional(),
  chapterId: z.string().optional(),
  sectionId: z.string().optional(),
  blockId: z.string().optional(),
  mappingType: z.enum(['MANUAL', 'CHAPTER', 'SECTION', 'BLOCK', 'METADATA']),
  fieldMappings: z.record(z.string()), // XML field -> Block field
  transformationRules: z.array(z.object({
    sourcePath: z.string(),
    targetPath: z.string(),
    transformFunction: z.enum(['DIRECT_COPY', 'TEXT_EXTRACT', 'HTML_CONVERT', 'STRUCTURED_PARSE']),
    parameters: z.record(z.any()).optional(),
  })),
  isValidated: z.boolean(),
  lastSyncedAt: z.string().optional(),
  syncStatus: z.enum(['IN_SYNC', 'MANUAL_MODIFIED', 'XML_MODIFIED', 'CONFLICTED']),
});

export type XmlMapping = z.infer<typeof XmlMappingSchema>;

export const XmlExportConfigurationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  organizationId: z.string(),
  templateXml: z.string(),
  xsdSchema: z.string(),
  fieldMappings: z.record(z.string()),
  exportRules: z.array(z.object({
    manualElement: z.string(),
    xmlPath: z.string(),
    required: z.boolean(),
    transformFunction: z.enum(['DIRECT_COPY', 'HTML_TO_XML', 'STRUCTURED_FORMAT', 'METADATA_EXTRACT']),
    parameters: z.record(z.any()).optional(),
  })),
  createdAt: z.string(),
  createdBy: z.string(),
  isActive: z.boolean(),
});

export type XmlExportConfiguration = z.infer<typeof XmlExportConfigurationSchema>;

export const XmlDiffSchema = z.object({
  id: z.string(),
  sourceXmlDocumentId: z.string(),
  targetXmlDocumentId: z.string(),
  diffType: z.enum(['IMPORT_EXPORT', 'VERSION_COMPARISON', 'MANUAL_XML_SYNC']),
  differences: z.array(z.object({
    type: z.enum(['ADDED', 'REMOVED', 'MODIFIED', 'MOVED']),
    path: z.string(),
    oldValue: z.any().optional(),
    newValue: z.any().optional(),
    description: z.string(),
    severity: z.enum(['TRIVIAL', 'MINOR', 'MAJOR', 'CRITICAL']),
    autoResolvable: z.boolean(),
    resolution: z.string().optional(),
  })),
  summary: z.object({
    totalChanges: z.number(),
    additions: z.number(),
    deletions: z.number(),
    modifications: z.number(),
    criticalChanges: z.number(),
  }),
  createdAt: z.string(),
  createdBy: z.string(),
});

export type XmlDiff = z.infer<typeof XmlDiffSchema>;

export const XmlImportRequestSchema = z.object({
  fileName: z.string(),
  xmlContent: z.string(),
  xsdSchemaContent: z.string().optional(),
  mappingConfigurationId: z.string().optional(),
  organizationId: z.string(),
  importOptions: z.object({
    createNewManual: z.boolean().default(false),
    overwriteExistingBlocks: z.boolean().default(false),
    validateAgainstXsd: z.boolean().default(true),
    generateDefaultMappings: z.boolean().default(true),
  }),
});

export type XmlImportRequest = z.infer<typeof XmlImportRequestSchema>;

export const XmlExportRequestSchema = z.object({
  manualId: z.string(),
  exportConfigurationId: z.string(),
  exportOptions: z.object({
    includeMetadata: z.boolean().default(true),
    validateAgainstXsd: z.boolean().default(true),
    preserveComments: z.boolean().default(true),
    exportFormat: z.enum(['STANDARD_XML', 'PRETTY_PRINT', 'MINIFIED']),
  }),
});

export type XmlExportRequest = z.infer<typeof XmlExportRequestSchema>;

export const XmlProcessingJobSchema = z.object({
  type: z.enum(['IMPORT', 'EXPORT', 'DIFF_GENERATION', 'VALIDATION']),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  progress: z.object({
    currentStep: z.string(),
    totalSteps: z.number(),
    completedSteps: z.number(),
    errors: z.array(z.string()),
  }),
});

export type XmlProcessingJob = z.infer<typeof XmlProcessingJobSchema>;

// Epic-04: Compliance Monitoring Types

// Regulation Library Types
export const RegulationLibrarySchema = z.object({
  id: z.string(),
  source: z.string(), // e.g., 'ICAO', 'EASA', 'FAA', 'EU-OPS'
  region: z.string(), // e.g., 'EU', 'US', 'GLOBAL', 'NORTH_ATLANTIC'
  title: z.string(),
  description: z.string().optional(),
  version: z.string(),
  effectiveDate: z.string(),
  expiryDate: z.string().optional(),
  url: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RegulationLibrary = z.infer<typeof RegulationLibrarySchema>;

export const RegulationItemSchema = z.object({
  id: z.string(),
  regulationLibraryId: z.string(),
  regulationType: z.enum(['ARTICLE', 'PARAGRAPH', 'SECTION', 'ANNEX', 'APPENDIX', 'AMC', 'GM', 'OTHER']),
  reference: z.string(), // e.g., 'AMC1.OP.MLR.100', 'FAR 121.101'
  title: z.string(),
  content: z.string(),
  category: z.enum(['OPERATIONAL', 'SAFETY', 'MAINTENANCE', 'TRAINING', 'EQUIPMENT', 'DOCUMENTATION', 'OTHER']),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  applicability: z.object({
    aircraftTypes: z.array(z.string()).optional(),
    operators: z.array(z.string()).optional(),
    routes: z.array(z.string()).optional(),
    conditions: z.array(z.string()).optional(),
  }),
  relatedRegulations: z.array(z.string()), // References to other regulation IDs
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RegulationItem = z.infer<typeof RegulationItemSchema>;

// Compliance Link Types
export const ComplianceLinkSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  chapterId: z.string(),
  sectionId: z.string(),
  blockId: z.string().optional(), // Optional paragraph-level linking
  regulationItemId: z.string(),
  linkType: z.enum(['DIRECT', 'INDIRECT', 'REQUIREMENT', 'REFERENCE', 'IMPLEMENTATION']),
  relationship: z.enum(['IMPLEMENTS', 'REFERENCES', 'COMPLIES_WITH', 'CONTRAVENES', 'RELATED_TO']),
  confidence: z.number().min(0).max(100), // AI confidence score (0-100)
  createdBy: z.string(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'QUESTIONED', 'INVALID']),
  notes: z.string().optional(),
  evidence: z.array(z.string()).optional(), // Supporting documentation URLs
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ComplianceLink = z.infer<typeof ComplianceLinkSchema>;

// Compliance Alert Types
export const ComplianceAlertSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  alertType: z.enum(['REGULATION_UPDATE', 'COMPLIANCE_GAP', 'EXPIRING_REGULATION', 'NEW_REQUIREMENT', 'RISK_ASSESSMENT']),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  title: z.string(),
  description: z.string(),
  affectedManualIds: z.array(z.string()),
  affectedComplianceLinks: z.array(z.string()),
  regulationItemId: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'MITIGATED', 'RESOLVED', 'DISMISSED']),
  assignedTo: z.string().optional(),
  acknowledgedBy: z.string().optional(),
  acknowledgedAt: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
  resolutionNotes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ComplianceAlert = z.infer<typeof ComplianceAlertSchema>;

// Audit Checklist Types
export const AuditChecklistItemSchema = z.object({
  id: z.string(),
  checklistId: z.string(),
  regulationItemId: z.string(),
  complianceLinkId: z.string(),
  question: z.string(),
  description: z.string().optional(),
  applicableManualIds: z.array(z.string()),
  evidenceRequired: z.array(z.string()),
  checkType: z.enum(['INSPECTION', 'VERIFICATION', 'DOCUMENTATION', 'PROCEDURAL', 'TRAINING']),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'N_A']),
  checkedBy: z.string().optional(),
  checkedAt: z.string().optional(),
  findings: z.string().optional(),
  recommendations: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditChecklistItem = z.infer<typeof AuditChecklistItemSchema>;

export const AuditChecklistSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  manualId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  auditType: z.enum(['REGULATORY', 'COMPLIANCE', 'SAFETY', 'OPERATIONAL', 'MAINTENANCE', 'TRAINING']),
  auditScope: z.enum(['MANUAL', 'OPERATIONS', 'SAFETY', 'MAINTENANCE', 'TRAINING', 'COMPREHENSIVE']),
  regulationLibraryIds: z.array(z.string()),
  coverageRegions: z.array(z.string()),
  scheduledDate: z.string(),
  completionDate: z.string().optional(),
  auditorId: z.string().optional(),
  auditorName: z.string().optional(),
  auditStatus: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  items: z.array(AuditChecklistItemSchema),
  statistics: z.object({
    totalItems: z.number(),
    completedItems: z.number(),
    failedItems: z.number(),
    notApplicableItems: z.number(),
    completionPercentage: z.number(),
  }),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AuditChecklist = z.infer<typeof AuditChecklistSchema>;

// Impact Analysis Types
export const ImpactAnalysisSchema = z.object({
  id: z.string(),
  triggerType: z.enum(['REGULATION_UPDATE', 'MANUAL_CHANGE', 'SCHEDULED_ASSESSMENT', 'NON_CONFORMITY']),
  regulationLibraryId: z.string(),
  oldVersion: z.string().optional(),
  newVersion: z.string(),
  analysisScope: z.object({
    organizationIds: z.array(z.string()),
    manualIds: z.array(z.string()),
    regulationItemIds: z.array(z.string()),
  }),
  results: z.object({
    affectedParagraphs: z.number(),
    newRequirements: z.number(),
    modifiedRequirements: z.number(),
    obsoleteRequirements: z.number(),
    conflictCount: z.number(),
    riskAssessment: z.object({
      highRisk: z.number(),
      mediumRisk: z.number(),
      lowRisk: z.number(),
    }),
    complianceLinksAffected: z.array(z.string()),
    estimatedEffort: z.object({
      hours: z.number(),
      resources: z.array(z.string()),
      timeline: z.string(),
    }),
  }),
  recommendations: z.array(z.object({
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    action: z.string(),
    responsible: z.string(),
    deadline: z.string(),
    estimatedEffort: z.string().optional(),
  })),
  automatedChecklistId: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REQUIRES_REVIEW']),
  analyzedBy: z.string().optional(),
  reviewedBy: z.string().optional(),
  

  reviewedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ImpactAnalysis = z.infer<typeof ImpactAnalysisSchema>;

// Coverage Analysis Types
export const CoverageAnalysisSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  manualId: z.string(),
  analysisDate: z.string(),
  scope: z.object({
    totalParagraphs: z.number(),
    linkedParagraphs: z.number(),
    unlinkedParagraphs: z.number(),
    partiallyLinkedParagraphs: z.number(),
  }),
  byChapter: z.array(z.object({
    chapterId: z.string(),
    chapterTitle: z.string(),
    totalParagraphs: z.number(),
    linkedParagraphs: z.number(),
    coveragePercentage: z.number(),
  })),
  byRegulation: z.array(z.object({
    regulationLibraryId: z.string(),
    regulationLibraryTitle: z.string(),
    linkedParagraphs: z.number(),
    coveragePercentage: z.number(),
  })),
  recommendations: z.array(z.object({
    paragraphId: z.string(),
    paragraphTitle: z.string(),
    suggestedRegulations: z.array(z.string()),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    reasoning: z.string(),
  })),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});

export type CoverageAnalysis = z.infer<typeof CoverageAnalysisSchema>;

// Library Update Job Types
export const LibraryUpdateJobSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  regulationLibraryId: z.string(),
  updateType: z.enum(['MAJOR', 'MINOR', 'PATCH', 'NEW_REGULATION']),
  oldVersion: z.string().optional(),
  newVersion: z.string(),
  description: z.string(),
  changes: z.object({
    added: z.array(z.string()),
    modified: z.array(z.string()),
    deleted: z.array(z.string()),
    renumbered: z.array(z.object({
      old: z.string(),
      new: z.string(),
    })),
  }),
  effectiveDate: z.string(),
  implementationDeadline: z.string().optional(),
  notificationDate: z.string(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']),
  processingStartedAt: z.string().optional(),
  processingCompletedAt: z.string().optional(),
  errorMessage: z.string().optional(),
  impactAnalysisId: z.string().optional(),
  generatedAlertIds: z.array(z.string()),
  generatedChecklistIds: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LibraryUpdateJob = z.infer<typeof LibraryUpdateJobSchema>;

// Compliance Dashboard Types
export const ComplianceDashboardSchema = z.object({
  organizationId: z.string(),
  lastUpdateDate: z.string(),
  overview: z.object({
    totalManuals: z.number(),
    totalParagraphs: z.number(),
    complianceLinks: z.object({
      total: z.number(),
      active: z.number(),
      questioned: z.number(),
      invalid: z.number(),
    }),
    coverageStats: z.object({
      globalCoverage: z.number(),
      criticalCoverage: z.number(),
      chapterCoverage: z.array(z.object({
        chapterId: z.string(),
        coverage: z.number(),
      })),
    }),
  }),
  alerts: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    recent: z.array(z.object({
      id: z.string(),
      alertType: z.string(),
      severity: z.string(),
      title: z.string(),
      createdAt: z.string(),
    })),
  }),
  upcomingDeadlines: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    deadline: z.string(),
    severity: z.string(),
  })),
  recentActivities: z.array(z.object({
    type: z.string(),
    description: z.string(),
    user: z.string(),
    timestamp: z.string(),
  })),
  trends: z.object({
    coverageTrend: z.array(z.object({
      date: z.string(),
      percentage: z.number(),
    })),
    alertTrend: z.array(z.object({
      date: z.string(),
      count: z.number(),
    })),
  }),
});

export type ComplianceDashboard = z.infer<typeof ComplianceDashboardSchema>;

// API Request/Response Types
export const CreateComplianceLinkDtoSchema = z.object({
  blockId: z.string(),
  regulationItemId: z.string(),
  linkType: z.enum(['DIRECT', 'INDIRECT', 'REQUIREMENT', 'REFERENCE', 'IMPLEMENTATION']),
  relationship: z.enum(['IMPLEMENTS', 'REFERENCES', 'COMPLIES_WITH', 'CONTRAVENES', 'RELATED_TO']),
  confidence: z.number().min(0).max(100),
  notes: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});

export type CreateComplianceLinkDto = z.infer<typeof CreateComplianceLinkDtoSchema>;

export const ImpactAnalysisRequestSchema = z.object({
  regulationLibraryId: z.string(),
  newVersion: z.string(),
  analysisScope: z.object({
    manualIds: z.array(z.string()).optional(),
    organizationIds: z.array(z.string()).optional(),
  }),
});

export type ImpactAnalysisRequest = z.infer<typeof ImpactAnalysisRequestSchema>;

export const ComplianceLinkResponseSchema = z.object({
  id: z.string(),
  block: z.object({
    id: z.string(),
    content: z.unknown(),
    title: z.string().optional(),
  }),
  regulation: z.object({
    id: z.string(),
    reference: z.string(),
    title: z.string(),
    regulationLibrary: z.object({
      source: z.string(),
      region: z.string(),
      version: z.string(),
    }),
  }),
  linkType: z.string(),
  relationship: z.string(),
  confidence: z.number(),
  status: z.string(),
  createdAt: z.string(),
});

export type ComplianceLinkResponse = z.infer<typeof ComplianceLinkResponseSchema>;

// Compliance Analytics Types
export const ComplianceAnalyticsSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  action: z.enum(['LINK_CREATED', 'LINK_UPDATED', 'LINK_DELETED', 'ALERT_VIEWED', 'CHECKLIST_ACCESSED', 'IMPACT_ANALYZED']),
  targetId: z.string(), // ComplianceLink, ComplianceAlert, or AuditChecklist ID
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

export type ComplianceAnalytics = z.infer<typeof ComplianceAnalyticsSchema>;

// ===============================================
// EPIC-07: EFB APP & DEVICE CONTROLS
// ===============================================

// Device Types
export const DeviceModelSchema = z.enum(['iPad', 'iPad_Pro', 'iPhone', 'Android_Tablet', 'Android_Phone', 'Windows_Tablet']);
export type DeviceModel = z.infer<typeof DeviceModelSchema>;

export const DevicePlatformSchema = z.enum(['iOS', 'Android', 'Windows']);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const DeviceStatusSchema = z.enum(['ACTIVE', 'PENDING_ENROLLMENT', 'SUSPENDED', 'DECOMMISSIONED']);
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export const DeviceNetworkStatusSchema = z.enum(['ONLINE', 'OFFLINE', 'CONNECTING']);
export type DeviceNetworkStatus = z.infer<typeof DeviceNetworkStatusSchema>;

export const DeviceSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string().optional(), // Device owner
  deviceModel: DeviceModelSchema,
  platform: DevicePlatformSchema,
  osVersion: z.string(),
  appVersion: z.string(),
  deviceName: z.string(),
  deviceId: z.string(), // Unique device identifier
  hardwareId: z.string(), // Hardware UUID/serial
  status: DeviceStatusSchema.default('PENDING_ENROLLMENT'),
  lastSyncAt: z.string().optional(),
  lastOnlineAt: z.string().optional(),
  enrollmentDate: z.string(),
  installedPolicies: z.array(z.string()), // Policy IDs
  securityFlags: z.object({
    isJailbroken: z.boolean().default(false),
    hasMalware: z.boolean().default(false),
    encryptionEnabled: z.boolean().default(true),
    screenLockEnabled: z.boolean().default(false),
    developerModeEnabled: z.boolean().default(false),
  }),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Device = z.infer<typeof DeviceSchema>;

// Device Policy Types
export const PolicyTypeSchema = z.enum(['MANUAL_PINNING', 'CACHE_SYNC', 'SECURITY', 'FEATURE_FLAGS']);
export type PolicyType = z.infer<typeof PolicyTypeSchema>;

export const DevicePolicySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  createdBy: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: PolicyTypeSchema,
  isActive: z.boolean().default(true),
  priority: z.number().default(0), // Higher number = higher priority
  conditions: z.object({
    deviceModels: z.array(DeviceModelSchema).optional(),
    platforms: z.array(DevicePlatformSchema).optional(),
    osVersions: z.array(z.string()).optional(),
    requireApproval: z.boolean().default(false),
  }),
  settings: z.record(z.unknown()), // Policy-specific settings
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DevicePolicy = z.infer<typeof DevicePolicySchema>;

// Manual Pinning Policy
export const ManualPinningPolicySchema = z.object({
  type: z.literal('MANUAL_PINNING'),
  settings: z.object({
    manualIds: z.array(z.string()), // Mandatory manuals
    folderIds: z.array(z.string()).optional(), // Entire folders
    autoPinNewManuals: z.boolean().default(false),
    pinByAircraft: z.array(z.string()).optional(), // Auto-pin by aircraft type
    maxStorageMB: z.number().default(1000), // Storage limit
    expiration: z.object({
      enabled: z.boolean().default(true),
      maxDays: z.number().default(30),
      autoRefresh: z.boolean().default(true),
    }),
  }),
});

export type ManualPinningPolicy = z.infer<typeof ManualPinningPolicySchema>;

// Cache Sync Policy
export const CacheSyncPolicySchema = z.object({
  type: z.literal('CACHE_SYNC'),
  settings: z.object({
    syncIntervalHours: z.number().default(24),
    wifiRequired: z.boolean().default(false),
    allowCellular: z.boolean().default(true),
    backgroundSync: z.boolean().default(true),
    offlineTimeoutHours: z.number().default(72), // Force sync after X hours offline
    chunkSizeKB: z.number().default(512), // Chunk size for incremental sync
    compressionEnabled: z.boolean().default(true),
    encryptionRequired: z.boolean().default(true),
  }),
});

export type CacheSyncPolicy = z.infer<typeof CacheSyncPolicySchema>;

// Security Policy
export const SecurityPolicySchema = z.object({
  type: z.literal('SECURITY'),
  settings: z.object({
    allowScreenshots: z.boolean().default(false),
    enableWatermarking: z.boolean().default(true),
    requireBiometrics: z.boolean().default(true),
    sessionTimeoutMinutes: z.number().default(30),
    deviceLockoutThreshold: z.number().default(5), // Failed auth attempts
    allowSharing: z.boolean().default(false),
    networkRestrictions: z.object({
      allowedNetworks: z.array(z.string()).optional(),
      blockUntrustedWifi: z.boolean().default(true),
      requireVPN: z.boolean().default(false),
    }),
    remoteWipeEnabled: z.boolean().default(true),
  }),
});

export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;

// FEATURE_FLAGS Policy
export const FeatureFlagsPolicySchema = z.object({
  type: z.literal('FEATURE_FLAGS'),
  settings: z.object({
    enabledFeatures: z.array(z.string()), // Feature flag names
    disabledFeatures: z.array(z.string()),
    conditionalFeatures: z.record(z.object({
      enabled: z.boolean(),
      conditions: z.record(z.unknown()),
    })),
  }),
});

export type FeatureFlagsPolicy = z.infer<typeof FeatureFlagsPolicySchema>;

// Policy Union Type
export const PolicySettingsSchema = z.union([
  ManualPinningPolicySchema,
  CacheSyncPolicySchema,
  SecurityPolicySchema,
  FeatureFlagsPolicySchema,
]);

export type PolicySettings = z.infer<typeof PolicySettingsSchema>;

// Offline Cache Types
export const ChunkStatusSchema = z.enum(['AVAILABLE', 'DOWNLOADING', 'COMPLETED', 'ERROR', 'EXPIRED']);
export type ChunkStatus = z.infer<typeof ChunkStatusSchema>;

export const CacheChunkSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  readerBundleId: z.string(), // Link to ReaderBundle
  chunkIndex: z.number(),
  chunkPath: z.string(), // S3/local path
  chunkChecksum: z.string(), // SHA-256 hash
  chunkSizeBytes: z.number(),
  status: ChunkStatusSchema.default('AVAILABLE'),
  downloadedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CacheChunk = z.infer<typeof CacheChunkSchema>;

export const CacheManifestSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  readerBundleId: z.string(),
  bundleVersion: z.string(),
  chunkCount: z.number(),
  totalSizeBytes: z.number(),
  checksum: z.string(), // Manifest checksum
  isCompressed: z.boolean().default(true),
  encryptionKeyId: z.string().optional(), // For encrypted chunks
  expiresAt: z.string().optional(),
  lastModified: z.string(),
  createdAt: z.string(),
});

export type CacheManifest = z.infer<typeof CacheManifestSchema>;

export const OfflineCacheSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  organizationId: z.string(),
  manualId: z.string(),
  readerBundleId: z.string(),
  manifestId: z.string().optional(),
  storagePath: z.string(), // Local storage location
  totalSizeBytes: z.number(),
  cachedAt: z.string(),
  lastAccessedAt: z.string(),
  accessCount: z.number().default(0),
  isExpired: z.boolean().default(false),
  chunkChecksums: z.array(z.object({
    chunkIndex: z.number(),
    checksum: z.string(),
    sizeBytes: z.number(),
  })),
  metadata: z.record(z.unknown()).optional(),
});

export type OfflineCache = z.infer<typeof OfflineCacheSchema>;

// Device Sync Types
export const SyncStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED']);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const SyncJobSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  organizationId: z.string(),
  initiatedBy: z.string(), // User ID
  type: z.enum(['FULL_SYNC', 'INCREMENTAL_SYNC', 'POLICY_SYNC', 'CACHE_INVALIDATION']),
  status: SyncStatusSchema.default('PENDING'),
  progress: z.object({
    totalItems: z.number().default(0),
    completedItems: z.number().default(0),
    failedItems: z.number().default(0),
    skippedItems: z.number().default(0),
    percentage: z.number().default(0),
  }),
  settings: z.object({
    manualIds: z.array(z.string()).optional(),
    forceFreshFetch: z.boolean().default(false),
    excludeExpired: z.boolean().default(true),
    chunkSizeKB: z.number().default(512),
    compressionEnabled: z.boolean().default(true),
    encryptionEnabled: z.boolean().default(true),
  }),
  errors: z.array(z.object({
    item: z.string(), // Item ID that failed
    error: z.string(),
    retryable: z.boolean().default(true),
  })),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  expiry: z.string().optional(), // Job expiration
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});

export type SyncJob = z.infer<typeof SyncJobSchema>;

// EFB App Session Types
export const DeviceSessionSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  userId: z.string(),
  sessionToken: z.string(),
  isActive: z.boolean().default(true),
  lastActivityAt: z.string(),
  geoLocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number(),
    altitude: z.number().optional(),
  }).optional(),
  appContext: z.object({
    currentManualId: z.string().optional(),
    currentSectionId: z.string().optional(),
    lastSearchQuery: z.string().optional(),
    offlineMode: z.boolean().default(false),
    networkType: z.enum(['wifi', 'cellular', 'none']).default('none'),
  }),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});

export type DeviceSession = z.infer<typeof DeviceSessionSchema>;

// Device Analytics Types
export const DeviceAnalyticsSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  action: z.enum([
    'LOGIN',
    'LOGOUT',
    'MANUAL_OPEN',
    'SEARCH_PERFORMED',
    'OFFLINE_STARTED',
    'OFFLINE_ENDED',
    'SYNC_STARTED',
    'SYNC_COMPLETED',
    'CACHE_ACCESSED',
    'HIGHLIGHT_ADDED',
    'NOTES_ADDED',
    'POLICY_UPDATED',
  ]),
  targetId: z.string().optional(), // Manual ID, search query, etc.
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

export type DeviceAnalytics = z.infer<typeof DeviceAnalyticsSchema>;

// EFB API Request Types
export const DeviceEnrollmentRequestSchema = z.object({
  deviceModel: DeviceModelSchema,
  platform: DevicePlatformSchema,
  osVersion: z.string(),
  appVersion: z.string(),
  deviceName: z.string(),
  deviceId: z.string(),
  hardwareId: z.string(),
  organizationIdentifier: z.string(), // Organization code/domain
  userId: z.string().optional(), // If pre-authenticated
  securityInfo: z.object({
    isJailbroken: z.boolean().default(false),
    hasDeveloperMode: z.boolean().default(false),
    encryptionSupported: z.boolean().default(true),
    biometricAuthSupported: z.boolean().default(false),
  }),
});

export type DeviceEnrollmentRequest = z.infer<typeof DeviceEnrollmentRequestSchema>;

export const SyncCheckRequestSchema = z.object({
  deviceId: z.string(),
  cachedManifests: z.array(z.object({
    readerBundleId: z.string(),
    bundleVersion: z.string(),
    manifestChecksum: z.string(),
    chunkChecksums: z.array(z.string()), // Per-chunk checksums
    lastModified: z.string(),
  })),
  status: z.object({
    networkStatus: DeviceNetworkStatusSchema,
    batteryLevel: z.number().optional(),
    availableStorageMB: z.number().optional(),
    lastSyncAt: z.string().optional(),
  }),
});

export type SyncCheckRequest = z.infer<typeof SyncCheckRequestSchema>;

export const SyncResponseSchema = z.object({
  needsSync: z.boolean(),
  syncJobs: z.array(z.object({
    readerBundleId: z.string(),
    bundleVersion: z.string(),
    operation: z.enum(['NEW', 'UPDATE', 'DELETE']),
    chunksToDownload: z.array(z.object({
      chunkIndex: z.number(),
      chunkUrl: z.string(),
      chunkChecksum: z.string(),
      chunkSizeBytes: z.number(),
    })),
    chunksToDelete: z.array(z.number()),
    priority: z.number().default(0),
    estimatedSizeMB: z.number(),
  })),
  policies: z.array(z.object({
    policyId: z.string(),
    policyVersion: z.string(),
    settings: PolicySettingsSchema,
    effectiveAt: z.string(),
  })),
  featureFlags: z.array(z.object({
    flagName: z.string(),
    isEnabled: z.boolean(),
    defaultValue: z.unknown(),
  })),
});

export type SyncResponse = z.infer<typeof SyncResponseSchema>;

export const HighlightSyncSchema = z.object({
  deviceId: z.string(),
  highlights: z.array(z.object({
    blockId: z.string(),
    content: z.string(),
    color: z.string().default('yellow'),
    note: z.string().optional(),
    position: z.object({
      startOffset: z.number(),
      endOffset: z.number(),
    }).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
});

export type HighlightSync = z.infer<typeof HighlightSyncSchema>;

export const NoteSyncSchema = z.object({
  deviceId: z.string(),
  notes: z.array(z.object({
    manualId: z.string(),
    sectionId: z.string().optional(),
    blockId: z.string().optional(),
    title: z.string(),
    content: z.string(),
    isPrivate: z.boolean().default(true),
    tags: z.array(z.string()).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
});

export type NoteSync = z.infer<typeof NoteSyncSchema>;

// Admin Device Management Types
export const DeviceListResponseSchema = z.object({
  devices: z.array(DeviceSchema),
  totalCount: z.number(),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  }),
});

export type DeviceListResponse = z.infer<typeof DeviceListResponseSchema>;

export const DevicePolicyUpdateRequestSchema = z.object({
  deviceIds: z.array(z.string()),
  policyId: z.string(),
  action: z.enum(['ADD', 'REMOVE', 'REPLACE']),
});

export type DevicePolicyUpdateRequest = z.infer<typeof DevicePolicyUpdateRequestSchema>;

export const CacheInvalidationRequestSchema = z.object({
  deviceIds: z.array(z.string()),
  scope: z.object({
    manualIds: z.array(z.string()).optional(),
    cacheTypes: z.array(z.enum(['manuals', 'highlights', 'notes', 'search_index'])).optional(),
    forceImmediate: z.boolean().default(false),
  }),
});

export type CacheInvalidationRequest = z.infer<typeof CacheInvalidationRequestSchema>;

export const RemoteCommandSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  command: z.enum(['FORCE_SYNC', 'CACHE_INVALIDATE', 'POLICY_REFRESH', 'REMOTE_WIPE', 'RESTART_APP']),
  payload: z.record(z.unknown()).optional(),
  status: z.enum(['PENDING', 'SENT', 'ACKNOWLEDGED', 'COMPLETED', 'FAILED']),
  createdAt: z.string(),
  acknowledgedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

export type RemoteCommand = z.infer<typeof RemoteCommandSchema>;
