import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  ENCRYPTION_KEY: z.string().length(64),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string().url(),

  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().email(),

  FRONTEND_URL: z.string().url(),

  R2_ACCOUNT_ID: z.string().default('test-account-id'),
  R2_ACCESS_KEY_ID: z.string().default('test-access-key'),
  R2_SECRET_ACCESS_KEY: z.string().default('test-secret-key'),
  R2_BUCKET_NAME: z.string().default('test-bucket'),
  R2_PUBLIC_URL: z.string().url().default('https://test-images.example.com'),
});

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
