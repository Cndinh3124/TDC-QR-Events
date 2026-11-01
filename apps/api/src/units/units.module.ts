import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../users/entities/admin-user.entity';
import { Unit } from './entities/unit.entity';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [TypeOrmModule.forFeature([Unit, AdminUser])],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
