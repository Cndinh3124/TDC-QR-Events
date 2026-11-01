// Token QR cua su kien (vao / ra) - dac ta 3.2, 6 (event_qr_tokens)
// Tao ma moi = tat dong cu (is_active = false) + them dong moi; giu lai de truy vet.
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Event } from './event.entity';

export type QrPurpose = 'CHECKIN' | 'CHECKOUT';

@Index(['eventId', 'purpose', 'isActive'])
@Entity('event_qr_tokens')
export class EventQrToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'varchar', length: 36 })
  eventId: string;

  // xoa su kien thi xoa luon token (chi xoa duoc khi chua co luot diem danh)
  @ManyToOne(() => Event, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: Event;

  @Column({ type: 'varchar', length: 10 })
  purpose: QrPurpose;

  // [BM] 128-bit ngau nhien, khong chua thong tin su kien. Phai luu ro de ve lai QR; khong ghi vao log / nhat ky.
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 43 })
  token: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
