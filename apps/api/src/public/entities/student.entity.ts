// Ho so sinh vien tu hinh thanh khi diem danh - dac ta 3.7, 6 (students)
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Unit } from '../../units/entities/unit.entity';

@Entity('students')
export class Student {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  mssv: string;

  @Column({ name: 'full_name_latest', type: 'varchar', length: 100 })
  fullNameLatest: string;

  // FK RESTRICT: khoa da co sinh vien thi chi duoc "ngung hoat dong"
  @Column({ name: 'faculty_unit_id', type: 'varchar', length: 36 })
  facultyUnitId: string;

  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'faculty_unit_id' })
  faculty?: Unit;

  @Column({ name: 'first_seen_at', type: 'datetime', precision: 3 })
  firstSeenAt: Date;

  // gop hai MSSV (giai doan 4)
  @Column({ name: 'merged_into', type: 'varchar', length: 20, nullable: true })
  mergedInto: string | null;

  // quan tri da sua ten / khoa: diem danh sau khong ghi de thong tin sinh vien tu nhap
  @Column({ name: 'profile_locked', type: 'boolean', default: false })
  profileLocked: boolean;
}
