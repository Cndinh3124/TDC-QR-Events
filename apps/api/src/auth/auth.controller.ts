// API xac thuc quan tri - /api/admin/auth
import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';
import { AllowPasswordChange, CurrentUser, Public } from '../common/decorators';
import { CurrentUser as CurrentUserType } from '../common/current-user';
import { Err } from '../common/errors';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { REFRESH_TTL_MS } from './token.service';

const COOKIE = 'tdc_rt';
const COOKIE_PATH = '/api/admin/auth'; // [BM] cookie chi gui toi nhom API nay

@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  // [BM] gioi han 5 lan/phut/IP (doc luc request de test doi duoc) - dac ta 8.4
  @Public()
  @Throttle({ default: { limit: () => Number(process.env.LOGIN_RATE_LIMIT_PER_MIN || 5), ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password, req.ip || '');
    this.setCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertSameOrigin(req);
    const r = await this.auth.refresh(req.cookies?.[COOKIE]);
    this.setCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertSameOrigin(req);
    await this.auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  @AllowPasswordChange()
  @Get('me')
  me(@CurrentUser() user: CurrentUserType) {
    return this.auth.me(user);
  }

  @AllowPasswordChange()
  @Patch('password')
  async changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
    this.setCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user };
  }

  private setCookie(res: Response, token: string) {
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: this.env.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      maxAge: REFRESH_TTL_MS,
    });
  }

  // [BM] chong CSRF cho endpoint dung cookie: SameSite=Strict + Origin phai cung host
  private assertSameOrigin(req: Request) {
    const origin = req.headers.origin;
    if (!origin) return;
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw Err.forbidden();
    }
    if (host !== req.headers.host) throw Err.forbidden();
  }
}
