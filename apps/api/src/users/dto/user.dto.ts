// DTO dau ra cho TK quan tri - [BM] whitelist, khong bao gio co password_hash
import { AdminUser, AdminRole } from '../entities/admin-user.entity';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  unitId: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function toUserDto(u: AdminUser): UserDto {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    unitId: u.unitId,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lockedUntil: u.lockedUntil,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

// cac truong an toan de ghi nhat ky
export function userAuditView(u: AdminUser) {
  return { email: u.email, fullName: u.fullName, role: u.role, unitId: u.unitId, isActive: u.isActive };
}
