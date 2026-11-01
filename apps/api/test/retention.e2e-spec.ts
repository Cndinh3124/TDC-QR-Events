// Luu tru du lieu vi tri: sau data_retention_months thang xoa lat/lng/IP/trinh duyet cua luot diem danh, giu phan con lai.
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { as, createTestApp } from './helpers';
import { checkinAs, openEvent, setupWorld, World } from './public-helpers';
import { monthsAgo, RetentionService } from '../src/retention/retention.service';

describe('Luu tru du lieu vi tri', () => {
  let app: INestApplication;
  let w: World;
  let ds: DataSource;
  let svc: RetentionService;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    w = await setupWorld(app);
    ds = w.ds;
    svc = app.get(RetentionService);
  });

  const setRetention = (n: unknown) => as(app, w.admin).patch('/api/admin/settings').send({ data_retention_months: n });
  const location = async (id: string) =>
    (await ds.query('SELECT lat, lng, distance_m, ip, user_agent, mssv, full_name, checkin_at FROM attendances WHERE id = ?', [id]))[0];
  const fill = (id: string, whenSql: string) =>
    ds.query(`UPDATE attendances SET lat = 10.850000, lng = 106.770000, distance_m = 12, ip = '203.0.113.7', user_agent = 'UA-test', checkin_at = ${whenSql} WHERE id = ?`, [id]);

  it('monthsAgo: lui dung thang, kep cuoi thang (31/8 lui 6 thang -> 28/2)', () => {
    expect(monthsAgo(new Date('2026-11-01T00:00:00Z'), 6).toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(monthsAgo(new Date('2026-08-31T00:00:00Z'), 6).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(monthsAgo(new Date('2026-01-15T00:00:00Z'), 13).toISOString()).toBe('2024-12-15T00:00:00.000Z');
  });

  it('chi xoa du lieu vi tri / mang cua luot qua han; giu MSSV, ten, thoi gian va luot moi', async () => {
    const ev = await openEvent(w);
    const old = (await checkinAs(w, ev.token)).attendance;
    const fresh = (await checkinAs(w, ev.token)).attendance;
    await fill(old.id, 'DATE_SUB(NOW(3), INTERVAL 7 MONTH)');
    await fill(fresh.id, 'DATE_SUB(NOW(3), INTERVAL 5 MONTH)');
    const before = await location(old.id);

    expect(await svc.run()).toBe(1); // mac dinh 6 thang
    const after = await location(old.id);
    expect(after).toMatchObject({ lat: null, lng: null, distance_m: null, ip: null, user_agent: null });
    expect({ mssv: after.mssv, name: after.full_name, at: after.checkin_at }).toEqual({ mssv: before.mssv, name: before.full_name, at: before.checkin_at });
    expect(await location(fresh.id)).toMatchObject({ distance_m: 12, ip: '203.0.113.7', user_agent: 'UA-test' });
    expect(Number((await location(fresh.id)).lat)).toBeCloseTo(10.85, 5);
    expect(await svc.run()).toBe(0); // chay lai khong con gi de xoa
  });

  it('theo cau hinh: 12 thang thi luot 7 thang tuoi con nguyen; ha xuong 1 thang thi ca luot 7 va 5 thang bi xoa', async () => {
    const ev = await openEvent(w);
    const seven = (await checkinAs(w, ev.token)).attendance;
    const five = (await checkinAs(w, ev.token)).attendance;
    await fill(seven.id, 'DATE_SUB(NOW(3), INTERVAL 7 MONTH)');
    await fill(five.id, 'DATE_SUB(NOW(3), INTERVAL 5 MONTH)');
    await setRetention(12).expect(200);
    expect(await svc.run()).toBe(0);
    expect((await location(seven.id)).ip).toBe('203.0.113.7');
    await setRetention(1).expect(200);
    expect(await svc.run()).toBe(2);
    expect((await location(five.id)).ip).toBeNull();
    expect((await location(seven.id)).ip).toBeNull();
  });

  it('cau hinh hong (0) thi khong xoa gi', async () => {
    const ev = await openEvent(w);
    const a = (await checkinAs(w, ev.token)).attendance;
    await fill(a.id, 'DATE_SUB(NOW(3), INTERVAL 30 MONTH)');
    // API chan gia tri 0 (toi thieu 1), nen ghi thang vao DB va xoa cache cau hinh de mo phong du lieu hong
    await ds.query("UPDATE system_settings SET value_json = '0' WHERE `key` = 'data_retention_months'");
    (svc as unknown as { settings: { cache: Map<string, unknown> } }).settings.cache.clear();
    expect(await svc.run()).toBe(0);
    expect((await location(a.id)).ip).toBe('203.0.113.7');
  });

  it('cau hinh data_retention_months: API tu choi 0, so am, chu', async () => {
    for (const bad of [0, -3, 'sau', 61, 2.5]) await setRetention(bad).expect(400);
    await as(app, w.cntt).patch('/api/admin/settings').send({ data_retention_months: 3 }).expect(403);
  });
});
