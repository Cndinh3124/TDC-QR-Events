// Thiet bi sinh vien (id = hash cua ma thiet bi trong cookie) - dac ta 4, 6 (devices)
// [BM] khong luu ma thiet bi goc: lo DB khong du de gia cookie.
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryColumn({ type: 'char', length: 64 })
  id: string;

  @Column({ name: 'first_seen_at', type: 'datetime', precision: 3 })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'datetime', precision: 3 })
  lastSeenAt: Date;

  // chi la tin hieu gan co, khong bao gio dung de tu choi - dac ta 4
  @Column({ name: 'fingerprint_hash', type: 'char', length: 64, nullable: true })
  fingerprintHash: string | null;
}
