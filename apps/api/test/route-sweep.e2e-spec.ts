// Quet MOI route da dang ky: khong dang nhap -> 401; route chi-Doan-truong -> quan ly khoa bi 403 - dac ta 8.2
// Muc dich: giai doan sau them endpoint ma quen guard / @Roles thi test nay do ngay.
import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import request from 'supertest';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../src/common/decorators';
import { createTestApp, login, makeUser, resetDb, Session } from './helpers';

const UUID = '3f0c1b6e-8a4d-4c9e-9b1a-2d7e5f6a7b8c';
const VERBS: Record<number, 'get' | 'post' | 'put' | 'delete' | 'patch'> = {
  [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete', [RequestMethod.PATCH]: 'patch',
};

interface Route { verb: (typeof VERBS)[number]; url: string; isPublic: boolean; roles: string[] | undefined; label: string }

function listRoutes(app: INestApplication): Route[] {
  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  const routes: Route[] = [];
  const wrappers = [...app.get(ModulesContainer).values()].flatMap((m) => [...m.controllers.values()]);
  for (const wrapper of wrappers) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
      const handler = instance[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined || !(method in VERBS)) continue;
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
      const url = `/api/${base}/${sub}`.replace(/\/+/g, '/').replace(/\/$/, '').replace(/:[A-Za-z]+/g, UUID);
      routes.push({
        verb: VERBS[method], url,
        isPublic: !!reflector.getAllAndOverride(IS_PUBLIC_KEY, [handler, metatype]),
        roles: reflector.getAllAndOverride(ROLES_KEY, [handler, metatype]),
        label: `${metatype.name}.${name}`,
      });
    }
  }
  return routes;
}

describe('Quet toan bo route', () => {
  let app: INestApplication;
  let routes: Route[];
  let mgr: Session;

  beforeAll(async () => {
    app = await createTestApp();
    const ds = await resetDb(app);
    await makeUser(ds, { email: 'cntt@tdc.edu.vn', unit: 'CNTT' });
    mgr = await login(app, 'cntt@tdc.edu.vn');
    routes = listRoutes(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it('tim thay du route (khop so decorator @Get/@Post/... trong src (73 luc viet))', () => {
    expect(routes.length).toBeGreaterThanOrEqual(73);
    expect(routes.some((r) => r.url.startsWith('/api/admin/dashboard'))).toBe(true);
  });

  it('chi nhung route sau duoc cong khai: healthz, dang nhap / refresh / dang xuat, /api/public/*', () => {
    const pub = routes.filter((r) => r.isPublic).map((r) => r.url);
    const outside = pub.filter((u) => !u.startsWith('/api/public') && !/^\/api\/(healthz|admin\/auth\/(login|refresh|logout))$/.test(u));
    expect(outside).toEqual([]);
  });

  it('cac nhom nay BAT BUOC khai bao chi-Doan-truong (neu quen @Roles thi test o duoi khong tu phat hien)', () => {
    const must = ['/api/admin/users', '/api/admin/settings', '/api/admin/audit-logs'];
    const missing = routes
      .filter((r) => must.some((p) => r.url.startsWith(p)) && !(r.roles?.length === 1 && r.roles[0] === 'SCHOOL_ADMIN'))
      .map((r) => `${r.verb.toUpperCase()} ${r.url} (${r.label})`);
    expect(missing).toEqual([]);
    // don vi: xem theo pham vi (moi vai tro), nhung them / sua / khoa / xoa chi Doan truong
    const unitWrites = routes.filter((r) => r.url.startsWith('/api/admin/units') && r.verb !== 'get');
    expect(unitWrites.length).toBeGreaterThan(0);
    expect(unitWrites.filter((r) => !r.roles?.includes('SCHOOL_ADMIN')).map((r) => r.label)).toEqual([]);
  });

  it('TU CHOI: moi route khong cong khai deu tra 401 khi chua dang nhap', async () => {
    const bad: string[] = [];
    for (const r of routes.filter((x) => !x.isPublic)) {
      const res = await request(app.getHttpServer())[r.verb](r.url).send({});
      if (res.status !== 401) bad.push(`${r.verb.toUpperCase()} ${r.url} (${r.label}) -> ${res.status}`);
    }
    expect(bad).toEqual([]);
  });

  it('TU CHOI: moi route chi-Doan-truong tra 403 cho quan ly khoa', async () => {
    const adminOnly = routes.filter((r) => !r.isPublic && r.roles?.includes('SCHOOL_ADMIN') && !r.roles.includes('FACULTY_MANAGER'));
    expect(adminOnly.length).toBeGreaterThan(15);
    const bad: string[] = [];
    for (const r of adminOnly) {
      const res = await request(app.getHttpServer())[r.verb](r.url).set('Authorization', `Bearer ${mgr.token}`).send({});
      if (res.status !== 403) bad.push(`${r.verb.toUpperCase()} ${r.url} (${r.label}) -> ${res.status}`);
    }
    expect(bad).toEqual([]);
  });
});
