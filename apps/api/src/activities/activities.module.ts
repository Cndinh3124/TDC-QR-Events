import { Module } from '@nestjs/common';
import { AcademicYearsService } from './academic-years.service';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityWorkflowService } from './activity-workflow.service';
import { ActivityStatsService } from './activity-stats.service';
import { AcademicYearsController, ActivityCategoriesController, ActivityStatsController, NotificationsController } from './admin.controllers';
import { CategoriesService } from './categories.service';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [ActivitiesController, AcademicYearsController, ActivityCategoriesController, NotificationsController, ActivityStatsController],
  providers: [ActivitiesService, ActivityStatsService, ActivityWorkflowService, AcademicYearsService, CategoriesService, NotificationsService],
  exports: [ActivitiesService, NotificationsService],
})
export class ActivitiesModule {}
