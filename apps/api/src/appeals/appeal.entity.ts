// Khieu nai cua sinh vien - dac ta 3.5, 6 (appeals)
// Han = ket thuc su kien + appeal_days (7 ngay); het han thi API cong khai tu choi.
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Event } from '../events/entities/event.entity';

export type AppealType = 'WRONG_INFO' | 'NO_CHECKIN' | 'PROXY_CHECKIN' | 'DUPLICATE_MSSV';
export type AppealStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

@Index('IDX_appeals_event_status', ['eventId', 'status'])
@Index('IDX_appeals_status_deadline', ['status', 'deadlineAt'])
@Index('IDX_appeals_device', ['deviceId'])
@Index('UQ_appeals_event_idem', ['eventId', 'idempotencyKey'], { unique: true })
@Entity('appeals')
export class Appeal {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'event_id', type: 'varchar', length: 36 })
  eventId: string;

  @ManyToOne(() => Event, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event?: Event;

  // null khi "co tham gia nhung khong diem danh duoc"
  @Column({ name: 'attendance_id', type: 'char', length: 36, nullable: true })
  attendanceId: string | null;

  // thiet bi gui; de sinh vien xem lai khieu nai cua minh (khong co tai khoan)
  @Column({ name: 'device_id', type: 'char', length: 64, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 20 })
  mssv: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100, nullable: true })
  fullName: string | null;

  @Column({ name: 'faculty_unit_id', type: 'varchar', length: 36, nullable: true })
  facultyUnitId: string | null;

  @Column({ type: 'varchar', length: 20 })
  type: AppealType;

  @Column({ type: 'varchar', length: 1000 })
  content: string;

  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: AppealStatus;

  @Column({ name: 'deadline_at', type: 'datetime', precision: 3 })
  deadlineAt: Date;

  @Column({ name: 'handled_by', type: 'varchar', length: 36, nullable: true })
  handledBy: string | null;

  @Column({ name: 'handled_at', type: 'datetime', precision: 3, nullable: true })
  handledAt: Date | null;

  @Column({ name: 'resolution_note', type: 'varchar', length: 500, nullable: true })
  resolutionNote: string | null;

  @Column({ name: 'idempotency_key', type: 'char', length: 36, nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
