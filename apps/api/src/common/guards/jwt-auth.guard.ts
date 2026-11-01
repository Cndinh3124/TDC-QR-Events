// Guard xac thuc toan cuc - dac ta 8.2
// [BM] doc lai TK tu DB moi request: khoa/doi quyen co hieu luc ngay, khong cho token cu.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Err } from '../errors';
import { ALLOW_PW_CHANGE_KEY, IS_PUBLIC_KEY } from '../decorators';
import { AdminUser } from '../../users/entities/admin-user.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(AdminUser) private readonly users: Repository<AdminUser>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw Err.unauthorized();

    let payload: { sub: string };
    try {
      // [BM] chi chap nhan HS256 do server ky
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw Err.unauthorized();
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw Err.unauthorized();

    // [NV] 8.1: TK bi buoc doi mat khau chi duoc goi cac API cho phep
    const allowPw = this.reflector.getAllAndOverride<boolean>(ALLOW_PW_CHANGE_KEY, targets);
    if (user.mustChangePassword && !allowPw) throw Err.passwordChangeRequired();

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      unitId: user.unitId,
      mustChangePassword: user.mustChangePassword,
      ip: req.ip || '',
    };
    return true;
  }
}
