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
