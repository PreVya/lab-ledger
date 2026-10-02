import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  const env = validateEnv();

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // [perf] Request timing — logs total controller time per HTTP request.
  app.use((req: any, res: any, next: any) => {
    const t0 = Date.now();
    res.on('finish', () => {
      // eslint-disable-next-line no-console
      console.log(`[perf] BE ${req.method} ${req.originalUrl ?? req.url} -> ${res.statusCode} ${Date.now() - t0}ms`);
    });
    next();
  });
  // Desktop (Electron) frontend origins are always allowed, plus any
  // comma-separated origins configured via CORS_ORIGIN in backend/.env.
  const desktopOrigins = [
    'http://127.0.0.1:5174',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ];
  app.enableCors({
    origin: Array.from(new Set([...env.CORS_ORIGIN, ...desktopOrigins])),
    credentials: true,
  });

  await app.listen(env.PORT);
  Logger.log(`API on :${env.PORT}/api`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] Fatal error starting server:', err?.message ?? err);
  process.exit(1);
});
