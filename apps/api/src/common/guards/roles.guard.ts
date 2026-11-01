// Guard vai tro toan cuc: endpoint co @Roles thi chi vai tro do moi vao duoc
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Err } from '../errors';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { AdminRole } from '../../users/entities/admin-user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const roles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw Err.forbidden();
    return true;
  }
}
