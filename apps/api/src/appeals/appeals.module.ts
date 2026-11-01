// Module xu ly khieu nai (giai doan 4). Phia sinh vien nam o PublicModule (AppealPublicService).
import { Module } from '@nestjs/common';
import { AttendancesModule } from '../attendances/attendances.module';
import { EventsModule } from '../events/events.module';
import { AppealsController } from './appeals.controller';
import { AppealsService } from './appeals.service';

@Module({
  imports: [AttendancesModule, EventsModule],
  controllers: [AppealsController],
  providers: [AppealsService],
})
export class AppealsModule {}
