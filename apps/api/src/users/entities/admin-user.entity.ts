// Bang tai khoan quan tri - dac ta 6
import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Unit } from '../../units/entities/unit.entity';

export type AdminRole = 'SCHOOL_ADMIN' | 'FACULTY_MANAGER';

@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 190 })
  email: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName: string;

  // [BM] chi luu hash argon2id, khong bao gio tra ra ngoai
  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20 })
  role: AdminRole;

  @Index()
  @Column({ name: 'unit_id', type: 'varchar', length: 36 })
  unitId: string;

  @ManyToOne(() => Unit, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unit_id' })
  unit?: Unit;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'must_change_password', type: 'boolean', default: true })
  mustChangePassword: boolean;

  @Column({ name: 'failed_login_count', type: 'int', default: 0 })
  failedLoginCount: number;

  @Column({ name: 'locked_until', type: 'datetime', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
