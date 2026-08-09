import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1, 'HOST обязателен').default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z
    .string()
    .url('CLIENT_ORIGIN должен быть полным URL')
    .default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
  DATABASE_SCHEMA: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .optional(),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET слишком короткий'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET слишком короткий'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  BOOTSTRAP_ADMIN_LOGIN: z.string().default('admin'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Некорректная конфигурация окружения:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const useSecureCookies = new URL(env.CLIENT_ORIGIN).protocol === 'https:';
