// Hang doi viec nen (danh gia luat gan co) - chot-backend-hieu-nang.md muc 1
// Dong viec duoc them cung giao dich voi luot diem danh nen khong the mat viec.
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type JobStatus = 'PENDING' | 'DONE' | 'FAILED';

@Index('IDX_attendance_jobs_status_run', ['status', 'runAt'])
@Entity('attendance_jobs')
export class AttendanceJob {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'attendance_id', type: 'char', length: 36 })
  attendanceId: string;

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: JobStatus;

  // worker "nhan" viec bang cach day run_at ve sau: sap do giua chung thi sau do viec tu hien lai
  @Column({ name: 'run_at', type: 'datetime', precision: 3 })
  runAt: Date;

  @Column({ type: 'tinyint', default: 0 })
  attempts: number;

  // thong tin chi co luc ghi (vi du luot diem danh khong kem cookie hop le)
  @Column({ name: 'payload_json', type: 'json', nullable: true })
  payloadJson: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
