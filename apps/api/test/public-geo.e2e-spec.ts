// Test chan cung theo vi tri khi diem danh vao / ra - dac ta 5.3 (geo-rule.ts)
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { Attendance } from '../src/public/entities/attendance.entity';
import {
  as, checkinBody, createTestApp, deviceCookie, openEvent, postCheckin, setupWorld, World,
} from './public-helpers';

describe('Diem danh cong khai - chan theo vi tri', () => {
  let app: INestApplication;
  let w: World;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    w = await setupWorld(app);
  });

  const GEO = { latitude: 10.85, longitude: 106.77, radiusM: 100 };
  const HERE = { lat: 10.85, lng: 106.77, accuracyM: 20 };
  // ~ 5,5 km ve phia bac
  const FAR = { lat: 10.9, lng: 106.77, accuracyM: 10 };
  const counters = async (id: string) => (await as(app, w.admin).get(`/api/admin/events/${id}/counters`).expect(200)).body;
  const total = async () => Number((await w.ds.query('SELECT COUNT(*) AS n FROM attendances'))[0].n);

  // thiet bi moi moi lan; tra ve {expect} de viet gon: await tryCheckin(...).expect(201)
  const tryCheckin = (token: string, o: Record<string, unknown> = {}) => ({
    expect: async (status: number) =>
      postCheckin(app, await deviceCookie(app, token), checkinBody(w, token, o)).expect(status),
  });

  describe('diem danh vao', () => {
    it('trong ban kinh + chinh xac tot -> 201, luu khoang cach', async () => {
      const ev = await openEvent(w, GEO);
      const res = await tryCheckin(ev.token, HERE).expect(201);
      const row = await w.ds.getRepository(Attendance).findOneByOrFail({ id: res.body.attendance.id });
      expect(row.distanceM).toBeLessThan(5);
    });

    it('TU CHOI: ngoai ban kinh -> 400 GPS_OUTSIDE, khong tao luot, bo dem khong tang', async () => {
      const ev = await openEvent(w, GEO);
      const res = await tryCheckin(ev.token, FAR).expect(400);
      expect(res.body.code).toBe('GPS_OUTSIDE');
      expect(await total()).toBe(0);
      expect(await counters(ev.id)).toMatchObject({ checkinCount: 0 });
    });

    it('TU CHOI: khong gui GPS (hoac gui thieu accuracy) -> 400 GPS_REQUIRED', async () => {
      const ev = await openEvent(w, GEO);
      expect((await tryCheckin(ev.token).expect(400)).body.code).toBe('GPS_REQUIRED');
      expect((await tryCheckin(ev.token, { lat: 10.85, lng: 106.77 }).expect(400)).body.code).toBe('GPS_REQUIRED');
      expect(await total()).toBe(0);
    });

    it('TU CHOI: sai so > 150 m du toa do dung gia tri -> 400 GPS_LOW_ACCURACY; dung 150 m thi qua', async () => {
      const ev = await openEvent(w, GEO);
      expect((await tryCheckin(ev.token, { ...HERE, accuracyM: 151 }).expect(400)).body.code).toBe('GPS_LOW_ACCURACY');
      await tryCheckin(ev.token, { ...HERE, accuracyM: 150 }).expect(201);
    });

    it('sat bien: trong ban kinh 100 m qua, xa hon 100 m bi chan', async () => {
      const ev = await openEvent(w, GEO);
      // 1 do vi do ~ 111,2 km: 0.0008 ~ 89 m, 0.0012 ~ 133 m
      await tryCheckin(ev.token, { lat: 10.8508, lng: 106.77, accuracyM: 10 }).expect(201);
      expect((await tryCheckin(ev.token, { lat: 10.8512, lng: 106.77, accuracyM: 10 }).expect(400)).body.code).toBe('GPS_OUTSIDE');
    });

    it('[BM] thong bao loi khong lo khoang cach hay toa do su kien', async () => {
      const ev = await openEvent(w, GEO);
      const text = JSON.stringify((await tryCheckin(ev.token, FAR).expect(400)).body);
      for (const secret of ['10.85', '106.77', 'distance', 'radius', '5500']) expect(text).not.toContain(secret);
    });

    it('su kien KHONG co toa do: khong yeu cau GPS (nhu cu)', async () => {
      const ev = await openEvent(w);
      await tryCheckin(ev.token).expect(201);
      await tryCheckin(ev.token, { lat: 1, lng: 1, accuracyM: 900 }).expect(201);
    });

    it('thu lai sau khi bi chan: cung thiet bi, vao trong ban kinh thi diem danh duoc (khong mat quyen)', async () => {
      const ev = await openEvent(w, GEO);
      const cookie = await deviceCookie(app, ev.token);
      await postCheckin(app, cookie, checkinBody(w, ev.token, FAR)).expect(400);
      await postCheckin(app, cookie, checkinBody(w, ev.token, HERE)).expect(201);
    });
  });

  describe('diem danh ra', () => {
    const out = (cookie: string, body: object) => request(app.getHttpServer()).post('/api/public/checkout').set('Cookie', cookie).send(body);

    async function checkedIn() {
      const ev = await openEvent(w, { ...GEO, requireCheckout: true });
      const cookie = await deviceCookie(app, ev.token);
      await postCheckin(app, cookie, checkinBody(w, ev.token, HERE)).expect(201);
      return { ev, cookie };
    }

    it('trong ban kinh -> 201; ngoai ban kinh / thieu GPS -> 400 va chua ghi gio ra', async () => {
      const { ev, cookie } = await checkedIn();
      const body = (o: object = {}) => ({ token: ev.outToken, idempotencyKey: randomUUID(), ...o });
      expect((await out(cookie, body(FAR)).expect(400)).body.code).toBe('GPS_OUTSIDE');
      expect((await out(cookie, body()).expect(400)).body.code).toBe('GPS_REQUIRED');
      expect((await w.ds.query('SELECT checkout_at AS c FROM attendances'))[0].c).toBeNull();
      expect(await counters(ev.id)).toMatchObject({ checkoutCount: 0 });
      await out(cookie, body(HERE)).expect(201);
      expect(await counters(ev.id)).toMatchObject({ checkoutCount: 1 });
    });
  });
});
