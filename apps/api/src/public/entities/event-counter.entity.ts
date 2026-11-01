// Bang dem truc tiep cho man theo doi - chot-backend-hieu-nang.md muc 5
// Chia 8 dong con (slot) moi su kien de nhieu luot cung ghi khong tranh nhau mot khoa dong; doc thi SUM.
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Event } from '../../events/entities/event.entity';

export const COUNTER_SLOTS = 8;

@Entity('event_counters')
export class EventCounter {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 36 })
  eventId: string;

  @ManyToOne(() => Event, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: Event;

  @PrimaryColumn({ type: 'tinyint' })
  slot: number;

  @Column({ name: 'checkin_count', type: 'int', default: 0 })
  checkinCount: number;

  @Column({ name: 'checkout_count', type: 'int', default: 0 })
  checkoutCount: number;

  @Column({ name: 'on_time_count', type: 'int', default: 0 })
  onTimeCount: number;

  @Column({ name: 'late_count', type: 'int', default: 0 })
  lateCount: number;
}
