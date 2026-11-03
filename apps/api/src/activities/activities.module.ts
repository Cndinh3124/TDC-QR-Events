import { Module } from '@nestjs/common';
import { AcademicYearsService } from './academic-years.service';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityWorkflowService } from './activity-workflow.service';
import { ActivityStatsService } from './activity-stats.service';
import {
  AcademicYearsController, ActivityCalendarController, ActivityCategoriesController, ActivityStatsController, NotificationsController,
} from './admin.controllers';
import { CalendarService } from './calendar.service';
import { EventsModule } from '../events/events.module';
import { CategoriesService } from './categories.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [EventsModule],
  controllers: [
    ActivitiesController, AcademicYearsController, ActivityCategoriesController, NotificationsController, ActivityStatsController,
    ActivityCalendarController,
  ],
  providers: [CalendarService, ActivitiesService, ActivityStatsService, ActivityWorkflowService, AcademicYearsService, CategoriesService, NotificationsService],
  exports: [ActivitiesService, NotificationsService],
})
export class ActivitiesModule {}
