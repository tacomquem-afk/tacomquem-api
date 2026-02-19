import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.url(),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  ENCRYPTION_KEY: z.string().length(64),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.url(),
  GOOGLE_AUTH_URL: z.url().default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_TOKEN_URL: z.url().default('https://oauth2.googleapis.com/token'),
  GOOGLE_USERINFO_URL: z.url().default('https://www.googleapis.com/oauth2/v2/userinfo'),

  RESEND_API_URL: z.url().default('https://api.resend.com/emails'),
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().email(),

  FRONTEND_URL: z.url(),

  R2_ACCOUNT_ID: z.string().default('test-account-id'),
  R2_ACCESS_KEY_ID: z.string().default('test-access-key'),
  R2_SECRET_ACCESS_KEY: z.string().default('test-secret-key'),
  R2_BUCKET_NAME: z.string().default('test-bucket'),
  R2_PUBLIC_URL: z.url().default('https://test-images.example.com'),

  // API Documentation
  API_TITLE: z.string().default('TáComQuem API'),
  API_DESCRIPTION: z.string().default('API para gestão de empréstimos pessoais entre amigos'),
  API_VERSION: z.string().default('1.0.0'),
  API_ENVIRONMENT_LABEL: z.string().default('Development'),

  // Beta Program
  BETA_MODE_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === '1')
    .or(z.boolean().default(false)),
});

const parsed = envSchema.safeParse(Bun.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
