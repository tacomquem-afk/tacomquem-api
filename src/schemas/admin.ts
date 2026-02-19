import { z } from 'zod';

export const roleSchema = z.enum(['USER', 'ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']);

export const adminRoleSchema = z.enum(['ANALYST', 'SUPPORT', 'MODERATOR', 'SUPER_ADMIN']);

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
  role: roleSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'lastActivity']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const blockUserSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export const deleteUserSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export const removeContentSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export const promoteAdminSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: adminRoleSchema,
});

export const changeRoleSchema = z.object({
  role: adminRoleSchema,
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  adminId: z.string().uuid().optional(),
});
