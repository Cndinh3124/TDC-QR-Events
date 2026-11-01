import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEventFacultyView1793501916085 implements MigrationInterface {
    name = 'AddEventFacultyView1793501916085'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`events\` ADD \`faculty_view_enabled\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`events\` DROP COLUMN \`faculty_view_enabled\``);
    }

}
