// Module diem danh cong khai (giai doan 3): API /api/public + worker gan co
import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { SettingsModule } from '../settings/settings.module';
import { AppealPublicService } from './appeal-public.service';
import { CheckinService } from './checkin.service';
import { CodeGuardService } from './code-guard.service';
import { DeviceService } from './device.service';
import { EditService } from './edit.service';
import { FlagWorker } from './flag.worker';
import { PublicContextService } from './public-context.service';
import { PublicController } from './public.controller';
import { PublicGuard } from './public.guard';
import { PublicLookupService } from './public-lookup.service';
import { QueryService } from './query.service';
import { RateLimitService } from './rate-limit.service';

@Module({
  imports: [EventsModule, SettingsModule],
  controllers: [PublicController],
  providers: [
    DeviceService, RateLimitService, PublicGuard, PublicContextService, PublicLookupService, CodeGuardService,
    CheckinService, EditService, QueryService, FlagWorker, AppealPublicService,
  ],
  // PublicLookupService: giai doan 4 dung lai kiem tra MSSV / khoa cho man duyet
  exports: [FlagWorker, PublicLookupService],
})
export class PublicModule {}
