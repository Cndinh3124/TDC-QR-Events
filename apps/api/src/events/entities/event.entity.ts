// Bang su kien - dac ta 3.1, 6 (events)
// Khac dac ta: khong co deleted_at / manual_override. An = archived_at; bam tay mo/dong = trang thai CHECKIN_OPEN/CHECKIN_CLOSED.
import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Unit } from '../../units/entities/unit.entity';

export type EventStatus =
  | 'DRAFT' | 'PUBLISHED' | 'CHECKIN_OPEN' | 'CHECKIN_CLOSED' | 'REVIEWING' | 'FINALIZED' | 'CANCELLED';
// NORMAL = Thuong, TIGHT = Chat; Nghiem ngat de phien ban sau - dac ta 5.2
export type FacultyViewMode = 'NONE' | 'ALL' | 'SELECTED';
export type ControlLevel = 'NORMAL' | 'TIGHT';

const decimal = { to: (v: number | null) => v, from: (v: string | null) => (v === null ? null : Number(v)) };

@Index(['unitId', 'startAt'])
@Index(['status'])
// Rang buoc CHECK (DRL 1-10, thu tu gio, toa do + ban kinh) nam trong migration AddEvents,
// vi TypeORM khong sinh CHECK cho MySQL. Cung duoc kiem tra o DTO va event-rules.ts.
@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'unit_id', type: 'varchar', length: 36 })
  unitId: string;

  // FK RESTRICT: don vi da co su kien thi chi duoc "ngung hoat dong", khong xoa cung
  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit?: Unit;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  description: string | null;

  @Column({ name: 'location_name', type: 'varchar', length: 200, nullable: true })
  locationName: string | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  longitude: number | null;

  @Column({ name: 'radius_m', type: 'int', nullable: true })
  radiusM: number | null;

  @Column({ name: 'start_at', type: 'datetime' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'datetime' })
  endAt: Date;

  @Column({ name: 'checkin_open_at', type: 'datetime' })
  checkinOpenAt: Date;

  @Column({ name: 'checkin_close_at', type: 'datetime' })
  checkinCloseAt: Date;

  @Column({ name: 'grace_minutes', type: 'int', default: 15 })
  graceMinutes: number;

  @Column({ name: 'has_drl', type: 'boolean', default: true })
  hasDrl: boolean;

  @Column({ name: 'drl_points', type: 'tinyint', nullable: true })
  drlPoints: number | null;

  @Column({ name: 'control_level', type: 'varchar', length: 10, default: 'NORMAL' })
  controlLevel: ControlLevel;

  @Column({ name: 'require_checkout', type: 'boolean', default: false })
  requireCheckout: boolean;

  // [BM] chi luu hash cua ma 4 so (muc Chat), khong tra ra ngoai
  @Column({ name: 'verify_code_hash', type: 'char', length: 64, nullable: true })
  verifyCodeHash: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: EventStatus;

  // [NV] 2.2: Doan truong cho cac khoa xem (chi doc) su kien cap truong: NONE = khong, ALL = moi khoa,
  // SELECTED = chi cac khoa trong bang event_faculty_views. Chi dat duoc khi don vi to chuc la Doan truong.
  @Column({ name: 'faculty_view_mode', type: 'varchar', length: 10, default: 'NONE' })
  facultyViewMode: FacultyViewMode;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 500, nullable: true })
  cancelReason: string | null;

  @Column({ name: 'archived_at', type: 'datetime', nullable: true })
  archivedAt: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36 })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
