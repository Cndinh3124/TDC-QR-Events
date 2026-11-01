import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.factory';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv(); // thieu / yeu bi mat thi throw -> khong khoi dong
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  configureApp(app, env);
  app.enableShutdownHooks();
  await app.listen(env.port, '0.0.0.0');
}

bootstrap().catch((e) => {
  console.error('Khong khoi dong duoc:', e.message);
  process.exit(1);
});
