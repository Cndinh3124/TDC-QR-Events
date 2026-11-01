// Module dung chung: JWT, guard toan cuc, kiem tra pham vi don vi
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';
import { Unit } from '../units/entities/unit.entity';
import { AdminUser } from '../users/entities/admin-user.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UnitScopeService } from './unit-scope.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Unit, AdminUser]),
    JwtModule.registerAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        secret: env.jwtAccessSecret,
        // [BM] access token song ngan 15 phut - dac ta 8.1
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
      }),
    }),
  ],
  providers: [
    UnitScopeService,
    // thu tu: gioi han tan suat -> xac thuc -> vai tro
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule, UnitScopeService, TypeOrmModule],
})
export class CommonModule {}
