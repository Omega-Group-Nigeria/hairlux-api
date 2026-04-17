import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule);

  const expressApp = app.getHttpAdapter().getInstance() as {
    disable: (name: string) => void;
    set: (name: string, value: unknown) => void;
  };
  expressApp.disable('x-powered-by');
  if (isProduction) {
    expressApp.set('trust proxy', 1);
  }

  // Add common HTTP hardening headers (HSTS, frameguard, no-sniff, etc.)
  app.use(
    helmet({
      // Swagger UI needs inline scripts/styles; keep disabled globally for compatibility.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // Limit payload size to reduce abuse and accidental oversized requests.
  const bodyLimit = process.env.REQUEST_BODY_LIMIT || '100kb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // Enable CORS
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [];

  const allowAllOrigins = configuredOrigins.includes('*');
  const allowedOrigins = configuredOrigins.filter((origin) => origin !== '*');
  const devDefaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
  ];

  if (isProduction && (allowAllOrigins || allowedOrigins.length === 0)) {
    throw new Error(
      'ALLOWED_ORIGINS must be explicitly configured in production and cannot contain "*".',
    );
  }

  const effectiveOrigins =
    allowedOrigins.length > 0 ? allowedOrigins : devDefaultOrigins;

  if (!isProduction && allowAllOrigins) {
    logger.warn(
      'CORS is configured with wildcard origin in non-production mode.',
    );
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow server-to-server, health checks, curl, and Postman requests.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!isProduction && allowAllOrigins) {
        callback(null, true);
        return;
      }

      if (effectiveOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: !(allowAllOrigins && !isProduction),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      stopAtFirstError: true,
      validationError: {
        target: false,
        value: false,
      },
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const swaggerEnabled =
    process.env.SWAGGER_ENABLED === 'true' ||
    (!isProduction && process.env.SWAGGER_ENABLED !== 'false');

  if (swaggerEnabled) {
    // Swagger Configuration
    const config = new DocumentBuilder()
      .setTitle('HairLux API')
      .setDescription(
        'HairLux Beauty & Wellness Booking Platform API Documentation',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  if (swaggerEnabled) {
    logger.log(
      `Swagger documentation available at: http://localhost:${port}/api/docs`,
    );
  }
}
void bootstrap();
