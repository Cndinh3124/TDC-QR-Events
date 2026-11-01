// Module bao cao DRL (giai doan 4)
import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [EventsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
