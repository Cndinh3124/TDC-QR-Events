// Cung cap AppEnv (da kiem tra) cho toan ung dung qua token APP_ENV
import { Global, Module } from '@nestjs/common';
import { loadEnv } from './env';

export const APP_ENV = 'APP_ENV';

@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: () => loadEnv() }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
