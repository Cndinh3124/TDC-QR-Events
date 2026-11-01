// Ho so hoat dong - dac ta quan-ly-hoat-dong 3, 4. Quy trinh: DRAFT -> PENDING_PLAN -> IN_PROGRESS -> PENDING_EVAL -> EVALUATED -> LOCKED
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Unit } from '../../units/entities/unit.entity';
import { AcademicYear } from './academic-year.entity';
import { ActivityCategory } from './activity-category.entity';

export type ActivityStatus = 'DRAFT' | 'PENDING_PLAN' | 'IN_PROGRESS' | 'PENDING_EVAL' | 'EVALUATED' | 'LOCKED';
export type ActivityLevel = 'SCHOOL' | 'FACULTY' | 'CLASS';
export type ActivityMode = 'ONSITE' | 'ONLINE' | 'HYBRID';
export type Evaluation = 'COMPLETED' | 'NOT_COMPLETED';
export type Reward = 'APPROVED' | 'REJECTED';

@Index('IDX_activities_year_unit', ['academicYearId', 'unitId'])
@Entity('activities')
export class Activity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  // [NV] 3.1: [nam]-[STT 3 chu so], cap tu dong, khong sua duoc
  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ name: 'academic_year_id', type: 'char', length: 36 })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear?: AcademicYear;

  @Column({ name: 'unit_id', type: 'varchar', length: 36 })
  unitId: string;

  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit?: Unit;

  @Column({ name: 'category_id', type: 'char', length: 36, nullable: true })
  categoryId: string | null;

  @ManyToOne(() => ActivityCategory, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category?: ActivityCategory | null;

  @Column({ type: 'varchar', length: 10, default: 'FACULTY' })
  level: ActivityLevel;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'start_at', type: 'datetime', precision: 3 })
  startAt: Date;

  @Column({ name: 'end_at', type: 'datetime', precision: 3 })
  endAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 10, default: 'ONSITE' })
  mode: ActivityMode;

  @Column({ name: 'target_audience', type: 'varchar', length: 255, nullable: true })
  targetAudience: string | null;

  @Column({ name: 'expected_count', type: 'int', nullable: true })
  expectedCount: number | null;

  // nhap tay khi hoat dong khong gan buoi diem danh; co buoi diem danh thi lay tu dong
  @Column({ name: 'manual_count', type: 'int', nullable: true })
  manualCount: number | null;

  // bigint tra ve chuoi: chuyen sang so o DTO (VND, nho hon 2^53)
  @Column({ name: 'budget_planned', type: 'bigint', nullable: true })
  budgetPlanned: string | null;

  @Column({ name: 'budget_actual', type: 'bigint', nullable: true })
  budgetActual: string | null;

  @Column({ name: 'owner_name', type: 'varchar', length: 120, nullable: true })
  ownerName: string | null;

  @Column({ name: 'owner_phone', type: 'varchar', length: 20, nullable: true })
  ownerPhone: string | null;

  @Column({ name: 'plan_url', type: 'varchar', length: 2048, nullable: true })
  planUrl: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: ActivityStatus;

  // co gia tri = dang o trang thai "Tra lai bo sung" (hien thi); xoa khi nop lai
  @Column({ name: 'return_note', type: 'varchar', length: 1000, nullable: true })
  returnNote: string | null;

  @Column({ name: 'returned_at', type: 'datetime', precision: 3, nullable: true })
  returnedAt: Date | null;

  @Column({ name: 'submitted_at', type: 'datetime', precision: 3, nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  evaluation: Evaluation | null;

  @Column({ name: 'evaluation_note', type: 'varchar', length: 1000, nullable: true })
  evaluationNote: string | null;

  @Column({ name: 'evaluated_by', type: 'varchar', length: 36, nullable: true })
  evaluatedBy: string | null;

  @Column({ name: 'evaluated_at', type: 'datetime', precision: 3, nullable: true })
  evaluatedAt: Date | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  reward: Reward | null;

  @Column({ name: 'reward_note', type: 'varchar', length: 1000, nullable: true })
  rewardNote: string | null;

  @Column({ name: 'locked_at', type: 'datetime', precision: 3, nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36 })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 })
  updatedAt: Date;
}
