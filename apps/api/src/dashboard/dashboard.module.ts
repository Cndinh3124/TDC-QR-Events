// Module tong quan + nhac viec (giai doan 5)
import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [EventsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
