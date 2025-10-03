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
