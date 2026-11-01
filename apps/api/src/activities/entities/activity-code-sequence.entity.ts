// So thu tu ma hoat dong theo nam; dong bi khoa khi cap ma (khong trung, khong nhay so)
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('activity_code_sequences')
export class ActivityCodeSequence {
  @PrimaryColumn({ type: 'int' })
  year: number;

  @Column({ name: 'last_value', type: 'int', default: 0 })
  lastValue: number;
}
