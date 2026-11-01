// Ham tro giup cho test e2e
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { loadEnv } from '../src/config/env';
import { Unit } from '../src/units/entities/unit.entity';
import { AdminRole, AdminUser } from '../src/users/entities/admin-user.entity';

export const PW = 'Mat-khau-manh-2026!';

export async function createTestApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

// dua DB ve trang thai ngay sau migration (don vi + cau hinh goc)
export async function resetDb(app: INestApplication): Promise<DataSource> {
  const ds = app.get(DataSource);
  await ds.dropDatabase();
  await ds.runMigrations();
  return ds;
}

export async function unitId(ds: DataSource, code: string): Promise<string> {
  return (await ds.getRepository(Unit).findOneByOrFail({ code })).id;
}

export async function makeUser(
  ds: DataSource,
  o: { email: string; role?: AdminRole; unit?: string; password?: string; mustChange?: boolean; active?: boolean },
): Promise<AdminUser> {
  const role = o.role ?? 'FACULTY_MANAGER';
  const unit = o.unit ?? (role === 'SCHOOL_ADMIN' ? 'DTN' : 'CNTT');
  return ds.getRepository(AdminUser).save({
    email: o.email,
    fullName: 'Nguoi dung ' + o.email.split('@')[0],
    role,
    unitId: await unitId(ds, unit),
    // chi phi thap cho test chay nhanh; verify doc tham so tu chinh hash
    passwordHash: await argon2.hash(o.password ?? PW, { type: argon2.argon2id, memoryCost: 1024, timeCost: 2 }),
    isActive: o.active ?? true,
    mustChangePassword: o.mustChange ?? false,
  });
}

export interface Session {
  token: string;
  cookie: string; // gia tri cookie refresh (name=value)
  id: string;
}

export async function login(app: INestApplication, email: string, password = PW): Promise<Session> {
  const res = await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email, password }).expect(200);
  const raw = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]);
  return { token: res.body.accessToken, cookie: raw[0].split(';')[0], id: res.body.user.id };
}

// request co gan token
export const as = (app: INestApplication, s: Session) => ({
  get: (u: string) => request(app.getHttpServer()).get(u).set('Authorization', `Bearer ${s.token}`),
  post: (u: string) => request(app.getHttpServer()).post(u).set('Authorization', `Bearer ${s.token}`),
  patch: (u: string) => request(app.getHttpServer()).patch(u).set('Authorization', `Bearer ${s.token}`),
  del: (u: string) => request(app.getHttpServer()).delete(u).set('Authorization', `Bearer ${s.token}`),
});
