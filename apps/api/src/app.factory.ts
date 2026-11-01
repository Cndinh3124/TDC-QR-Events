// Cau hinh chung cho app that va app test
import { BadRequestException, INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppEnv } from './config/env';

export function configureApp(app: INestApplication, env: AppEnv): void {
  const express = app as NestExpressApplication;
  if (env.trustProxy) express.set('trust proxy', 1);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '100kb' }); // dac ta 8.3
  express.useBodyParser('urlencoded', { limit: '100kb', extended: false });

  // [BM] header bao mat - dac ta 8.5. API chi tra JSON nen CSP rat chat.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.nodeEnv === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  // [BM] whitelist + cam truong la; moi DTO deu duoc kiem tra - dac ta 8.3
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.flatMap((e) => Object.values(e.constraints ?? {}).map((m) => ({ field: e.property, message: m })));
        return new BadRequestException({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: details[0]?.message ?? 'Dữ liệu không hợp lệ.',
          details,
        });
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
