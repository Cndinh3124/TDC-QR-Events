import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1793495899423 implements MigrationInterface {
    name = 'InitSchema1793495899423'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`units\` (\`id\` varchar(36) NOT NULL, \`name\` varchar(150) NOT NULL, \`code\` varchar(20) NOT NULL, \`type\` varchar(10) NOT NULL, \`parent_id\` varchar(36) NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_47635c1ab22d02fc3ebae3608b\` (\`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`admin_users\` (\`id\` varchar(36) NOT NULL, \`email\` varchar(190) NOT NULL, \`full_name\` varchar(120) NOT NULL, \`password_hash\` varchar(255) NOT NULL, \`role\` varchar(20) NOT NULL, \`unit_id\` varchar(36) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`must_change_password\` tinyint NOT NULL DEFAULT 1, \`failed_login_count\` int NOT NULL DEFAULT '0', \`locked_until\` datetime NULL, \`last_login_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_dcd0c8a4b10af9c986e510b9ec\` (\`email\`), INDEX \`IDX_d211409f53da25fd95f62f33c4\` (\`unit_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`refresh_tokens\` (\`id\` varchar(36) NOT NULL, \`user_id\` varchar(36) NOT NULL, \`token_hash\` char(64) NOT NULL, \`expires_at\` datetime NOT NULL, \`revoked_at\` datetime NULL, \`replaced_by\` varchar(36) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_3ddc983c5f7bcf132fd8732c3f\` (\`user_id\`), UNIQUE INDEX \`IDX_a7838d2ba25be1342091b6695f\` (\`token_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`system_settings\` (\`key\` varchar(100) NOT NULL, \`value_json\` json NOT NULL, \`updated_by\` varchar(36) NULL, \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`key\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`audit_logs\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`actor_id\` varchar(36) NULL, \`action\` varchar(60) NOT NULL, \`entity\` varchar(40) NOT NULL, \`entity_id\` varchar(64) NULL, \`before_json\` json NULL, \`after_json\` json NULL, \`reason\` varchar(500) NULL, \`ip\` varchar(64) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_177183f29f438c488b5e8510cd\` (\`actor_id\`), INDEX \`IDX_2cd10fda8276bb995288acfbfb\` (\`created_at\`), INDEX \`IDX_82edbc5f8a1821ff01b8b9c865\` (\`entity\`, \`entity_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`units\` ADD CONSTRAINT \`FK_e0d04b0849a3cde857ececa8adb\` FOREIGN KEY (\`parent_id\`) REFERENCES \`units\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`admin_users\` ADD CONSTRAINT \`FK_d211409f53da25fd95f62f33c45\` FOREIGN KEY (\`unit_id\`) REFERENCES \`units\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_3ddc983c5f7bcf132fd8732c3f4\` FOREIGN KEY (\`user_id\`) REFERENCES \`admin_users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);

        // --- nap san du lieu goc (dac ta 2.1, 6) ---
        // Doan truong + 9 khoa. Ma khoa la de xuat, Doan truong sua duoc trong trang quan tri.
        const units: Array<[string, string, string]> = [
            ['Đoàn Thanh niên – Hội Sinh viên trường', 'DTN', 'SCHOOL'],
            ['Khoa Công nghệ thông tin', 'CNTT', 'FACULTY'],
            ['Khoa Động lực', 'DL', 'FACULTY'],
            ['Khoa Công nghệ tự động', 'CNTD', 'FACULTY'],
            ['Khoa Điện – Điện tử', 'DDT', 'FACULTY'],
            ['Khoa Đông phương', 'DP', 'FACULTY'],
            ['Khoa Tiếng Anh', 'TA', 'FACULTY'],
            ['Khoa Kinh tế', 'KT', 'FACULTY'],
            ['Khoa Du lịch – Khách sạn', 'DLKS', 'FACULTY'],
            ['Khoa Cơ khí', 'CK', 'FACULTY'],
        ];
        for (const [name, code, type] of units) {
            await queryRunner.query('INSERT INTO `units` (`id`, `name`, `code`, `type`) VALUES (UUID(), ?, ?, ?)', [name, code, type]);
        }
        // cac khoa thuoc Doan truong (cay don vi 2 cap)
        await queryRunner.query("UPDATE `units` SET `parent_id` = (SELECT `id` FROM (SELECT `id` FROM `units` WHERE `code` = 'DTN') AS s) WHERE `type` = 'FACULTY'");
        // cau hinh mac dinh (dac ta 3.5, 3.8, 6)
        const settings: Array<[string, unknown]> = [
            ['mssv_regex', '^\\d{5}[A-Z]{2}\\d{4}$'],
            ['appeal_days', 7],
            ['default_open_before_min', 30],
            ['default_grace_min', 15],
            ['data_retention_months', 6],
        ];
        for (const [key, value] of settings) {
            await queryRunner.query('INSERT INTO `system_settings` (`key`, `value_json`) VALUES (?, ?)', [key, JSON.stringify(value)]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_3ddc983c5f7bcf132fd8732c3f4\``);
        await queryRunner.query(`ALTER TABLE \`admin_users\` DROP FOREIGN KEY \`FK_d211409f53da25fd95f62f33c45\``);
        await queryRunner.query(`ALTER TABLE \`units\` DROP FOREIGN KEY \`FK_e0d04b0849a3cde857ececa8adb\``);
        await queryRunner.query(`DROP INDEX \`IDX_82edbc5f8a1821ff01b8b9c865\` ON \`audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_2cd10fda8276bb995288acfbfb\` ON \`audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_177183f29f438c488b5e8510cd\` ON \`audit_logs\``);
        await queryRunner.query(`DROP TABLE \`audit_logs\``);
        await queryRunner.query(`DROP TABLE \`system_settings\``);
        await queryRunner.query(`DROP INDEX \`IDX_a7838d2ba25be1342091b6695f\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_3ddc983c5f7bcf132fd8732c3f\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_d211409f53da25fd95f62f33c4\` ON \`admin_users\``);
        await queryRunner.query(`DROP INDEX \`IDX_dcd0c8a4b10af9c986e510b9ec\` ON \`admin_users\``);
        await queryRunner.query(`DROP TABLE \`admin_users\``);
        await queryRunner.query(`DROP INDEX \`IDX_47635c1ab22d02fc3ebae3608b\` ON \`units\``);
        await queryRunner.query(`DROP TABLE \`units\``);
    }

}
