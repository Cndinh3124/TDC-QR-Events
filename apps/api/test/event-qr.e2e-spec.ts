// Test ma QR (token, PNG, PDF), ma 4 so, rang buoc CHECK o DB, cau hinh URL - dac ta 3.2, 5.2, 8.3
import { INestApplication } from '@nestjs/common';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { DataSource } from 'typeorm';
import { loadEnv } from '../src/config/env';
import { Event } from '../src/events/entities/event.entity';
import { EventQrToken } from '../src/events/entities/event-qr-token.entity';
import { QrService } from '../src/events/qr.service';
import { as, createTestApp, login, makeUser, resetDb, Session, unitId } from './helpers';

const H = 3600_000;
const DAY = 24 * H;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
const body = (o: Record<string, unknown> = {}) => ({
  title: 'Chào tân sinh viên', hasDrl: true, drlPoints: 3, startAt: at(7 * DAY), endAt: at(7 * DAY + 2 * H), ...o,
});
// supertest khong tu doc application/pdf: tu gom byte
const binary = (res: any, cb: (e: Error | null, b?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
// doc lai anh QR bang bo giai ma doc lap: ma in ra giay ma khong quet duoc la loi nang nhat
const decodeQr = (png: Buffer): string | null => {
  const img = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null;
};
const TOKEN = /^[A-Za-z0-9_-]{22}$/; // 128-bit base64url

describe('Ma QR cua su kien', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Session;
  let cntt: Session;
  let kt: Session;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    ds = await resetDb(app);
    await makeUser(ds, { email: 'admin@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
    await makeUser(ds, { email: 'cntt@tdc.edu.vn', unit: 'CNTT' });
    await makeUser(ds, { email: 'kt@tdc.edu.vn', unit: 'KT' });
    admin = await login(app, 'admin@tdc.edu.vn');
    cntt = await login(app, 'cntt@tdc.edu.vn');
    kt = await login(app, 'kt@tdc.edu.vn');
  });

  const create = async (s: Session, o: Record<string, unknown> = {}) =>
    (await as(app, s).post('/api/admin/events').send(body(o)).expect(201)).body;
  const audit = async (action: string) => (await as(app, admin).get(`/api/admin/audit-logs?action=${action}`).expect(200)).body;
  const activeTokens = (id: string) => ds.getRepository(EventQrToken).find({ where: { eventId: id, isActive: true } });

  describe('token', () => {
    it('[BM] token 128-bit ngau nhien, URL chi chua token; muc Thuong chi co QR vao, muc Chat co ca QR ra', async () => {
      const normal = await create(admin);
      const a = (await as(app, admin).get(`/api/admin/events/${normal.id}/qr`).expect(200)).body;
      expect(a.checkin.token).toMatch(TOKEN);
      expect(a.checkin.url).toBe(`http://localhost:5173/diem-danh/${a.checkin.token}`);
      expect(a.checkout).toBeNull();
      expect(a.hasVerifyCode).toBe(false);

      const tight = await create(admin, { drlPoints: 8 });
      const b = (await as(app, admin).get(`/api/admin/events/${tight.id}/qr`).expect(200)).body;
      expect(b.checkin.token).toMatch(TOKEN);
      expect(b.checkout.token).toMatch(TOKEN);
      expect(new Set([a.checkin.token, b.checkin.token, b.checkout.token]).size).toBe(3);
      expect(b.hasVerifyCode).toBe(true);
      // URL khong chua thong tin su kien
      expect(a.checkin.url).not.toContain(normal.id);
      expect(a.checkin.url).not.toMatch(/Ch/);
    });

    it('[BM] DB khong cho hai dong cung token', async () => {
      const e = await create(admin);
      const t = (await activeTokens(e.id))[0];
      await expect(ds.getRepository(EventQrToken).insert({ eventId: e.id, purpose: 'CHECKOUT', token: t.token, isActive: true })).rejects.toThrow();
    });

    it('response co QR khong duoc luu vao bo nho dem (Cache-Control: no-store)', async () => {
      const e = await create(admin, { drlPoints: 8 });
      for (const p of [`/api/admin/events/${e.id}/qr`, `/api/admin/events/${e.id}/qr.png`, `/api/admin/events/${e.id}/qr.pdf`]) {
        const res = await as(app, admin).get(p).buffer(true).parse(binary).expect(200);
        expect([p, res.headers['cache-control']]).toEqual([p, 'no-store']);
      }
      const post = await as(app, admin).post('/api/admin/events').send(body({ drlPoints: 9 })).expect(201);
      expect(post.headers['cache-control']).toBe('no-store');
    });

    it('[NV] 3.2 tao ma moi: ma cu het hieu luc ngay, bat buoc ly do, khong ghi token vao nhat ky', async () => {
      const e = await create(admin);
      const old = (await activeTokens(e.id))[0];
      const rotate = (b: object) => as(app, admin).post(`/api/admin/events/${e.id}/qr/rotate`).send(b);
      await rotate({ purpose: 'CHECKIN' }).expect(400); // thieu ly do
      await rotate({ purpose: 'CHECKIN', reason: 'a' }).expect(400);
      await rotate({ reason: 'Nghi lo ma' }).expect(400); // thieu purpose
      await rotate({ purpose: 'BOTH', reason: 'Nghi lo ma' }).expect(400);
      expect((await activeTokens(e.id))[0].token).toBe(old.token); // chua doi gi

      const res = await rotate({ purpose: 'CHECKIN', reason: 'Nghi lo ma' }).expect(200);
      expect(res.body.checkin.token).toMatch(TOKEN);
      expect(res.body.checkin.token).not.toBe(old.token);
      const active = await activeTokens(e.id);
      expect(active).toHaveLength(1);
      const oldRow = await ds.getRepository(EventQrToken).findOneByOrFail({ id: old.id });
      expect(oldRow.isActive).toBe(false); // giu lai de truy vet

      const logs = JSON.stringify((await audit('EVENT_QR_ROTATE')).items);
      expect(logs).toContain('Nghi lo ma');
      expect(logs).not.toContain(old.token);
      expect(logs).not.toContain(res.body.checkin.token);
    });

    it('TU CHOI: doi ma QR ra khi su kien khong bat diem danh ra (409); su kien da huy (409)', async () => {
      const e = await create(admin);
      const rotate = (b: object) => as(app, admin).post(`/api/admin/events/${e.id}/qr/rotate`).send(b);
      expect((await rotate({ purpose: 'CHECKOUT', reason: 'thu' }).expect(409)).body.code).toBe('CHECKOUT_DISABLED');
      await as(app, admin).post(`/api/admin/events/${e.id}/cancel`).send({ reason: 'Huy su kien' }).expect(200);
      expect((await rotate({ purpose: 'CHECKIN', reason: 'thu' }).expect(409)).body.code).toBe('EVENT_CANCELLED');
    });

    it('doi ma cung luc: luon chi con dung mot ma dang hoat dong', async () => {
      const e = await create(admin, { drlPoints: 8 });
      const run = () => as(app, admin).post(`/api/admin/events/${e.id}/qr/rotate`).send({ purpose: 'CHECKIN', reason: 'Doi dong thoi' });
      const codes = (await Promise.all([run(), run(), run(), run(), run()])).map((r) => r.status);
      expect(codes).toEqual([200, 200, 200, 200, 200]);
      const active = await activeTokens(e.id);
      expect(active.filter((t) => t.purpose === 'CHECKIN')).toHaveLength(1);
      expect(active.filter((t) => t.purpose === 'CHECKOUT')).toHaveLength(1);
    });

    it('PHAM VI: quan ly khoa khac khong xem / doi ma QR (404), token khong bi doi', async () => {
      const e = await create(cntt);
      const before = (await activeTokens(e.id))[0].token;
      await as(app, kt).get(`/api/admin/events/${e.id}/qr`).expect(404);
      await as(app, kt).post(`/api/admin/events/${e.id}/qr/rotate`).send({ purpose: 'CHECKIN', reason: 'tan cong' }).expect(404);
      expect((await activeTokens(e.id))[0].token).toBe(before);
      await as(app, cntt).post(`/api/admin/events/${e.id}/qr/rotate`).send({ purpose: 'CHECKIN', reason: 'Khoa tu doi' }).expect(200);
    });
  });

  describe('ma 4 so (muc Chat)', () => {
    it('[BM] DB chi luu HMAC theo su kien; doi ma thi ma cu het hieu luc; khong ghi ma vao nhat ky', async () => {
      const qr = app.get(QrService);
      const e = await create(admin, { drlPoints: 9 });
      const row = () => ds.getRepository(Event).findOneByOrFail({ id: e.id });
      const first = e.verifyCode as string;
      expect(first).toMatch(/^\d{4}$/);
      expect((await row()).verifyCodeHash).toBe(qr.hashVerifyCode(e.id, first));
      expect((await row()).verifyCodeHash).not.toContain(first);

      const res = await as(app, admin).post(`/api/admin/events/${e.id}/verify-code/rotate`).send({ reason: 'Lo ma doc' }).expect(200);
      const second = res.body.verifyCode as string;
      expect(second).toMatch(/^\d{4}$/);
      const hash = (await row()).verifyCodeHash;
      expect(hash).toBe(qr.hashVerifyCode(e.id, second));
      if (second !== first) expect(hash).not.toBe(qr.hashVerifyCode(e.id, first));
      // cung ma 4 so o su kien khac cho hash khac
      expect(qr.hashVerifyCode(e.id, '1234')).not.toBe(qr.hashVerifyCode('other-event', '1234'));
      const logs = JSON.stringify((await audit('EVENT_CODE_ROTATE')).items);
      expect(logs).toContain('Lo ma doc');
      expect(logs).not.toContain(`"${second}"`);
    });

    it('TU CHOI: thieu ly do (400); su kien muc Thuong (409); khoa khac (404); su kien da huy (409)', async () => {
      const tight = await create(admin, { drlPoints: 9 });
      const normal = await create(admin);
      const rot = (id: string, s: Session, b: object = { reason: 'Doi ma' }) =>
        as(app, s).post(`/api/admin/events/${id}/verify-code/rotate`).send(b);
      await rot(tight.id, admin, {}).expect(400);
      expect((await rot(normal.id, admin).expect(409)).body.code).toBe('NOT_TIGHT');
      const mine = await create(cntt, { drlPoints: 9 });
      await rot(mine.id, kt).expect(404);
      await as(app, admin).post(`/api/admin/events/${tight.id}/cancel`).send({ reason: 'Huy su kien' }).expect(200);
      await rot(tight.id, admin).expect(409);
    });
  });

  describe('xuat PNG / PDF', () => {
    it('[NV] 3.2 anh QR quet ra dung URL chua token dang hieu luc; doi ma thi anh doi theo', async () => {
      const e = await create(admin, { drlPoints: 8 });
      const info = (await as(app, admin).get(`/api/admin/events/${e.id}/qr`).expect(200)).body;
      const get = async (q: string) =>
        (await as(app, admin).get(`/api/admin/events/${e.id}/qr.png${q}`).buffer(true).parse(binary).expect(200)).body as Buffer;
      expect(decodeQr(await get(''))).toBe(info.checkin.url);
      expect(decodeQr(await get('?purpose=CHECKOUT'))).toBe(info.checkout.url);
      const rotated = (await as(app, admin).post(`/api/admin/events/${e.id}/qr/rotate`).send({ purpose: 'CHECKIN', reason: 'Nghi lo ma' }).expect(200)).body;
      expect(decodeQr(await get(''))).toBe(rotated.checkin.url);
      expect(rotated.checkin.url).not.toBe(info.checkin.url);
    }, 90_000); // tao PNG trong sandbox cua jest cham (~3 giay / anh), ngoai jest chi vai chuc ms

    it('PNG hop le, mac dinh QR vao; QR ra chi co khi bat diem danh ra', async () => {
      const e = await create(admin, { drlPoints: 8 });
      const png = await as(app, admin).get(`/api/admin/events/${e.id}/qr.png`).buffer(true).parse(binary).expect(200);
      expect(png.headers['content-type']).toMatch(/image\/png/);
      expect((png.body as Buffer).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const out = await as(app, admin).get(`/api/admin/events/${e.id}/qr.png?purpose=CHECKOUT`).buffer(true).parse(binary).expect(200);
      expect(Buffer.compare(png.body, out.body)).not.toBe(0); // hai ma khac nhau
      const normal = await create(admin);
      await as(app, admin).get(`/api/admin/events/${normal.id}/qr.png?purpose=CHECKOUT`).expect(404);
    });

    it('PDF A4: dung dinh dang, ten tep co dinh, 1 trang, tieu de tieng Viet / rat dai / ky tu la khong gay loi', async () => {
      const titles = [
        'Chào mừng tân sinh viên khóa 2026 – Đoàn Hội TDC',
        'x'.repeat(200),
        'Tiêu đề có "dấu nháy" và\r\nxuống dòng; <b>html</b> & ký tự lạ ✓',
      ];
      for (const title of titles) {
        const e = await create(admin, { title, locationName: 'Hội trường lớn tầng 5, tòa nhà A, số 53 Võ Văn Ngân, Thủ Đức' });
        const res = await as(app, admin).get(`/api/admin/events/${e.id}/qr.pdf`).buffer(true).parse(binary).expect(200);
        const pdf = res.body as Buffer;
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(res.headers['content-type']).toMatch(/application\/pdf/);
        expect(res.headers['content-disposition']).toBe('attachment; filename="qr-checkin.pdf"');
        expect(pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1);
        expect(pdf.length).toBeGreaterThan(5000);
      }
    });

    it('TU CHOI: purpose sai (400), khong dang nhap (401), khoa khac (404)', async () => {
      const e = await create(cntt);
      await as(app, cntt).get(`/api/admin/events/${e.id}/qr.pdf?purpose=ALL`).expect(400);
      await as(app, cntt).get(`/api/admin/events/${e.id}/qr.png?purpose=checkin`).expect(400);
      await as(app, kt).get(`/api/admin/events/${e.id}/qr.pdf`).expect(404);
      const anon = await import('supertest');
      await anon.default(app.getHttpServer()).get(`/api/admin/events/${e.id}/qr.pdf`).expect(401);
      await anon.default(app.getHttpServer()).get(`/api/admin/events/${e.id}/qr`).expect(401);
    });
  });

  describe('rang buoc CHECK o DB (lop bao ve cuoi, ke ca khi bo qua service)', () => {
    const base = async () => ({
      id: '22222222-2222-4222-8222-222222222222',
      unitId: await unitId(ds, 'CNTT'),
      title: 'Truc tiep DB',
      createdBy: '33333333-3333-4333-8333-333333333333',
      startAt: new Date('2026-12-01T08:00:00Z'),
      endAt: new Date('2026-12-01T10:00:00Z'),
      checkinOpenAt: new Date('2026-12-01T07:30:00Z'),
      checkinCloseAt: new Date('2026-12-01T10:00:00Z'),
      hasDrl: true,
      drlPoints: 5,
    });
    const insert = async (o: Record<string, unknown>) => ds.getRepository(Event).insert({ ...(await base()), ...o } as any);

    it('hop le thi them duoc (doi chung de chac cac ca duoi bi chan dung ly do)', async () => {
      await insert({});
      expect(await ds.getRepository(Event).count()).toBe(1);
    });

    const rejected: Array<[string, Record<string, unknown>]> = [
      ['DRL = 0', { drlPoints: 0 }],
      ['DRL = 11', { drlPoints: 11 }],
      ['co DRL nhung diem NULL', { drlPoints: null }],
      ['khong cong DRL nhung co diem', { hasDrl: false, drlPoints: 5 }],
      ['gio ket thuc <= bat dau', { endAt: new Date('2026-12-01T08:00:00Z') }],
      ['dong diem danh <= mo', { checkinCloseAt: new Date('2026-12-01T07:30:00Z') }],
      ['co vi do ma khong co kinh do / ban kinh', { latitude: 10.8 }],
      ['co toa do ma khong co ban kinh', { latitude: 10.8, longitude: 106.7 }],
      ['chi co ban kinh', { radiusM: 100 }],
      ['vi do 95', { latitude: 95, longitude: 106.7, radiusM: 100 }],
      ['kinh do 200', { latitude: 10, longitude: 200, radiusM: 100 }],
      ['ban kinh 9', { latitude: 10, longitude: 106, radiusM: 9 }],
      ['ban kinh 5001', { latitude: 10, longitude: 106, radiusM: 5001 }],
    ];
    it.each(rejected)('DB tu choi: %s', async (_n, override) => {
      await expect(insert(override)).rejects.toThrow(/check constraint|CHK_events/i);
      expect(await ds.getRepository(Event).count()).toBe(0);
    });

    it('DB tu choi don vi khong ton tai (khoa ngoai) va xoa don vi dang co su kien', async () => {
      await expect(insert({ unitId: '44444444-4444-4444-8444-444444444444' })).rejects.toThrow();
      await insert({});
      await expect(ds.query('DELETE FROM units WHERE code = ?', ['CNTT'])).rejects.toThrow(/foreign key/i);
    });
  });

  describe('cau hinh PUBLIC_BASE_URL', () => {
    const env = (o: Record<string, string>) =>
      loadEnv({ DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'Mat-khau-manh-2026', DB_NAME: 'd', JWT_ACCESS_SECRET: 'x7Qm2Vb9Lk4Zp8Wt3Rn6Yc1Hd5Fg0JsAeUo7XiMq2Bv', DEVICE_SECRET: 'Kd83mZq1Wx7Lp4Vn9Rt2Yb6Hc0FgJsUeAoXiMq5Bv3', ...o } as any);

    it('dev: co mac dinh; chi lay origin (bo duong dan, tham so)', () => {
      expect(env({}).publicBaseUrl).toBe('http://localhost:5173');
      expect(env({ PUBLIC_BASE_URL: 'https://diemdanh.tdc.edu.vn/abc?x=1' }).publicBaseUrl).toBe('https://diemdanh.tdc.edu.vn');
    });

    it('[BM] production: bat buoc khai bao va phai https', () => {
      expect(() => env({ NODE_ENV: 'production' })).toThrow(/PUBLIC_BASE_URL/);
      expect(() => env({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'http://diemdanh.tdc.edu.vn' })).toThrow(/https/);
      expect(env({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://diemdanh.tdc.edu.vn' }).publicBaseUrl).toBe('https://diemdanh.tdc.edu.vn');
    });

    it('TU CHOI: URL hong hoac giao thuc la (javascript:, ftp:)', () => {
      expect(() => env({ PUBLIC_BASE_URL: 'khong-phai-url' })).toThrow(/URL/);
      expect(() => env({ PUBLIC_BASE_URL: 'javascript:alert(1)' })).toThrow();
      expect(() => env({ PUBLIC_BASE_URL: 'ftp://x.tdc.edu.vn' })).toThrow(/http/);
    });
  });
});
