import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Unit } from '../units/entities/unit.entity';
import { AdminUser } from './entities/admin-user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser, Unit]), AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
