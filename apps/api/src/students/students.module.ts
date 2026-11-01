// Module ho so sinh vien (giai doan 4)
import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { PublicModule } from '../public/public.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [EventsModule, PublicModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
