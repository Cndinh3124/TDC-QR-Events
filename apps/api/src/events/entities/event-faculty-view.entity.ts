// Khoa duoc Doan truong cho xem (chi doc) mot su kien cap truong khi che do la SELECTED - dac ta 2.2
// Moi dong = mot khoa. Doi che do sang NONE / ALL thi xoa het dong cua su kien.
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Unit } from '../../units/entities/unit.entity';
import { Event } from './event.entity';

@Entity('event_faculty_views')
export class EventFacultyView {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 36 })
  eventId: string;

  // xoa su kien thi xoa luon cac dong chia se
  @ManyToOne(() => Event, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: Event;

  @Index()
  @PrimaryColumn({ name: 'unit_id', type: 'varchar', length: 36 })
  unitId: string;

  // FK RESTRICT: khoa dang duoc chon xem thi khong xoa cung duoc, chi "ngung hoat dong"
  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit?: Unit;

  @Column({ name: 'created_by', type: 'varchar', length: 36 })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
