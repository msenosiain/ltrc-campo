import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const express = require('express');
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  const configService = app.get(ConfigService);

  Logger.log('Enabling CORS');
  const corsAllowedOrigins = String(
    configService.get<string | undefined>('API_CORS_ALLOWED_ORIGINS') || ''
  );

  // Parse CSV, trim and remove empty entries
  const corsAllowedOriginsArray = corsAllowedOrigins
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // If user explicitly set '*' anywhere, allow all origins (useful for tests/dev)
  const allowsAll = corsAllowedOriginsArray.includes('*');

  if (corsAllowedOriginsArray.length === 0) {
    // No config provided -> allow all (useful for local dev). Keep credentials enabled.
    app.enableCors({ origin: true, credentials: true });
  } else if (allowsAll) {
    app.enableCors({ origin: true, credentials: true });
  } else {
    // Use a function so we can allow requests without Origin (curl, server-to-server)
    app.enableCors({
      origin: (origin, callback) => {
        // If no origin (non-browser request), allow it
        if (!origin) return callback(null, true);

        // Direct match
        if (corsAllowedOriginsArray.includes(origin)) {
          return callback(null, true);
        }

        // Also allow passing just the host without protocol if configured that way
        const originHost = origin
          .replace(/^https?:\/\//, '')
          .replace(/:\d+$/, '');
        if (
          corsAllowedOriginsArray.some(
            (o) => o.replace(/^https?:\/\//, '') === originHost
          )
        ) {
          return callback(null, true);
        }

        // Not allowed
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    });
  }

  // Fallback middleware to ensure Access-Control headers are present for browsers
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers?.origin;
    if (!origin) return next();

    const originHost = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    const allowed =
      allowsAll ||
      corsAllowedOriginsArray.includes(origin) ||
      corsAllowedOriginsArray.includes(originHost) ||
      corsAllowedOriginsArray.some(
        (o) => o.replace(/^https?:\/\//, '') === originHost
      );

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
      res.setHeader('Vary', 'Origin');

      if (req.method === 'OPTIONS') {
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,POST,PUT,DELETE,OPTIONS'
        );
        res.statusCode = 204;
        return res.end();
      }
    }

    return next();
  });

  Logger.log('Adding global prefix');
  const rawGlobalPrefix = String(
    configService.get<string>('API_GLOBAL_PREFIX', '/api/v1')
  );
  // Normalize to avoid repeated slashes and ensure we pass a prefix without leading slash to Nest
  const normalizedPrefix = rawGlobalPrefix.replace(/^\/+|\/+$/g, '');
  // If nothing left (root), leave it empty so setGlobalPrefix won't add an extra slash
  const prefixForNest = normalizedPrefix || '';
  app.setGlobalPrefix(prefixForNest);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    })
  );

  const port = process.env['PORT'] || configService.get<number>('API_PORT') || 3000;
  await app.listen(port);

  // Show a friendly URL with leading slash (even if we passed the prefix without it to Nest)
  const displayPrefix = prefixForNest ? `/${prefixForNest}` : '';
  Logger.log(`Listening at http://localhost:${port}${displayPrefix}`);
}

bootstrap();
