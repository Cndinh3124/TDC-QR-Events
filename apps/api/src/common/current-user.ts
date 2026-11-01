// Thong tin nguoi dung dang dang nhap, guard gan vao request
import { AdminRole } from '../users/entities/admin-user.entity';

export interface CurrentUser {
  id: string;
  email: string;
  role: AdminRole;
  unitId: string;
  mustChangePassword: boolean;
  ip: string;
}
