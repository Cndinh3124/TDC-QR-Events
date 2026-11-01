import { MigrationInterface, QueryRunner } from 'typeorm';

// Giai doan 6: module Quan ly hoat dong (nam hoc, linh vuc, hoat dong, link, phien ban, binh luan,
// thong bao, quy trinh). Viet tay vi co CHECK (TypeORM khong sinh cho MySQL). Dac ta quan-ly-hoat-dong 3, 4, 11.
export class AddActivities1793800000000 implements MigrationInterface {
  name = 'AddActivities1793800000000';

  public async up(q: QueryRunner): Promise<void> {
    const ts = '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)';

    await q.query(`CREATE TABLE \`academic_years\` (\`id\` char(36) NOT NULL, \`name\` varchar(20) NOT NULL, \`start_date\` date NOT NULL, \`end_date\` date NOT NULL, \`plan_deadline\` date NULL, \`report_deadline\` date NULL, \`locked_at\` datetime(3) NULL, ${ts}, UNIQUE INDEX \`UQ_academic_years_name\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query('ALTER TABLE `academic_years` ADD CONSTRAINT `CHK_academic_years_range` CHECK (`end_date` > `start_date`)');

    await q.query(`CREATE TABLE \`activity_categories\` (\`id\` char(36) NOT NULL, \`name\` varchar(100) NOT NULL, \`position\` int NOT NULL DEFAULT 0, \`is_active\` tinyint NOT NULL DEFAULT 1, ${ts}, UNIQUE INDEX \`UQ_activity_categories_name\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);

    // so thu tu ma hoat dong theo nam; khoa dong khi cap ma de khong trung, khong nhay so (dac ta 3.1)
    await q.query('CREATE TABLE `activity_code_sequences` (`year` int NOT NULL, `last_value` int NOT NULL DEFAULT 0, PRIMARY KEY (`year`)) ENGINE=InnoDB');

    await q.query(`CREATE TABLE \`activities\` (
      \`id\` char(36) NOT NULL, \`code\` varchar(20) NOT NULL, \`academic_year_id\` char(36) NOT NULL, \`unit_id\` varchar(36) NOT NULL, \`category_id\` char(36) NULL,
      \`level\` varchar(10) NOT NULL DEFAULT 'FACULTY', \`name\` varchar(255) NOT NULL, \`start_at\` datetime(3) NOT NULL, \`end_at\` datetime(3) NOT NULL,
      \`location\` varchar(255) NULL, \`mode\` varchar(10) NOT NULL DEFAULT 'ONSITE', \`target_audience\` varchar(255) NULL,
      \`expected_count\` int NULL, \`manual_count\` int NULL, \`budget_planned\` bigint NULL, \`budget_actual\` bigint NULL,
      \`owner_name\` varchar(120) NULL, \`owner_phone\` varchar(20) NULL, \`plan_url\` varchar(2048) NULL, \`note\` varchar(1000) NULL,
      \`status\` varchar(20) NOT NULL DEFAULT 'DRAFT', \`return_note\` varchar(1000) NULL, \`returned_at\` datetime(3) NULL, \`submitted_at\` datetime(3) NULL,
      \`evaluation\` varchar(15) NULL, \`evaluation_note\` varchar(1000) NULL, \`evaluated_by\` varchar(36) NULL, \`evaluated_at\` datetime(3) NULL,
      \`reward\` varchar(10) NULL, \`reward_note\` varchar(1000) NULL, \`locked_at\` datetime(3) NULL, \`created_by\` varchar(36) NOT NULL, ${ts},
      UNIQUE INDEX \`UQ_activities_code\` (\`code\`), INDEX \`IDX_activities_year_unit\` (\`academic_year_id\`, \`unit_id\`), INDEX \`IDX_activities_status\` (\`status\`), INDEX \`IDX_activities_start\` (\`start_at\`), INDEX \`IDX_activities_unit\` (\`unit_id\`),
      PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query('ALTER TABLE `activities` ADD CONSTRAINT `FK_activities_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT');
    await q.query('ALTER TABLE `activities` ADD CONSTRAINT `FK_activities_unit` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE RESTRICT');
    await q.query('ALTER TABLE `activities` ADD CONSTRAINT `FK_activities_category` FOREIGN KEY (`category_id`) REFERENCES `activity_categories`(`id`) ON DELETE RESTRICT');
    await q.query("ALTER TABLE `activities` ADD CONSTRAINT `CHK_activities_status` CHECK (`status` IN ('DRAFT','PENDING_PLAN','IN_PROGRESS','PENDING_EVAL','EVALUATED','LOCKED'))");
    await q.query("ALTER TABLE `activities` ADD CONSTRAINT `CHK_activities_level` CHECK (`level` IN ('SCHOOL','FACULTY','CLASS'))");
    await q.query("ALTER TABLE `activities` ADD CONSTRAINT `CHK_activities_mode` CHECK (`mode` IN ('ONSITE','ONLINE','HYBRID'))");
    await q.query("ALTER TABLE `activities` ADD CONSTRAINT `CHK_activities_evaluation` CHECK (`evaluation` IS NULL OR `evaluation` IN ('COMPLETED','NOT_COMPLETED'))");
    await q.query("ALTER TABLE `activities` ADD CONSTRAINT `CHK_activities_reward` CHECK (`reward` IS NULL OR `reward` IN ('APPROVED','REJECTED'))");
    await q.query('ALTER TABLE `activities` ADD CONSTRAINT `CHK_activities_range` CHECK (`end_at` > `start_at`)');

    await q.query('CREATE TABLE `activity_links` (`id` char(36) NOT NULL, `activity_id` char(36) NOT NULL, `group` varchar(12) NOT NULL, `type` varchar(12) NOT NULL DEFAULT \'OTHER\', `url` varchar(2048) NOT NULL, `url_hash` char(64) NOT NULL, `published_on` date NULL, `position` int NOT NULL DEFAULT 1, `needs_review` tinyint NOT NULL DEFAULT 0, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_activity_links_url` (`activity_id`, `url_hash`), PRIMARY KEY (`id`)) ENGINE=InnoDB');
    await q.query('ALTER TABLE `activity_links` ADD CONSTRAINT `FK_activity_links_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE CASCADE');
    await q.query("ALTER TABLE `activity_links` ADD CONSTRAINT `CHK_activity_links_group` CHECK (`group` IN ('MEDIA','PUBLICATION','RESULT'))");

    await q.query('CREATE TABLE `activity_co_units` (`activity_id` char(36) NOT NULL, `unit_id` varchar(36) NOT NULL, INDEX `IDX_activity_co_units_unit` (`unit_id`), PRIMARY KEY (`activity_id`, `unit_id`)) ENGINE=InnoDB');
    await q.query('ALTER TABLE `activity_co_units` ADD CONSTRAINT `FK_activity_co_units_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE CASCADE');
    await q.query('ALTER TABLE `activity_co_units` ADD CONSTRAINT `FK_activity_co_units_unit` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE RESTRICT');

    // lien ket hoat dong <-> buoi diem danh (su kien QR) - so nguoi tham gia thuc te lay tu day (dac ta 3.1)
    await q.query('CREATE TABLE `activity_events` (`activity_id` char(36) NOT NULL, `event_id` char(36) NOT NULL, INDEX `IDX_activity_events_event` (`event_id`), PRIMARY KEY (`activity_id`, `event_id`)) ENGINE=InnoDB');
    await q.query('ALTER TABLE `activity_events` ADD CONSTRAINT `FK_activity_events_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE CASCADE');
    await q.query('ALTER TABLE `activity_events` ADD CONSTRAINT `FK_activity_events_event` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT');

    await q.query('CREATE TABLE `activity_versions` (`id` char(36) NOT NULL, `activity_id` char(36) NOT NULL, `version` int NOT NULL, `action` varchar(30) NOT NULL, `changed_by` varchar(36) NOT NULL, `changed_at` datetime(3) NOT NULL, `diff_json` json NULL, `snapshot_json` json NOT NULL, UNIQUE INDEX `UQ_activity_versions` (`activity_id`, `version`), PRIMARY KEY (`id`)) ENGINE=InnoDB');
    await q.query('ALTER TABLE `activity_versions` ADD CONSTRAINT `FK_activity_versions_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE CASCADE');

    await q.query('CREATE TABLE `workflow_actions` (`id` char(36) NOT NULL, `entity_type` varchar(20) NOT NULL, `entity_id` char(36) NOT NULL, `action` varchar(20) NOT NULL, `actor_id` varchar(36) NOT NULL, `note` varchar(1000) NULL, `created_at` datetime(3) NOT NULL, INDEX `IDX_workflow_entity` (`entity_type`, `entity_id`, `created_at`), PRIMARY KEY (`id`)) ENGINE=InnoDB');

    await q.query('CREATE TABLE `comments` (`id` char(36) NOT NULL, `entity_type` varchar(20) NOT NULL, `entity_id` char(36) NOT NULL, `author_id` varchar(36) NOT NULL, `content` varchar(2000) NOT NULL, `created_at` datetime(3) NOT NULL, INDEX `IDX_comments_entity` (`entity_type`, `entity_id`, `created_at`), PRIMARY KEY (`id`)) ENGINE=InnoDB');

    await q.query('CREATE TABLE `notifications` (`id` char(36) NOT NULL, `user_id` varchar(36) NOT NULL, `type` varchar(30) NOT NULL, `message` varchar(300) NOT NULL, `entity_type` varchar(20) NULL, `entity_id` char(36) NULL, `read_at` datetime(3) NULL, `created_at` datetime(3) NOT NULL, INDEX `IDX_notifications_user` (`user_id`, `read_at`, `created_at`), PRIMARY KEY (`id`)) ENGINE=InnoDB');
    await q.query('ALTER TABLE `notifications` ADD CONSTRAINT `FK_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE');

    // linh vuc hoat dong nap san (dac ta quan-ly-hoat-dong 3.1); Doan truong sua / them o man Cau hinh
    const cats = ['Chính trị – tư tưởng', 'Tình nguyện', 'Học thuật – NCKH', 'Văn hóa – văn nghệ', 'Thể dục thể thao', 'Kỹ năng – hội nhập', 'Xây dựng tổ chức Đoàn – Hội', 'Khác'];
    for (const [i, name] of cats.entries()) {
      await q.query('INSERT INTO `activity_categories` (`id`, `name`, `position`) VALUES (UUID(), ?, ?)', [name, i + 1]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['notifications', 'comments', 'workflow_actions', 'activity_versions', 'activity_events', 'activity_co_units', 'activity_links', 'activities', 'activity_code_sequences', 'activity_categories', 'academic_years']) {
      await q.query(`DROP TABLE \`${t}\``);
    }
  }
}
