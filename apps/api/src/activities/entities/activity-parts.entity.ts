// Cac bang phu cua ho so hoat dong: link, don vi phoi hop, buoi diem danh gan kem, phien ban, quy trinh, binh luan, thong bao
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Event } from '../../events/entities/event.entity';
import { AdminUser } from '../../users/entities/admin-user.entity';
import { Unit } from '../../units/entities/unit.entity';
import { Activity } from './activity.entity';

export type LinkGroup = 'MEDIA' | 'PUBLICATION' | 'RESULT';
export type LinkType = 'FACEBOOK' | 'VIDEO' | 'PHOTO' | 'INFOGRAPHIC' | 'NEWS' | 'OTHER';

@Index('UQ_activity_links_url', ['activityId', 'urlHash'], { unique: true })
@Entity('activity_links')
export class ActivityLink {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'activity_id', type: 'char', length: 36 })
  activityId: string;

  @ManyToOne(() => Activity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id' })
  activity?: Activity;

  @Column({ name: 'group', type: 'varchar', length: 12 })
  group: LinkGroup;

  @Column({ type: 'varchar', length: 12, default: 'OTHER' })
  type: LinkType;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  // sha256 cua url de chan trung trong cung hoat dong (cot 2048 ky tu khong lap chi muc duoc)
  @Column({ name: 'url_hash', type: 'char', length: 64 })
  urlHash: string;

  @Column({ name: 'published_on', type: 'date', nullable: true })
  publishedOn: string | null;

  @Column({ type: 'int', default: 1 })
  position: number;

  // ten mien ngoai danh sach quen thuoc: van nhan nhung danh dau cho can bo truong kiem tra (dac ta 3.2)
  @Column({ name: 'needs_review', type: 'boolean', default: false })
  needsReview: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}

@Entity('activity_co_units')
export class ActivityCoUnit {
  @PrimaryColumn({ name: 'activity_id', type: 'char', length: 36 })
  activityId: string;

  @ManyToOne(() => Activity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id' })
  activity?: Activity;

  @PrimaryColumn({ name: 'unit_id', type: 'varchar', length: 36 })
  unitId: string;

  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit?: Unit;
}

@Entity('activity_events')
export class ActivityEvent {
  @PrimaryColumn({ name: 'activity_id', type: 'char', length: 36 })
  activityId: string;

  @ManyToOne(() => Activity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id' })
  activity?: Activity;

  @PrimaryColumn({ name: 'event_id', type: 'char', length: 36 })
  eventId: string;

  @ManyToOne(() => Event, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event?: Event;
}

@Index('UQ_activity_versions', ['activityId', 'version'], { unique: true })
@Entity('activity_versions')
export class ActivityVersion {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'activity_id', type: 'char', length: 36 })
  activityId: string;

  @ManyToOne(() => Activity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id' })
  activity?: Activity;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ name: 'changed_by', type: 'varchar', length: 36 })
  changedBy: string;

  @Column({ name: 'changed_at', type: 'datetime', precision: 3 })
  changedAt: Date;

  // { truong: { from, to } } - chi cac truong da doi
  @Column({ name: 'diff_json', type: 'json', nullable: true })
  diffJson: Record<string, { from: unknown; to: unknown }> | null;

  @Column({ name: 'snapshot_json', type: 'json' })
  snapshotJson: Record<string, unknown>;
}

@Index('IDX_workflow_entity', ['entityType', 'entityId', 'createdAt'])
@Entity('workflow_actions')
export class WorkflowAction {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 20 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'char', length: 36 })
  entityId: string;

  @Column({ type: 'varchar', length: 20 })
  action: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 36 })
  actorId: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}

@Index('IDX_comments_entity', ['entityType', 'entityId', 'createdAt'])
@Entity('comments')
export class Comment {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 20 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'char', length: 36 })
  entityId: string;

  @Column({ name: 'author_id', type: 'varchar', length: 36 })
  authorId: string;

  @Column({ type: 'varchar', length: 2000 })
  content: string;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}

@Index('IDX_notifications_user', ['userId', 'readAt', 'createdAt'])
@Entity('notifications')
export class Notification {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => AdminUser, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: AdminUser;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'varchar', length: 300 })
  message: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 20, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'char', length: 36, nullable: true })
  entityId: string | null;

  @Column({ name: 'read_at', type: 'datetime', precision: 3, nullable: true })
  readAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
