import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

// Node resolves hostnames to IPv6 first by default. On networks where IPv6
// routing is broken (common cause of Prisma's "P1001 can't reach database
// server" against Supabase, even though the host is reachable over IPv4),
// this makes Node try IPv4 first instead.
setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Disable Express's default auto-ETag caching. For a JSON API hit by a
  // mobile client, this caused the server to reply "304 Not Modified" with
  // NO response body whenever an identical request repeated — which the
  // frontend networking layer swallowed silently (no data, no error, no log).
  // JSON APIs generally shouldn't rely on ETag/304 semantics like this.
  app.getHttpAdapter().getInstance().set('etag', false);

  // Simple request logger — prints every incoming request (method, url, query,
  // body) and its response status/time to the terminal. This is what makes
  // issues like "mosque not showing" instantly diagnosable: you'll literally
  // see the request hit the server (or NOT hit it at all, which is itself
  // useful info), what params it received, and what it sent back.
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    console.log(`➡️  ${req.method} ${req.originalUrl}`, Object.keys(req.query || {}).length ? { query: req.query } : '');
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`⬅️  ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
    });
    next();
  });

  // Enable CORS for mobile app
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Set global prefix
  app.setGlobalPrefix(configService.get<string>('API_PREFIX', 'api/v1'));

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  
  console.log(`🚀 Rental Platform API Server running on port ${port}`);
  console.log(`📍 Environment: ${configService.get<string>('NODE_ENV')}`);
}

bootstrap();