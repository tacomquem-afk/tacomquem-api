import { count, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { betaInvites, users } from '../../db/schema.js';
import { BadRequestError, ConflictError, ErrorCodes, NotFoundError } from '../../errors/index.js';

export interface AddBetaInviteParams {
  email: string;
  adminId: string;
  reason?: string | undefined;
  ipAddress?: string | undefined;
}

export interface RemoveBetaInviteParams {
  email: string;
  adminId: string;
  ipAddress?: string;
}

export interface BetaInviteResponse {
  email: string;
  addedAt: Date;
  usedAt: Date | null;
  reason: string | null;
  addedBy: {
    id: string;
    name: string;
  };
}

export interface BetaInviteListResult {
  invites: BetaInviteResponse[];
  total: number;
}

export async function addBetaInvite(params: AddBetaInviteParams): Promise<BetaInviteResponse> {
  // Validate email format
  if (!params.email || !params.email.includes('@')) {
    throw new BadRequestError(ErrorCodes.VALIDATION_INVALID_REQUEST, 'Invalid email format');
  }

  const normalizedEmail = params.email.toLowerCase();

  // Check if email already whitelisted
  const existing = await db.query.betaInvites.findFirst({
    where: eq(betaInvites.email, normalizedEmail),
  });

  if (existing) {
    throw new ConflictError(
      ErrorCodes.AUTH_EMAIL_TAKEN,
      `Email ${params.email} is already whitelisted for beta`
    );
  }

  // Verify admin exists
  const admin = await db.query.users.findFirst({
    where: eq(users.id, params.adminId),
  });

  if (!admin) {
    throw new NotFoundError(ErrorCodes.ADMIN_TARGET_NOT_FOUND, 'Admin user not found');
  }

  // Insert invite
  const [invite] = await db
    .insert(betaInvites)
    .values({
      email: normalizedEmail,
      addedBy: params.adminId,
      reason: params.reason,
      ipAddress: params.ipAddress,
    })
    .returning();

  if (!invite) {
    throw new BadRequestError(
      ErrorCodes.VALIDATION_INVALID_REQUEST,
      'Failed to create beta invite'
    );
  }

  return {
    email: invite.email,
    addedAt: invite.createdAt,
    usedAt: invite.usedAt,
    reason: invite.reason,
    addedBy: {
      id: admin.id,
      name: admin.nameEncrypted,
    },
  };
}

export async function removeBetaInvite(params: RemoveBetaInviteParams): Promise<void> {
  const normalizedEmail = params.email.toLowerCase();

  const existing = await db.query.betaInvites.findFirst({
    where: eq(betaInvites.email, normalizedEmail),
  });

  if (!existing) {
    throw new NotFoundError(
      ErrorCodes.ADMIN_TARGET_NOT_FOUND,
      `Email ${params.email} not found in whitelist`
    );
  }

  await db.delete(betaInvites).where(eq(betaInvites.email, normalizedEmail));
}

export async function listBetaInvites(
  limit: number = 20,
  offset: number = 0
): Promise<BetaInviteListResult> {
  const invitesList = await db.query.betaInvites.findMany({
    limit,
    offset,
    orderBy: (table) => [table.createdAt],
    with: {
      admin: true,
    },
  });

  // Get total count
  const countResult = await db.select({ count: count() }).from(betaInvites);

  const total = countResult[0]?.count ?? 0;

  return {
    invites: invitesList.map((invite) => ({
      email: invite.email,
      addedAt: invite.createdAt,
      usedAt: invite.usedAt,
      reason: invite.reason,
      addedBy: {
        id: invite.admin.id,
        name: invite.admin.nameEncrypted,
      },
    })),
    total,
  };
}

export async function checkBetaInvite(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();
  const invite = await db.query.betaInvites.findFirst({
    where: eq(betaInvites.email, normalizedEmail),
  });

  return !!invite;
}

export async function markBetaInviteAsUsed(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  await db
    .update(betaInvites)
    .set({ usedAt: new Date() })
    .where(eq(betaInvites.email, normalizedEmail));
}
