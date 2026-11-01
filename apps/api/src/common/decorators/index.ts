// Decorator dung chung: @Public, @Roles, @CurrentUser, @AllowPasswordChange
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AdminRole } from '../../users/entities/admin-user.entity';
import { CurrentUser as CurrentUserType } from '../current-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const ALLOW_PW_CHANGE_KEY = 'allowPasswordChange';

// [BM] API mac dinh phai dang nhap; endpoint cong khai danh dau tuong minh
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
// cho phep goi khi TK dang bi buoc doi mat khau (me, doi mat khau, dang xuat)
export const AllowPasswordChange = () => SetMetadata(ALLOW_PW_CHANGE_KEY, true);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): CurrentUserType => {
  return ctx.switchToHttp().getRequest().user;
});
