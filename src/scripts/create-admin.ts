import { createInterface } from 'node:readline';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { encrypt, hash } from '../services/crypto/index.js';
import { hashPassword } from '../services/password/index.js';

const createAdminSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
});

export async function findUserByEmailHash(emailHash: string) {
  return db.query.users.findFirst({
    where: eq(users.emailHash, emailHash),
  });
}

export async function createSuperAdmin(
  email: string,
  password: string,
  name: string
): Promise<{ created: boolean; userId: string }> {
  const validated = createAdminSchema.parse({ email, password, name });

  const emailHash = hash(validated.email);

  const existingUser = await findUserByEmailHash(emailHash);

  if (existingUser) {
    await db.update(users).set({ role: 'SUPER_ADMIN' }).where(eq(users.id, existingUser.id));

    return { created: false, userId: existingUser.id };
  }

  const passwordHash = await hashPassword(validated.password);
  const emailEncrypted = encrypt(validated.email);
  const nameEncrypted = encrypt(validated.name);

  const [newUser] = await db
    .insert(users)
    .values({
      emailEncrypted,
      nameEncrypted,
      emailHash,
      passwordHash,
      role: 'SUPER_ADMIN',
      emailVerified: true,
      isActive: true,
    })
    .returning({ id: users.id });

  if (!newUser) {
    throw new Error('Erro ao criar usuário');
  }

  return { created: true, userId: newUser.id };
}

async function main() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    const email = await question('Email: ');
    const password = await question('Senha (mínimo 8 caracteres): ');
    const name = await question('Nome completo: ');
    const result = await createSuperAdmin(email.trim(), password.trim(), name.trim());

    if (result.created) {
    } else {
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      // eslint-disable-next-line no-console
      console.error('\n❌ Erro de validação:');
      error.issues.forEach((e) => {
        // eslint-disable-next-line no-console
        console.error(`  - ${e.message}`);
      });
    } else {
      // eslint-disable-next-line no-console
      console.error('\n❌ Erro:', error);
    }
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

if (import.meta.path === Bun.main) {
  main();
}
