import { Module } from '@nestjs/common';
import { AcademicYearsService } from './academic-years.service';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityWorkflowService } from './activity-workflow.service';
import { AcademicYearsController, ActivityCategoriesController, NotificationsController } from './admin.controllers';
import { CategoriesService } from './categories.service';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [ActivitiesController, AcademicYearsController, ActivityCategoriesController, NotificationsController],
  providers: [ActivitiesService, ActivityWorkflowService, AcademicYearsService, CategoriesService, NotificationsService],
  exports: [ActivitiesService, NotificationsService],
})
export class ActivitiesModule {}
