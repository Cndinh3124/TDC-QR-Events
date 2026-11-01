import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenService } from './token.service';
import { AdminUser } from '../users/entities/admin-user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RefreshToken, AdminUser])],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [TokenService],
})
export class AuthModule {}
