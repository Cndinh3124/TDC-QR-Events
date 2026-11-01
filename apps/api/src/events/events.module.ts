import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { Unit } from '../units/entities/unit.entity';
import { Event } from './entities/event.entity';
import { EventFacultyView } from './entities/event-faculty-view.entity';
import { EventQrToken } from './entities/event-qr-token.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { QrService } from './qr.service';
import { QrRenderService } from './qr-render.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event, EventQrToken, EventFacultyView, Unit]), SettingsModule],
  controllers: [EventsController],
  providers: [EventsService, QrService, QrRenderService],
  // QrService cho giai doan 3 (kiem tra token / ma 4 so khi diem danh); EventsService cho giai doan 4 (quyen xem / sua theo su kien)
  exports: [QrService, EventsService],
})
export class EventsModule {}
