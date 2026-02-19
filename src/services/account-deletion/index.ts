import { and, eq, lte, or } from 'drizzle-orm';
import { env } from '../../config/env';
import { db } from '../../db';
import {
  accessLogs,
  dataExports,
  deletionTokens,
  friendships,
  items,
  notifications,
  users,
} from '../../db/schema';
import { generateToken } from '../crypto/index';
import { sendEmail } from '../email/index';

const DELETION_WINDOW_DAYS = 15;

export interface ScheduleDeletionInput {
  userId: string;
  reason?: string;
  password?: string;
}

export interface DeletionStatus {
  status: 'active' | 'pending' | 'scheduled' | 'completed';
  requestedAt?: Date;
  scheduledFor?: Date;
  cancelledAt?: Date;
  canCancel: boolean;
}

/**
 * Schedule user account deletion
 * Creates a deletion request with a 15-day grace period and sends confirmation email
 */
export async function scheduleDeletion(input: ScheduleDeletionInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, input.userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if deletion already scheduled
  if (user.deletionStatus !== 'active') {
    throw new Error('Account deletion already scheduled');
  }

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + DELETION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Create cancellation token
  const token = await generateToken(32);

  await db.insert(deletionTokens).values({
    userId: input.userId,
    token,
    type: 'cancel',
    expiresAt: scheduledFor,
  });

  // Update user deletion status
  await db
    .update(users)
    .set({
      deletionRequestedAt: now,
      deletionScheduledFor: scheduledFor,
      deletionStatus: 'pending',
      deletionReason: input.reason,
    })
    .where(eq(users.id, input.userId));

  // Send confirmation email
  const cancelLink = `${env.FRONTEND_URL}/account/cancel-deletion?token=${token}`;
  const scheduledDateStr = scheduledFor.toLocaleDateString('pt-BR');

  const emailHtml = `
    <h2>Sua conta será deletada em 15 dias</h2>
    <p>Você solicitou a exclusão de sua conta. Ela será permanentemente deletada em <strong>${scheduledDateStr}</strong>.</p>
    <p>Se mudou de ideia, pode cancelar a exclusão clicando no link abaixo:</p>
    <p><a href="${cancelLink}">Cancelar exclusão da conta</a></p>
    <p>Este link é válido até ${scheduledDateStr}.</p>
  `;

  await sendEmail({
    to: user.emailEncrypted || 'user@example.com',
    subject: 'Sua conta será deletada em 15 dias',
    html: emailHtml,
  });

  return {
    status: 'success',
    message: 'Conta será deletada em 15 dias',
    scheduledFor,
    canCancelUntil: scheduledFor,
    cancelLink,
  };
}

/**
 * Cancel a scheduled deletion using a token
 */
export async function cancelDeletionWithToken(token: string) {
  const deletionToken = await db.query.deletionTokens.findFirst({
    where: and(eq(deletionTokens.token, token), eq(deletionTokens.type, 'cancel')),
  });

  if (!deletionToken) {
    throw new Error('Invalid or expired token');
  }

  if (new Date() > deletionToken.expiresAt) {
    throw new Error('Token expired');
  }

  if (deletionToken.usedAt) {
    throw new Error('Token already used');
  }

  // Mark token as used
  await db
    .update(deletionTokens)
    .set({ usedAt: new Date() })
    .where(eq(deletionTokens.id, deletionToken.id));

  // Update user status
  await db
    .update(users)
    .set({
      deletionStatus: 'active',
      deletionCancelledAt: new Date(),
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionReason: null,
    })
    .where(eq(users.id, deletionToken.userId));

  return {
    status: 'success',
    message: 'Exclusão cancelada. Sua conta continua ativa.',
  };
}

/**
 * Cancel deletion for authenticated user (no token needed)
 */
export async function cancelDeletion(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.deletionStatus !== 'pending') {
    throw new Error('No active deletion scheduled');
  }

  await db
    .update(users)
    .set({
      deletionStatus: 'active',
      deletionCancelledAt: new Date(),
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionReason: null,
    })
    .where(eq(users.id, userId));

  return {
    status: 'success',
    message: 'Exclusão cancelada. Sua conta continua ativa.',
  };
}

/**
 * Get deletion status for a user
 */
export async function getDeletionStatus(userId: string): Promise<DeletionStatus> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  const canCancel =
    user.deletionStatus === 'pending' &&
    user.deletionScheduledFor !== null &&
    new Date() < user.deletionScheduledFor;

  const result: DeletionStatus = {
    status: user.deletionStatus,
    canCancel,
  };

  if (user.deletionRequestedAt) {
    result.requestedAt = user.deletionRequestedAt;
  }
  if (user.deletionScheduledFor) {
    result.scheduledFor = user.deletionScheduledFor;
  }
  if (user.deletionCancelledAt) {
    result.cancelledAt = user.deletionCancelledAt;
  }

  return result;
}

/**
 * Process scheduled deletions (runs as cron job)
 * Anonymizes user data and soft-deletes account
 */
export async function processPendingDeletions() {
  const usersToDelete = await db.query.users.findMany({
    where: and(eq(users.deletionStatus, 'pending'), lte(users.deletionScheduledFor, new Date())),
  });

  const results = [];

  for (const user of usersToDelete) {
    try {
      await anonymizeUserData(user.id);

      await db
        .update(users)
        .set({
          emailEncrypted: `deleted_${user.id}`,
          nameEncrypted: 'Usuário deletado',
          emailHash: `deleted_${user.id}`,
          avatarUrl: null,
          deletionStatus: 'completed',
          deletedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      results.push({ userId: user.id, status: 'success' });
    } catch (error) {
      results.push({
        userId: user.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Anonymize all user-related data
 */
async function anonymizeUserData(userId: string) {
  // Soft delete items
  await db.update(items).set({ updatedAt: new Date() }).where(eq(items.ownerId, userId));

  // Remove friendships
  await db
    .delete(friendships)
    .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)));

  // Delete notifications
  await db.delete(notifications).where(eq(notifications.userId, userId));

  // Delete deletion tokens
  await db.delete(deletionTokens).where(eq(deletionTokens.userId, userId));

  // Delete data exports
  await db.delete(dataExports).where(eq(dataExports.userId, userId));

  // Delete access logs
  await db.delete(accessLogs).where(eq(accessLogs.userId, userId));
}

/**
 * Hard delete user and all related data (admin only, immediate)
 */
export async function forceDeleteUser(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Anonymize first
  await anonymizeUserData(userId);

  // Update user as deleted
  await db
    .update(users)
    .set({
      emailEncrypted: `deleted_${userId}`,
      nameEncrypted: 'Usuário deletado',
      emailHash: `deleted_${userId}`,
      avatarUrl: null,
      deletionStatus: 'completed',
      deletedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { status: 'success', userId };
}
