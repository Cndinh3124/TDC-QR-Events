// Luot diem danh - dac ta 3.3, 3.4, 5, 6 (attendances)
// [NV] 6: UNIQUE (event_id, device_id) la chot cuoi chong ghi trung khi hai request den cung luc.
// Cac cot duyet / huy (review_*, voided_*) co san cho giai doan 4.
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { Unit } from '../../units/entities/unit.entity';
import { Device } from './device.entity';

export type Timeliness = 'ON_TIME' | 'LATE';
export type AttendanceSource = 'SELF' | 'MANUAL';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const decimal = { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) };

@Index('UQ_attendances_event_device', ['eventId', 'deviceId'], { unique: true })
@Index('UQ_attendances_event_idem', ['eventId', 'idempotencyKey'], { unique: true })
@Index('IDX_attendances_event_mssv', ['eventId', 'mssv'])
@Index('IDX_attendances_mssv_checkin', ['mssv', 'checkinAt'])
@Index('IDX_attendances_event_review', ['eventId', 'reviewStatus'])
@Index('IDX_attendances_device', ['deviceId'])
@Entity('attendances')
export class Attendance {
  // UUID sinh o ung dung de tra ve ngay, khong phai doc lai sau khi ghi
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  // FK RESTRICT: su kien da co luot diem danh thi khong xoa cung duoc (EVENT_IN_USE)
  @Column({ name: 'event_id', type: 'varchar', length: 36 })
  eventId: string;

  @ManyToOne(() => Event, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event?: Event;

  // null voi luot them thu cong (giai doan 4)
  @Column({ name: 'device_id', type: 'char', length: 64, nullable: true })
  deviceId: string | null;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'device_id' })
  device?: Device | null;

  @Column({ type: 'varchar', length: 20 })
  mssv: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'faculty_unit_id', type: 'varchar', length: 36 })
  facultyUnitId: string;

  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'faculty_unit_id' })
  faculty?: Unit;

  @Column({ name: 'checkin_at', type: 'datetime', precision: 3 })
  checkinAt: Date;

  @Column({ name: 'checkout_at', type: 'datetime', precision: 3, nullable: true })
  checkoutAt: Date | null;

  @Column({ type: 'varchar', length: 10 })
  timeliness: Timeliness;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  lat: number | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  lng: number | null;

  @Column({ name: 'gps_accuracy_m', type: 'int', nullable: true })
  gpsAccuracyM: number | null;

  // worker tinh sau khi ghi, khong tinh tren duong diem danh
  @Column({ name: 'distance_m', type: 'int', nullable: true })
  distanceM: number | null;

  // chi de tham khao, khong dung phan biet thiet bi - dac ta 4
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ name: 'edit_count', type: 'tinyint', default: 0 })
  editCount: number;

  @Column({ type: 'varchar', length: 10, default: 'SELF' })
  source: AttendanceSource;

  @Column({ name: 'review_status', type: 'varchar', length: 10, default: 'PENDING' })
  reviewStatus: ReviewStatus;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 36, nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'datetime', precision: 3, nullable: true })
  reviewedAt: Date | null;

  // ly do tu choi / ghi chu cua nguoi duyet (giai doan 4)
  @Column({ name: 'review_note', type: 'varchar', length: 500, nullable: true })
  reviewNote: string | null;

  @Column({ name: 'drl_awarded', type: 'tinyint', nullable: true })
  drlAwarded: number | null;

  // ma ngan tren "ve" diem danh; dung khi khieu nai (giai doan 4) nen khong lo cho nguoi khac
  @Column({ name: 'confirm_code', type: 'varchar', length: 8 })
  confirmCode: string;

  @Column({ name: 'idempotency_key', type: 'char', length: 36, nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'checkout_idempotency_key', type: 'char', length: 36, nullable: true })
  checkoutIdempotencyKey: string | null;

  // [BM] gioi han nhap sai ma 4 so cho tung luot: toi da 5 lan roi khoa tam
  @Column({ name: 'code_fail_count', type: 'tinyint', default: 0 })
  codeFailCount: number;

  @Column({ name: 'code_locked_until', type: 'datetime', precision: 3, nullable: true })
  codeLockedUntil: Date | null;

  @Column({ name: 'voided_at', type: 'datetime', precision: 3, nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'void_reason', type: 'varchar', length: 500, nullable: true })
  voidReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
