// Module duyet luot diem danh + chot DRL (giai doan 4)
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { EventsModule } from '../events/events.module';
import { PublicModule } from '../public/public.module';
import { Attendance } from '../public/entities/attendance.entity';
import { AttendancesController } from './attendances.controller';
import { AttendancesService } from './attendances.service';
import { ReviewService } from './review.service';

@Module({
  imports: [TypeOrmModule.forFeature([Attendance, Event]), EventsModule, PublicModule],
  controllers: [AttendancesController],
  providers: [AttendancesService, ReviewService],
  exports: [ReviewService, AttendancesService],
})
export class AttendancesModule {}
