// Gioi han tan suat diem danh cong khai: theo thiet bi, khong cookie, sua thong tin, tran IP - dac ta 8.4
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { RateLimitService } from '../src/public/rate-limit.service';
import { checkinAs, checkinBody, createTestApp, deviceCookie, openEvent, postCheckin, setupWorld, World } from './public-helpers';

// tao app voi bien moi truong rieng (loadEnv doc luc khoi tao) roi khoi phuc
async function appWith(vars: Record<string, string>): Promise<INestApplication> {
  const old: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    old[k] = process.env[k];
    process.env[k] = vars[k];
  }
  try {
    return await createTestApp();
  } finally {
    for (const k of Object.keys(vars)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
}

describe('Gioi han tan suat diem danh cong khai', () => {
  describe('theo thiet bi', () => {
    let app: INestApplication;
    let w: World;
    beforeAll(async () => {
      app = await appWith({ PUBLIC_DEVICE_RATE_LIMIT_PER_MIN: '3', PUBLIC_EDIT_RATE_LIMIT_PER_HOUR: '2' });
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      w = await setupWorld(app);
    });

    it('[BM] vuot 3 lan/phut tu MOT thiet bi -> 429 + Retry-After, du lieu khong ghi them; thiet bi khac khong bi anh huong', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      const first = checkinBody(w, ev.token);
      await postCheckin(app, cookie, first).expect(201);
      await postCheckin(app, cookie, first).expect(200);
      await postCheckin(app, cookie, checkinBody(w, ev.token)).expect(409);
      const res = await postCheckin(app, cookie, checkinBody(w, ev.token)).expect(429);
      expect(res.body).toMatchObject({ statusCode: 429, code: 'TOO_MANY_REQUESTS' });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      await checkinAs(w, ev.token); // thiet bi khac van diem danh binh thuong
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM attendances')).toEqual([{ n: '2' }]);
    });

    it('gioi han tinh theo thiet bi, khong theo IP: nhieu thiet bi cung IP deu diem danh duoc', async () => {
      const ev = await openEvent(w);
      for (let i = 0; i < 8; i++) await checkinAs(w, ev.token);
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM attendances')).toEqual([{ n: '8' }]);
    });

    it('doc trang (by-token, units, history) khong bi gioi han theo thiet bi', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.token}`).set('Cookie', cookie).expect(200);
        await request(app.getHttpServer()).get('/api/public/me/history').set('Cookie', cookie).expect(200);
      }
    });

    it('[BM] sua thong tin: 2 lan/gio/thiet bi (ke ca lan bi tu choi), lan 3 -> 429', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const patch = (body: object) =>
        request(app.getHttpServer()).patch(`/api/public/attendances/${attendance.id}`).set('Cookie', cookie).send({ idempotencyKey: randomUUID(), ...body });
      await patch({ fullName: 'Ten Mot' }).expect(200);
      await patch({}).expect(400);
      await patch({ fullName: 'Ten Hai' }).expect(429);
    });

    it('moc thoi gian het han thi dem lai (bo gioi han tan suat)', () => {
      const rl = new RateLimitService();
      try {
        expect(rl.hit('k', 2, 1000, 0)).toBeNull();
        expect(rl.hit('k', 2, 1000, 10)).toBeNull();
        expect(rl.hit('k', 2, 1000, 20)).toBeGreaterThan(0);
        expect(rl.hit('k', 2, 1000, 1500)).toBeNull(); // cua so moi
        expect(rl.hit('khac', 2, 1000, 20)).toBeNull(); // khoa khac khong anh huong
        rl.sweep(5000);
        expect(rl.hit('k', 2, 1000, 5001)).toBeNull();
      } finally {
        rl.onModuleDestroy();
      }
    });
  });

  describe('thiet bi khong co cookie', () => {
    let app: INestApplication;
    let w: World;
    beforeAll(async () => {
      app = await appWith({ PUBLIC_NO_COOKIE_RATE_LIMIT_PER_MIN: '3' });
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      w = await setupWorld(app);
    });

    it('[BM] ke xoa cookie lien tuc (moi request la "thiet bi moi") bi chan theo IP: 3 lan roi 429; nguoi co cookie hop le khong bi anh huong', async () => {
      const ev = await openEvent(w);
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await postCheckin(app, null, checkinBody(w, ev.token))).status);
      expect(codes).toEqual([201, 201, 201, 429, 429]);
      await checkinAs(w, ev.token); // co cookie tu GET truoc -> khong bi tinh vao gioi han nay
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM attendances')).toEqual([{ n: '4' }]);
    });
  });

  describe('tran IP', () => {
    let app: INestApplication;
    let w: World;
    beforeAll(async () => {
      app = await appWith({ PUBLIC_IP_RATE_LIMIT_PER_MIN: '6' });
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      w = await setupWorld(app);
    });

    it('[BM] vuot tran IP -> 429 o moi API cong khai, nhung API quan tri khong bi dem chung', async () => {
      const codes = [];
      for (let i = 0; i < 8; i++) codes.push((await request(app.getHttpServer()).get('/api/public/units')).status);
      expect(codes).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
      await request(app.getHttpServer()).get('/api/public/me/history').expect(429);
      await request(app.getHttpServer()).post('/api/public/checkin').send({}).expect(429);
      await request(app.getHttpServer()).get('/api/admin/events').set('Authorization', `Bearer ${w.admin.token}`).expect(200);
    });
  });

  describe('gioi han chung 3.000/phut khong ap cho API cong khai', () => {
    let app: INestApplication;
    let w: World;
    beforeAll(async () => {
      app = await appWith({ GLOBAL_RATE_LIMIT_PER_MIN: '3' });
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      w = await setupWorld(app);
    });

    it('ca hoi truong chung mot IP: 40 request cong khai deu qua, trong khi API quan tri van bi gioi han chung', async () => {
      const ev = await openEvent(w); // dung ~5 request quan tri -> da vuot gioi han chung 3 o ben quan tri? khong: reset tung phut, nen dem tu day
      const pub = [];
      for (let i = 0; i < 40; i++) pub.push((await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.token}`)).status);
      expect(pub.every((s) => s === 200)).toBe(true);
      const admin = [];
      for (let i = 0; i < 6; i++) {
        admin.push((await request(app.getHttpServer()).get('/api/admin/events').set('Authorization', `Bearer ${w.admin.token}`)).status);
      }
      expect(admin).toContain(429);
    });
  });
});
