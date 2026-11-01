import { MigrationInterface, QueryRunner } from "typeorm";

// Doi co bool faculty_view_enabled thanh che do NONE / ALL / SELECTED + bang event_faculty_views (dac ta 2.2).
// Viet tay (khong dung ban TypeORM sinh): ban sinh tu dong xoa roi them lai cot nen mat du lieu co cu.
export class EventFacultyViewMode1793502499621 implements MigrationInterface {
    name = 'EventFacultyViewMode1793502499621'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`events\` ADD \`faculty_view_mode\` varchar(10) NOT NULL DEFAULT 'NONE'`);
        // co cu "cho phep" = moi khoa duoc xem
        await queryRunner.query(`UPDATE \`events\` SET \`faculty_view_mode\` = 'ALL' WHERE \`faculty_view_enabled\` = 1`);
        await queryRunner.query(`ALTER TABLE \`events\` DROP COLUMN \`faculty_view_enabled\``);
        await queryRunner.query(`CREATE TABLE \`event_faculty_views\` (\`event_id\` varchar(36) NOT NULL, \`unit_id\` varchar(36) NOT NULL, \`created_by\` varchar(36) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_c082391a2315eb7497063ebeee\` (\`unit_id\`), PRIMARY KEY (\`event_id\`, \`unit_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`event_faculty_views\` ADD CONSTRAINT \`FK_8fcd8100a67233c88174247ec17\` FOREIGN KEY (\`event_id\`) REFERENCES \`events\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`event_faculty_views\` ADD CONSTRAINT \`FK_c082391a2315eb7497063ebeee2\` FOREIGN KEY (\`unit_id\`) REFERENCES \`units\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`events\` ADD \`faculty_view_enabled\` tinyint NOT NULL DEFAULT 0`);
        // [BM] chi ALL tro lai thanh "cho phep"; SELECTED mat thong tin chon khoa nen ha ve "khong cho" (an toan hon la mo rong quyen xem)
        await queryRunner.query(`UPDATE \`events\` SET \`faculty_view_enabled\` = 1 WHERE \`faculty_view_mode\` = 'ALL'`);
        await queryRunner.query(`ALTER TABLE \`event_faculty_views\` DROP FOREIGN KEY \`FK_c082391a2315eb7497063ebeee2\``);
        await queryRunner.query(`ALTER TABLE \`event_faculty_views\` DROP FOREIGN KEY \`FK_8fcd8100a67233c88174247ec17\``);
        await queryRunner.query(`DROP INDEX \`IDX_c082391a2315eb7497063ebeee\` ON \`event_faculty_views\``);
        await queryRunner.query(`DROP TABLE \`event_faculty_views\``);
        await queryRunner.query(`ALTER TABLE \`events\` DROP COLUMN \`faculty_view_mode\``);
    }

}
