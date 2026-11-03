import { MigrationInterface, QueryRunner } from "typeorm";

// Sua loi review 02/11/2026: ho so sinh vien da duoc quan tri sua (ten / khoa) thi lan diem danh sau
// khong duoc ghi de bang thong tin sinh vien tu nhap. Viet tay, them mot cot co.
export class StudentProfileLock1793900000000 implements MigrationInterface {
    name = 'StudentProfileLock1793900000000'

    public async up(q: QueryRunner): Promise<void> {
        await q.query("ALTER TABLE `students` ADD `profile_locked` tinyint(1) NOT NULL DEFAULT 0 AFTER `merged_into`");
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query("ALTER TABLE `students` DROP COLUMN `profile_locked`");
    }
}
