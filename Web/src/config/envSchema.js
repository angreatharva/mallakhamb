import { z } from 'zod';
import { logger } from '../utils/logger';

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return value;
};

const booleanFlagSchema = (defaultValue) =>
  z.preprocess((value) => parseBoolean(value, defaultValue), z.boolean());

export const envSchema = z.object({
  VITE_API_URL: z.preprocess(
    (value) => (value === undefined || value === null ? '' : value),
    z.string().min(1, 'VITE_API_URL is required').url('VITE_API_URL must be a valid URL')
  ),
  VITE_ENABLE_PWA: booleanFlagSchema(false).default(false),
  VITE_ENABLE_I18N: booleanFlagSchema(false).default(false),
  VITE_ANALYTICS_ID: z.string().default(''),
  VITE_SENTRY_DSN: z.string().default(''),
});

const getIssueMessage = (issue) => {
  const field = issue.path[0] ?? 'environment';
  if (issue.code === 'invalid_type' && issue.input === undefined) {
    return `${field} is required but was not provided`;
  }

  return `${field}: ${issue.message}`;
};

export const validateEnv = (env = import.meta.env) => {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `- ${getIssueMessage(issue)}`).join('\n');
    throw new Error(`Environment validation failed:\n${details}`);
  }

  const validatedEnv = parsed.data;

  if (env.DEV) {
    logger.info('Validated environment configuration', validatedEnv);
  }

  return validatedEnv;
};
