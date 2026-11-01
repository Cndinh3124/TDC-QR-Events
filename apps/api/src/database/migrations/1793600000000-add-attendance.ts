import { MigrationInterface, QueryRunner } from "typeorm";

// Giai doan 3: bang diem danh cong khai (dac ta 6) + hang doi viec nen + bang dem + tran nhap sai ma 4 so.
// Viet tay: co CHECK (TypeORM khong sinh cho MySQL) va them cau hinh moi.
export class AddAttendance1793600000000 implements MigrationInterface {
    name = 'AddAttendance1793600000000'

    public async up(q: QueryRunner): Promise<void> {
        await q.query("CREATE TABLE `devices` (`id` char(64) NOT NULL, `first_seen_at` datetime(3) NOT NULL, `last_seen_at` datetime(3) NOT NULL, `fingerprint_hash` char(64) NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `students` (`mssv` varchar(20) NOT NULL, `full_name_latest` varchar(100) NOT NULL, `faculty_unit_id` varchar(36) NOT NULL, `first_seen_at` datetime(3) NOT NULL, `merged_into` varchar(20) NULL, PRIMARY KEY (`mssv`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `student_devices` (`mssv` varchar(20) NOT NULL, `device_id` char(64) NOT NULL, `first_seen_at` datetime(3) NOT NULL, `last_seen_at` datetime(3) NOT NULL, INDEX `IDX_dbe9204037aed1597be35a3349` (`device_id`), PRIMARY KEY (`mssv`, `device_id`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `attendances` (`id` char(36) NOT NULL, `event_id` varchar(36) NOT NULL, `device_id` char(64) NULL, `mssv` varchar(20) NOT NULL, `full_name` varchar(100) NOT NULL, `email` varchar(150) NULL, `faculty_unit_id` varchar(36) NOT NULL, `checkin_at` datetime(3) NOT NULL, `checkout_at` datetime(3) NULL, `timeliness` varchar(10) NOT NULL, `lat` decimal(9,6) NULL, `lng` decimal(9,6) NULL, `gps_accuracy_m` int NULL, `distance_m` int NULL, `ip` varchar(45) NULL, `user_agent` varchar(255) NULL, `edit_count` tinyint NOT NULL DEFAULT 0, `source` varchar(10) NOT NULL DEFAULT 'SELF', `review_status` varchar(10) NOT NULL DEFAULT 'PENDING', `reviewed_by` varchar(36) NULL, `reviewed_at` datetime(3) NULL, `drl_awarded` tinyint NULL, `confirm_code` varchar(8) NOT NULL, `idempotency_key` char(36) NULL, `checkout_idempotency_key` char(36) NULL, `code_fail_count` tinyint NOT NULL DEFAULT 0, `code_locked_until` datetime(3) NULL, `voided_at` datetime(3) NULL, `void_reason` varchar(500) NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_attendances_event_device` (`event_id`, `device_id`), UNIQUE INDEX `UQ_attendances_event_idem` (`event_id`, `idempotency_key`), INDEX `IDX_attendances_event_mssv` (`event_id`, `mssv`), INDEX `IDX_attendances_mssv_checkin` (`mssv`, `checkin_at`), INDEX `IDX_attendances_event_review` (`event_id`, `review_status`), INDEX `IDX_attendances_device` (`device_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `attendance_flags` (`id` bigint NOT NULL AUTO_INCREMENT, `attendance_id` char(36) NOT NULL, `code` varchar(30) NOT NULL, `detail_json` json NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_attendance_flags_code` (`attendance_id`, `code`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `attendance_edits` (`id` bigint NOT NULL AUTO_INCREMENT, `attendance_id` char(36) NOT NULL, `old_json` json NOT NULL, `new_json` json NOT NULL, `actor_type` varchar(10) NOT NULL, `actor_id` varchar(64) NOT NULL, `reason` varchar(500) NULL, `idempotency_key` char(36) NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_attendance_edits_idem` (`attendance_id`, `idempotency_key`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `attendance_jobs` (`id` bigint NOT NULL AUTO_INCREMENT, `attendance_id` char(36) NOT NULL, `status` varchar(10) NOT NULL DEFAULT 'PENDING', `run_at` datetime(3) NOT NULL, `attempts` tinyint NOT NULL DEFAULT 0, `payload_json` json NULL, `created_at` datetime(3) NOT NULL, INDEX `IDX_attendance_jobs_status_run` (`status`, `run_at`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `event_counters` (`event_id` varchar(36) NOT NULL, `slot` tinyint NOT NULL, `checkin_count` int NOT NULL DEFAULT 0, `checkout_count` int NOT NULL DEFAULT 0, `on_time_count` int NOT NULL DEFAULT 0, `late_count` int NOT NULL DEFAULT 0, PRIMARY KEY (`event_id`, `slot`)) ENGINE=InnoDB");
        await q.query("CREATE TABLE `event_code_failures` (`event_id` varchar(36) NOT NULL, `window_started_at` datetime(3) NOT NULL, `fail_count` int NOT NULL DEFAULT 0, PRIMARY KEY (`event_id`)) ENGINE=InnoDB");

        // khoa ngoai: RESTRICT cho du lieu diem danh (khong xoa cung su kien / khoa / thiet bi da co luot)
        await q.query("ALTER TABLE `students` ADD CONSTRAINT `FK_963bdc02f19fcfe643659166cd9` FOREIGN KEY (`faculty_unit_id`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `student_devices` ADD CONSTRAINT `FK_dbe9204037aed1597be35a3349f` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `FK_c162246e3ed30830a054231629f` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `FK_b58d23787d8a7cf7b553828daac` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `FK_33badc6cd3ad9a0fdba94138c29` FOREIGN KEY (`faculty_unit_id`) REFERENCES `units`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `attendance_flags` ADD CONSTRAINT `FK_c6e889043ab0fe4e9b0266ef0f8` FOREIGN KEY (`attendance_id`) REFERENCES `attendances`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `attendance_edits` ADD CONSTRAINT `FK_debfd4486445a3521fbe1e2fcf3` FOREIGN KEY (`attendance_id`) REFERENCES `attendances`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `event_counters` ADD CONSTRAINT `FK_27ff37db67dba67a42b33305c1c` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `event_code_failures` ADD CONSTRAINT `FK_d8261c4e2a068813d82aeed9bc5` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION");

        // CHECK viet tay. [BM] MySQL cho qua CHECK khi bieu thuc ra NULL nen moi nhanh deu IS NOT NULL tuong minh
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `CHK_attendances_edit_count` CHECK (`edit_count` IS NOT NULL AND `edit_count` BETWEEN 0 AND 3)");
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `CHK_attendances_timeliness` CHECK (`timeliness` IN ('ON_TIME', 'LATE'))");
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `CHK_attendances_review` CHECK (`review_status` IN ('PENDING', 'APPROVED', 'REJECTED'))");
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `CHK_attendances_gps` CHECK ((`lat` IS NULL AND `lng` IS NULL) OR (`lat` IS NOT NULL AND `lng` IS NOT NULL AND `lat` BETWEEN -90 AND 90 AND `lng` BETWEEN -180 AND 180))");
        await q.query("ALTER TABLE `attendances` ADD CONSTRAINT `CHK_attendances_checkout` CHECK (`checkout_at` IS NULL OR `checkout_at` >= `checkin_at`)");

        // cau hinh moi: thiet bi tung gan MSSV khac trong bao nhieu ngay thi gan co DEVICE_MULTI_MSSV (dac ta 5.3 ghi "hoc ky")
        await q.query("INSERT INTO `system_settings` (`key`, `value_json`) VALUES (?, ?)", ['device_mssv_window_days', JSON.stringify(180)]);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query("DELETE FROM `system_settings` WHERE `key` = 'device_mssv_window_days'");
        await q.query("ALTER TABLE `event_code_failures` DROP FOREIGN KEY `FK_d8261c4e2a068813d82aeed9bc5`");
        await q.query("ALTER TABLE `event_counters` DROP FOREIGN KEY `FK_27ff37db67dba67a42b33305c1c`");
        await q.query("ALTER TABLE `attendance_edits` DROP FOREIGN KEY `FK_debfd4486445a3521fbe1e2fcf3`");
        await q.query("ALTER TABLE `attendance_flags` DROP FOREIGN KEY `FK_c6e889043ab0fe4e9b0266ef0f8`");
        await q.query("ALTER TABLE `attendances` DROP FOREIGN KEY `FK_33badc6cd3ad9a0fdba94138c29`");
        await q.query("ALTER TABLE `attendances` DROP FOREIGN KEY `FK_b58d23787d8a7cf7b553828daac`");
        await q.query("ALTER TABLE `attendances` DROP FOREIGN KEY `FK_c162246e3ed30830a054231629f`");
        await q.query("ALTER TABLE `student_devices` DROP FOREIGN KEY `FK_dbe9204037aed1597be35a3349f`");
        await q.query("ALTER TABLE `students` DROP FOREIGN KEY `FK_963bdc02f19fcfe643659166cd9`");
        for (const t of ['event_code_failures', 'event_counters', 'attendance_jobs', 'attendance_edits', 'attendance_flags', 'attendances', 'student_devices', 'students', 'devices']) {
            await q.query(`DROP TABLE \`${t}\``);
        }
    }

}
