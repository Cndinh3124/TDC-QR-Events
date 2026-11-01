// Cap MSSV <-> thiet bi: lan dau MSSV diem danh tu thiet bi nao thi ghi nhan - dac ta 4, 6 (student_devices)
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Device } from './device.entity';

@Entity('student_devices')
export class StudentDevice {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  mssv: string;

  @Index()
  @PrimaryColumn({ name: 'device_id', type: 'char', length: 64 })
  deviceId: string;

  @ManyToOne(() => Device, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'device_id' })
  device?: Device;

  @Column({ name: 'first_seen_at', type: 'datetime', precision: 3 })
  firstSeenAt: Date;

  @Column({ name: 'last_seen_at', type: 'datetime', precision: 3 })
  lastSeenAt: Date;
}
