// Nam hoc - dac ta quan-ly-hoat-dong 2. Khoa so thi du lieu cua nam hoc chi doc.
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('academic_years')
export class AcademicYear {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  name: string;

  // kieu date tra ve chuoi YYYY-MM-DD (khong lech mui gio)
  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'plan_deadline', type: 'date', nullable: true })
  planDeadline: string | null;

  @Column({ name: 'report_deadline', type: 'date', nullable: true })
  reportDeadline: string | null;

  @Column({ name: 'locked_at', type: 'datetime', precision: 3, nullable: true })
  lockedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
