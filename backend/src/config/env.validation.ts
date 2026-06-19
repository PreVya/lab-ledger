/**
 * Environment validation — runs once at boot.
 * Fails fast with a clear, human-readable error if required vars are missing
 * or malformed. No credentials are ever logged.
 */

export interface AppEnv {
  DATABASE_URL: string;
  DIRECT_URL?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  PORT: number;
  CORS_ORIGIN: string[];
}

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(
    '\n[config] Invalid environment configuration:\n  - ' +
      msg +
      '\n\nCopy backend/.env.example to backend/.env and fill in the values.\n',
  );
  process.exit(1);
}

function assertPostgresUrl(url: string) {
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    fail(
      'DATABASE_URL must be a PostgreSQL connection string starting with "postgresql://" ' +
        '(e.g. a Supabase Database → Connection string URI).',
    );
  }
}

export function validateEnv(): AppEnv {
  const errors: string[] = [];

  const DATABASE_URL = process.env.DATABASE_URL?.trim();
  if (!DATABASE_URL) {
    errors.push(
      'DATABASE_URL is required. Set it to your Supabase PostgreSQL connection string ' +
        '(Project Settings → Database → Connection string).',
    );
  }

  const JWT_SECRET = process.env.JWT_SECRET?.trim();
  if (!JWT_SECRET || JWT_SECRET.length < 16) {
    errors.push('JWT_SECRET is required and must be at least 16 characters.');
  }

  if (errors.length) fail(errors.join('\n  - '));

  assertPostgresUrl(DATABASE_URL!);

  return {
    DATABASE_URL: DATABASE_URL!,
    DIRECT_URL: process.env.DIRECT_URL?.trim() || undefined,
    JWT_SECRET: JWT_SECRET!,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || '12h',
    PORT: Number(process.env.PORT) || 3000,
    CORS_ORIGIN: (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
