import { z } from 'zod';

// API Types
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  commitSha: z.string(),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// User Types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  orgId: z.string(),
  role: z.enum(['admin', 'user', 'viewer']),
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

// Auth Types
export const AuthConfigSchema = z.object({
  provider: z.enum(['auth0', 'entra', 'keycloak']),
  clientId: z.string(),
  domain: z.string(),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// Shared API Response Types
export const ApiErrorSchema = z.object({
  type: 'validation_error' | 'authentication_error' | 'authorization_error' | 'not_found' | 'internal_error',
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: ApiErrorSchema.optional(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;
