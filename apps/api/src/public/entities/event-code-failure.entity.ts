// So lan nhap sai ma 4 so cua ca su kien trong mot cua so thoi gian - dac ta 5.2, 8.4
// [BM] cookie thiet bi tao mien phi nen gioi han theo thiet bi / luot chua du chan do ma; day la tran chung cua su kien.
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Event } from '../../events/entities/event.entity';

@Entity('event_code_failures')
export class EventCodeFailure {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 36 })
  eventId: string;

  @ManyToOne(() => Event, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: Event;

  @Column({ name: 'window_started_at', type: 'datetime', precision: 3 })
  windowStartedAt: Date;

  @Column({ name: 'fail_count', type: 'int', default: 0 })
  failCount: number;
}
