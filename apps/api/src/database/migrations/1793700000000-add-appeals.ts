import { MigrationInterface, QueryRunner } from "typeorm";

// Giai doan 4: bang khieu nai (dac ta 3.5, 6) + cot ghi chu duyet tren luot diem danh. Viet tay vi co CHECK (TypeORM khong sinh cho MySQL).
export class AddAppeals1793700000000 implements MigrationInterface {
    name = 'AddAppeals1793700000000'

    public async up(q: QueryRunner): Promise<void> {
        await q.query("CREATE TABLE `appeals` (`id` char(36) NOT NULL, `event_id` varchar(36) NOT NULL, `attendance_id` char(36) NULL, `device_id` char(64) NULL, `mssv` varchar(20) NOT NULL, `full_name` varchar(100) NULL, `faculty_unit_id` varchar(36) NULL, `type` varchar(20) NOT NULL, `content` varchar(1000) NOT NULL, `status` varchar(10) NOT NULL DEFAULT 'PENDING', `deadline_at` datetime(3) NOT NULL, `handled_by` varchar(36) NULL, `handled_at` datetime(3) NULL, `resolution_note` varchar(500) NULL, `idempotency_key` char(36) NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_appeals_event_status` (`event_id`, `status`), INDEX `IDX_appeals_status_deadline` (`status`, `deadline_at`), INDEX `IDX_appeals_device` (`device_id`), UNIQUE INDEX `UQ_appeals_event_idem` (`event_id`, `idempotency_key`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
        await q.query("ALTER TABLE `appeals` ADD CONSTRAINT `FK_334b2cd1b1e45846401fdff034d` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION");
        await q.query("ALTER TABLE `appeals` ADD CONSTRAINT `CHK_appeals_status` CHECK (`status` IN ('PENDING', 'ACCEPTED', 'REJECTED'))");
        await q.query("ALTER TABLE `attendances` ADD `review_note` varchar(500) NULL AFTER `reviewed_at`");
        await q.query("ALTER TABLE `appeals` ADD CONSTRAINT `CHK_appeals_type` CHECK (`type` IN ('WRONG_INFO', 'NO_CHECKIN', 'PROXY_CHECKIN', 'DUPLICATE_MSSV'))");
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query("ALTER TABLE `attendances` DROP COLUMN `review_note`");
        await q.query("ALTER TABLE `appeals` DROP FOREIGN KEY `FK_334b2cd1b1e45846401fdff034d`");
        await q.query("DROP TABLE `appeals`");
    }
}
