import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { addBetaUser } from '../services/admin/beta-program.js';
import { hash } from '../services/crypto/index.js';

const argsSchema = z.object({
  adminEmail: z.string().email('admin email inválido'),
});

async function readStdin(): Promise<string> {
  // Read piped input (CSV or newline-separated emails)
  try {
    const text = await new Response(process.stdin).text();
    return text || '';
  } catch (_err) {
    return '';
  }
}

function parseEmails(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith('#'));

  if (lines.length === 0) return [];

  // If first line looks like a header (contains "email"), drop it
  const first = (lines[0] ?? '').toLowerCase();
  if (first.includes('email') && lines.length > 1) {
    lines.shift();
  }

  // Support CSV lines like: email,name,... -> take first column
  const emails = lines.map((l) => (l.split(',')[0] ?? '').trim()).filter(Boolean);
  return Array.from(new Set(emails)); // dedupe
}

async function findAdminByEmail(email: string) {
  const emailHash = hash(email);
  const admin = await db.query.users.findFirst({ where: eq(users.emailHash, emailHash) });
  return admin;
}

async function main() {
  const rawArg = process.argv.find((a) => a.startsWith('--admin-email='));
  if (!rawArg) {
    // eslint-disable-next-line no-console
    console.error('Usage: bun run beta:add-batch --admin-email=admin@you.app < users.csv');
    process.exit(2);
  }

  const adminEmail = (rawArg.split('=')[1] ?? '').trim();
  try {
    argsSchema.parse({ adminEmail });
  } catch (_err) {
    // eslint-disable-next-line no-console
    console.error('Invalid --admin-email');
    process.exit(2);
  }

  const admin = await findAdminByEmail(adminEmail);
  if (!admin) {
    // eslint-disable-next-line no-console
    console.error('Admin user not found');
    process.exit(1);
  }

  if (admin.role !== 'SUPER_ADMIN') {
    // eslint-disable-next-line no-console
    console.error('Provided user is not SUPER_ADMIN');
    process.exit(1);
  }

  const raw = await readStdin();
  const emails = parseEmails(raw);

  if (emails.length === 0) {
    // eslint-disable-next-line no-console
    console.error('No emails provided on stdin');
    process.exit(2);
  }

  const results: { email: string; status: string; reason?: string }[] = [];

  for (const email of emails) {
    try {
      await addBetaUser({ email, adminId: admin.id });
      results.push({ email, status: 'added' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      results.push({ email, status: 'failed', reason });
    }
  }

  const added = results.filter((r) => r.status === 'added').length;
  const failed = results.filter((r) => r.status === 'failed');

  // Summary
  process.stdout.write(
    `Processed ${results.length} emails — added: ${added}, failed: ${failed.length}\n`
  );
  if (failed.length > 0) {
    process.stdout.write('\nFailures:\n');
    for (const f of failed) {
      process.stdout.write(`- ${f.email}: ${f.reason}\n`);
    }
    process.exit(1);
  }

  process.exit(0);
}

if (import.meta.path === Bun.main) {
  main();
}
