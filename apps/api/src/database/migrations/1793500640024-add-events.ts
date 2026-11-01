import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEvents1793500640024 implements MigrationInterface {
    name = 'AddEvents1793500640024'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`events\` (\`id\` varchar(36) NOT NULL, \`unit_id\` varchar(36) NOT NULL, \`title\` varchar(200) NOT NULL, \`description\` varchar(2000) NULL, \`location_name\` varchar(200) NULL, \`latitude\` decimal(9,6) NULL, \`longitude\` decimal(9,6) NULL, \`radius_m\` int NULL, \`start_at\` datetime NOT NULL, \`end_at\` datetime NOT NULL, \`checkin_open_at\` datetime NOT NULL, \`checkin_close_at\` datetime NOT NULL, \`grace_minutes\` int NOT NULL DEFAULT '15', \`has_drl\` tinyint NOT NULL DEFAULT 1, \`drl_points\` tinyint NULL, \`control_level\` varchar(10) NOT NULL DEFAULT 'NORMAL', \`require_checkout\` tinyint NOT NULL DEFAULT 0, \`verify_code_hash\` char(64) NULL, \`status\` varchar(20) NOT NULL DEFAULT 'DRAFT', \`cancel_reason\` varchar(500) NULL, \`archived_at\` datetime NULL, \`created_by\` varchar(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_03dcebc1ab44daa177ae9479c4\` (\`status\`), INDEX \`IDX_e8103016aae0d3b04aa7af911a\` (\`unit_id\`, \`start_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`event_qr_tokens\` (\`id\` varchar(36) NOT NULL, \`event_id\` varchar(36) NOT NULL, \`purpose\` varchar(10) NOT NULL, \`token\` varchar(43) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_c87c5df5c1c2073349f032c278\` (\`token\`), INDEX \`IDX_f808d73c44389e7567e5cd6760\` (\`event_id\`, \`purpose\`, \`is_active\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`events\` ADD CONSTRAINT \`FK_83ee01b1737a8c11ad162dc269b\` FOREIGN KEY (\`unit_id\`) REFERENCES \`units\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`event_qr_tokens\` ADD CONSTRAINT \`FK_f428c21e63239282c83759fda21\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);

        // --- rang buoc CHECK (TypeORM khong sinh cho MySQL nen viet tay) ---
        // [BM] MySQL cho qua CHECK khi bieu thuc ra NULL, nen moi nhanh deu IS NOT NULL tuong minh
        // DRL 1-10 hoac khong cong DRL - dac ta 3.1, 8.3
        await queryRunner.query("ALTER TABLE `events` ADD CONSTRAINT `CHK_events_drl` CHECK ((`has_drl` = 1 AND `drl_points` IS NOT NULL AND `drl_points` BETWEEN 1 AND 10) OR (`has_drl` = 0 AND `drl_points` IS NULL))");
        await queryRunner.query("ALTER TABLE `events` ADD CONSTRAINT `CHK_events_time` CHECK (`start_at` < `end_at` AND `checkin_open_at` < `checkin_close_at`)");
        // toa do + ban kinh: du ca ba hoac khong co gi
        await queryRunner.query("ALTER TABLE `events` ADD CONSTRAINT `CHK_events_geo` CHECK ((`latitude` IS NULL AND `longitude` IS NULL AND `radius_m` IS NULL) OR (`latitude` IS NOT NULL AND `longitude` IS NOT NULL AND `radius_m` IS NOT NULL AND `latitude` BETWEEN -90 AND 90 AND `longitude` BETWEEN -180 AND 180 AND `radius_m` BETWEEN 10 AND 5000))");
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`event_qr_tokens\` DROP FOREIGN KEY \`FK_f428c21e63239282c83759fda21\``);
        await queryRunner.query(`ALTER TABLE \`events\` DROP FOREIGN KEY \`FK_83ee01b1737a8c11ad162dc269b\``);
        await queryRunner.query(`DROP INDEX \`IDX_f808d73c44389e7567e5cd6760\` ON \`event_qr_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_c87c5df5c1c2073349f032c278\` ON \`event_qr_tokens\``);
        await queryRunner.query(`DROP TABLE \`event_qr_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_e8103016aae0d3b04aa7af911a\` ON \`events\``);
        await queryRunner.query(`DROP INDEX \`IDX_03dcebc1ab44daa177ae9479c4\` ON \`events\``);
        await queryRunner.query(`DROP TABLE \`events\``);
    }

}
