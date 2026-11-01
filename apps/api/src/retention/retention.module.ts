import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RetentionService } from './retention.service';

@Module({ imports: [SettingsModule], providers: [RetentionService], exports: [RetentionService] })
export class RetentionModule {}
