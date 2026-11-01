// Lich su sua thong tin luot diem danh - dac ta 3.4, 6 (attendance_edits)
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Attendance } from './attendance.entity';

@Index('UQ_attendance_edits_idem', ['attendanceId', 'idempotencyKey'], { unique: true })
@Entity('attendance_edits')
export class AttendanceEdit {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'attendance_id', type: 'char', length: 36 })
  attendanceId: string;

  @ManyToOne(() => Attendance, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'attendance_id' })
  attendance?: Attendance;

  @Column({ name: 'old_json', type: 'json' })
  oldJson: Record<string, unknown>;

  @Column({ name: 'new_json', type: 'json' })
  newJson: Record<string, unknown>;

  @Column({ name: 'actor_type', type: 'varchar', length: 10 })
  actorType: 'STUDENT' | 'ADMIN';

  // STUDENT: id thiet bi; ADMIN: id tai khoan
  @Column({ name: 'actor_id', type: 'varchar', length: 64 })
  actorId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  // gui lai cung khoa thi khong tinh them mot lan sua
  @Column({ name: 'idempotency_key', type: 'char', length: 36, nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
