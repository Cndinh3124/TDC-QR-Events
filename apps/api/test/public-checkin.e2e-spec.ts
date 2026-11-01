// Test diem danh vao cua sinh vien: luat chan ngay, idempotency, ma thiet bi, tranh chap - dac ta 3.3, 4, 5.1, 8.4
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { Attendance } from '../src/public/entities/attendance.entity';
import { DeviceService } from '../src/public/device.service';
import {
  as, checkinAs, checkinBody, createTestApp, deviceCookie, H, openEvent, patchEvent, postCheckin, setupWorld, World,
} from './public-helpers';

describe('Diem danh cong khai - vao', () => {
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

  const rows = () => w.ds.getRepository(Attendance).count();
  const counters = async (id: string) =>
    (await as(app, w.admin).get(`/api/admin/events/${id}/counters`).expect(200)).body;

  describe('doc thong tin', () => {
    it('GET /units: chi khoa dang hoat dong, khong co Doan truong; khong can dang nhap', async () => {
      const res = await request(app.getHttpServer()).get('/api/public/units').expect(200);
      expect(res.body).toHaveLength(9);
      expect(res.body.map((u: any) => u.code)).not.toContain('DTN');
      expect(Object.keys(res.body[0]).sort()).toEqual(['code', 'id', 'name']);
      await as(app, w.admin).post(`/api/admin/units/${w.faculty2}/deactivate`).send({ reason: 'thu nghiem' }).expect(200);
      const after = await request(app.getHttpServer()).get('/api/public/units').expect(200);
      expect(after.body).toHaveLength(8);
    });

    it('[BM] by-token: cap cookie thiet bi (httpOnly, path rieng), khong lo toa do / token / hash ma 4 so', async () => {
      const ev = await openEvent(w, { latitude: 10.85, longitude: 106.77, radiusM: 100 });
      const res = await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.token}`).expect(200);
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^tdc_dev=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/api\/public/);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ state: 'OPEN', purpose: 'CHECKIN', verifyCodeRequired: false, attendance: null, prefill: null });
      expect(res.body.event).toMatchObject({ title: 'Chào tân sinh viên', requiresGps: true });
      const text = JSON.stringify(res.body);
      for (const secret of ['latitude', 'longitude', 'radiusM', 'verifyCodeHash', ev.token, ev.id, '10.85', '106.77']) {
        expect(text).not.toContain(secret);
      }
      // ban sao cho localStorage dung la gia tri cookie va do chinh server ky
      expect(app.get(DeviceService).parse(res.body.deviceToken)).not.toBeNull();
      expect(cookie).toContain(res.body.deviceToken);
    });

    it('TU CHOI: by-token voi token sai / sai dinh dang / da doi ma / ma ra dung cho cua su kien khac -> cung mot 404', async () => {
      const ev = await openEvent(w);
      await as(app, w.admin).post(`/api/admin/events/${ev.id}/qr/rotate`).send({ purpose: 'CHECKIN', reason: 'nghi lo ma' }).expect(200);
      const bodies = [];
      for (const t of [ev.token, 'a'.repeat(22), 'ngan', 'x'.repeat(200), "' OR 1=1 --"]) {
        const res = await request(app.getHttpServer()).get(`/api/public/events/by-token/${encodeURIComponent(t)}`).expect(404);
        bodies.push(res.body);
      }
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
      expect(bodies[0]).toMatchObject({ code: 'QR_INVALID' });
    });

    it('by-token cho su kien chua mo / da huy: tra state, khong loi', async () => {
      const ev = await openEvent(w);
      await as(app, w.admin).post(`/api/admin/events/${ev.id}/cancel`).send({ reason: 'doi lich' }).expect(200);
      // huy xong thi QR bi vo hieu: 404 nhu moi truong hop sai ma
      await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.token}`).expect(404);
    });
  });

  describe('thanh cong', () => {
    it('201: luot ghi dung, "ve" khong lo IP / GPS / thiet bi, DB co dong thiet bi + cap MSSV + viec nen + bo dem', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      const body = checkinBody(w, ev.token, { mssv: ' 24211tm1152 ', email: 'an@tdc.edu.vn', lat: 10.85, lng: 106.77, accuracyM: 12.4 });
      const res = await postCheckin(app, cookie, body).expect(201);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.state).toBe('OPEN');
      expect(res.body.attendance).toMatchObject({
        mssv: '24211TM1152', fullName: 'Nguyễn Văn An', email: 'an@tdc.edu.vn', facultyUnitId: w.faculty,
        timeliness: 'ON_TIME', editCount: 0, editsLeft: 3, canEdit: true, checkoutAt: null,
      });
      expect(res.body.attendance.confirmCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      const text = JSON.stringify(res.body);
      for (const secret of ['ip', 'userAgent', 'deviceId', 'lat', 'lng', 'gps']) expect(text.toLowerCase()).not.toContain(`"${secret}"`);

      const row = await w.ds.getRepository(Attendance).findOneByOrFail({ id: res.body.attendance.id });
      expect(row).toMatchObject({ eventId: ev.id, mssv: '24211TM1152', source: 'SELF', reviewStatus: 'PENDING', gpsAccuracyM: 12, lat: 10.85 });
      // [BM] DB chi luu hash cua ma thiet bi, khong luu ma goc trong cookie
      const code = cookie.split('=')[1].split('.')[0];
      expect(row.deviceId).toMatch(/^[0-9a-f]{64}$/);
      expect(row.deviceId).not.toContain(code);
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM student_devices WHERE mssv = ? AND device_id = ?', ['24211TM1152', row.deviceId])).toEqual([{ n: '1' }]);
      expect(await w.ds.query("SELECT COUNT(*) AS n FROM attendance_jobs WHERE attendance_id = ? AND status = 'PENDING'", [row.id])).toEqual([{ n: '1' }]);
      expect(await counters(ev.id)).toEqual({ checkinCount: 1, checkoutCount: 0, onTimeCount: 1, lateCount: 0 });
    });

    it('[NV] 3.1: sau gio bat dau + an han la Muon; trong an han la Dung gio', async () => {
      const ev = await openEvent(w, { graceMinutes: 15 });
      await patchEvent(w, ev.id, { startAt: new Date(Date.now() - 10 * 60_000) }); // moi tre 10 phut < 15
      expect((await checkinAs(w, ev.token)).attendance).toBeDefined();
      await patchEvent(w, ev.id, { startAt: new Date(Date.now() - 20 * 60_000) }); // tre 20 phut > 15
      const late = await postCheckin(app, await deviceCookie(app, ev.token), checkinBody(w, ev.token)).expect(201);
      expect(late.body.attendance.timeliness).toBe('LATE');
      expect(await counters(ev.id)).toMatchObject({ checkinCount: 2, onTimeCount: 1, lateCount: 1 });
    });

    it('khi da diem danh, by-token tra luot hien co; thiet bi cu duoc dien san thong tin o su kien khac', async () => {
      const a = await openEvent(w);
      const { cookie } = await checkinAs(w, a.token, { mssv: '24211TM2001', fullName: 'Lê Thị Bé' });
      const again = await request(app.getHttpServer()).get(`/api/public/events/by-token/${a.token}`).set('Cookie', cookie).expect(200);
      expect(again.body.attendance).toMatchObject({ mssv: '24211TM2001', canEdit: true });
      expect(again.body.prefill).toBeNull();
      const b = await openEvent(w, { title: 'Sự kiện khác' });
      const next = await request(app.getHttpServer()).get(`/api/public/events/by-token/${b.token}`).set('Cookie', cookie).expect(200);
      expect(next.body.attendance).toBeNull();
      expect(next.body.prefill).toEqual({ mssv: '24211TM2001', fullName: 'Lê Thị Bé', facultyUnitId: w.faculty, email: null });
    });
  });

  describe('luat chan ngay (5.1)', () => {
    it('TU CHOI: QR sai / da doi ma / QR ra dung de vao -> 404 QR_INVALID, khong tao luot', async () => {
      const ev = await openEvent(w, { drlPoints: 8, controlLevel: 'TIGHT' }); // Chat: co QR ra
      const cookie = await deviceCookie(app, ev.token);
      for (const token of ['b'.repeat(22), 'ngan', ev.outToken!]) {
        const res = await postCheckin(app, cookie, checkinBody(w, token)).expect(404);
        expect(res.body.code).toBe('QR_INVALID');
      }
      await as(app, w.admin).post(`/api/admin/events/${ev.id}/qr/rotate`).send({ purpose: 'CHECKIN', reason: 'nghi lo ma' }).expect(200);
      await postCheckin(app, cookie, checkinBody(w, ev.token)).expect(404); // ma cu het hieu luc ngay
      expect(await rows()).toBe(0);
    });

    it('TU CHOI: chua mo / da dong / nhap / da huy / luu tru -> 409 kem ma loi rieng, khong tao luot', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      const expectCode = async (code: string) =>
        expect((await postCheckin(app, cookie, checkinBody(w, ev.token)).expect(409)).body.code).toBe(code);

      await as(app, w.admin).post(`/api/admin/events/${ev.id}/close`).expect(200);
      await expectCode('CHECKIN_CLOSED');
      await as(app, w.admin).post(`/api/admin/events/${ev.id}/auto`).expect(200); // PUBLISHED theo gio
      await patchEvent(w, ev.id, { checkinOpenAt: new Date(Date.now() + H), checkinCloseAt: new Date(Date.now() + 2 * H) });
      await expectCode('CHECKIN_NOT_YET');
      await patchEvent(w, ev.id, { checkinOpenAt: new Date(Date.now() - 2 * H), checkinCloseAt: new Date(Date.now() - H) });
      await expectCode('CHECKIN_CLOSED');
      await patchEvent(w, ev.id, { status: 'DRAFT' });
      await expectCode('CHECKIN_NOT_AVAILABLE');
      await patchEvent(w, ev.id, { status: 'CHECKIN_OPEN', archivedAt: new Date() });
      await expectCode('CHECKIN_NOT_AVAILABLE');
      await patchEvent(w, ev.id, { status: 'CANCELLED', archivedAt: null });
      await expectCode('CHECKIN_NOT_AVAILABLE');
      expect(await rows()).toBe(0);
    });

    it('[NV] 5.1 bam tay mo luon thang gio tu dong: ngoai khung gio van diem danh duoc', async () => {
      const ev = await openEvent(w); // CHECKIN_OPEN
      await patchEvent(w, ev.id, { checkinOpenAt: new Date(Date.now() - 3 * H), checkinCloseAt: new Date(Date.now() - 2 * H) });
      await checkinAs(w, ev.token);
    });

    it.each([
      ['rong', ''], ['ngan', '24211TM115'], ['dai', '24211TM11522'], ['thieu chu', '242111111111'], ['thieu so', 'ABCDEFGHIJK'],
      ['so o cuoi sai', '24211TM11A2'], ['ky tu la', '24211TM115-'], ['tieng Viet', '24211TĐ1152'], ['tiem SQL', "24211TM1152' OR '1'='1"],
      ['xuong dong', '24211TM1152\n24211TM1153'], ['qua dai', 'x'.repeat(31)],
    ])('TU CHOI: MSSV sai dinh dang (%s)', async (_n, mssv) => {
      const ev = await openEvent(w);
      const res = await postCheckin(app, await deviceCookie(app, ev.token), checkinBody(w, ev.token, { mssv })).expect(400);
      expect(['INVALID_MSSV', 'VALIDATION_ERROR']).toContain(res.body.code);
      expect(await rows()).toBe(0);
    });

    it('[NV] 3.8: chuan hoa khoang trang + chu thuong; doi bieu thuc trong cau hinh thi ap dung ngay', async () => {
      const ev = await openEvent(w);
      const ok = await postCheckin(app, await deviceCookie(app, ev.token), checkinBody(w, ev.token, { mssv: '2 4211 tm 1152' })).expect(201);
      expect(ok.body.attendance.mssv).toBe('24211TM1152');
      await as(app, w.admin).patch('/api/admin/settings').send({ mssv_regex: '^\\d{5}[A-Z]{2}\\d{4}$|^SV\\d{6}$' }).expect(200);
      await postCheckin(app, await deviceCookie(app, ev.token), checkinBody(w, ev.token, { mssv: 'sv123456' })).expect(201);
    });

    it.each([
      ['thieu ho ten', { fullName: undefined }], ['ho ten 1 ky tu', { fullName: 'A' }], ['ho ten qua dai', { fullName: 'A'.repeat(101) }],
      ['ho ten co ky tu dieu khien', { fullName: 'An\u0000Binh' }], ['ho ten co ky tu vo hinh', { fullName: 'An​Binh' }],
      ['khoa khong phai uuid', { facultyUnitId: 'cntt' }], ['thieu khoa', { facultyUnitId: undefined }],
      ['key khong phai uuid', { idempotencyKey: 'abc' }], ['key thieu', { idempotencyKey: undefined }],
      ['email sai', { email: 'khong-phai-email' }], ['vi do ngoai khoang', { lat: 91, lng: 10 }], ['kinh do ngoai khoang', { lat: 10, lng: 181 }],
      ['chi co vi do', { lat: 10 }], ['chi co kinh do', { lng: 10 }], ['vi do la chu', { lat: 'abc', lng: 1 }], ['do chinh xac am', { lat: 1, lng: 1, accuracyM: -5 }],
      ['fingerprint la', { fingerprint: 'a b!' }], ['truong la', { isAdmin: true }], ['truong deviceId', { deviceId: 'x' }],
    ])('TU CHOI: du lieu xau (%s) -> 400, khong tao luot', async (_n, patch) => {
      const ev = await openEvent(w);
      const body: Record<string, unknown> = { ...checkinBody(w, ev.token), ...patch };
      await postCheckin(app, await deviceCookie(app, ev.token), body).expect(400);
      expect(await rows()).toBe(0);
    });

    it('TU CHOI: khoa khong ton tai / la Doan truong / da ngung hoat dong -> 400 INVALID_FACULTY', async () => {
      const ev = await openEvent(w);
      const dtn = (await w.ds.query("SELECT id FROM units WHERE code = 'DTN'"))[0].id;
      await as(app, w.admin).post(`/api/admin/units/${w.faculty2}/deactivate`).send({ reason: 'thu nghiem' }).expect(200);
      for (const id of [randomUUID(), dtn, w.faculty2]) {
        const res = await postCheckin(app, await deviceCookie(app, ev.token), checkinBody(w, ev.token, { facultyUnitId: id })).expect(400);
        expect(res.body.code).toBe('INVALID_FACULTY');
      }
      expect(await rows()).toBe(0);
    });

    it('TU CHOI: body khong phai JSON / qua 100 KB -> 400 / 413, khong 500', async () => {
      await request(app.getHttpServer()).post('/api/public/checkin').set('Content-Type', 'application/json').send('{hong').expect(400);
      await request(app.getHttpServer()).post('/api/public/checkin').send({ token: 'x'.repeat(200_000) }).expect(413);
    });
  });

  describe('thiet bi da diem danh va gui lai (idempotency)', () => {
    it('[NV] 5.1: cung thiet bi lan 2 voi khoa khac -> 409 + tra luot cu, khong tao luot moi', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const res = await postCheckin(app, cookie, checkinBody(w, ev.token, { mssv: '24211TM9999', fullName: 'Nguoi Khac' })).expect(409);
      expect(res.body).toMatchObject({ code: 'DEVICE_ALREADY_CHECKED_IN', attendance: { id: attendance.id, mssv: attendance.mssv, canEdit: true } });
      expect(await rows()).toBe(1);
      expect((await counters(ev.id)).checkinCount).toBe(1);
    });

    it('gui lai cung idempotencyKey (mat mang) -> 200 + ket qua cu, khong ghi them, bo dem khong tang', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      const body = checkinBody(w, ev.token);
      const first = await postCheckin(app, cookie, body).expect(201);
      for (let i = 0; i < 3; i++) {
        const again = await postCheckin(app, cookie, body).expect(200);
        expect(again.body.attendance.id).toBe(first.body.attendance.id);
        expect(again.body.attendance.confirmCode).toBe(first.body.attendance.confirmCode);
      }
      expect(await rows()).toBe(1);
      expect((await counters(ev.id)).checkinCount).toBe(1);
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM attendance_jobs')).toEqual([{ n: '1' }]);
    });

    it('[BM] khoa idempotency cua nguoi khac (thiet bi khac dung lai khoa) -> 409, khong lo luot cua nguoi do', async () => {
      const ev = await openEvent(w);
      const mine = await checkinAs(w, ev.token, { mssv: '24211TM3001' });
      const key = (await w.ds.getRepository(Attendance).findOneByOrFail({ id: mine.attendance.id })).idempotencyKey!;
      const res = await postCheckin(app, await deviceCookie(app, ev.token), checkinBody(w, ev.token, { idempotencyKey: key })).expect(409);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(JSON.stringify(res.body)).not.toContain('24211TM3001');
      expect(await rows()).toBe(1);
    });

    it('[NV] 6: 25 request CUNG LUC tu mot thiet bi (khoa khac nhau) -> dung 1 luot, con lai 409', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      const res = await Promise.all(Array.from({ length: 25 }, () => postCheckin(app, cookie, checkinBody(w, ev.token))));
      const codes = res.map((r) => r.status);
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 409)).toHaveLength(24);
      expect(await rows()).toBe(1);
      expect((await counters(ev.id)).checkinCount).toBe(1);
    });

    it('25 request CUNG LUC cung khoa (nguoi dung bam nhieu lan) -> 1 luot, tat ca nhan cung ket qua', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      const body = checkinBody(w, ev.token);
      const res = await Promise.all(Array.from({ length: 25 }, () => postCheckin(app, cookie, body)));
      expect(res.every((r) => r.status === 201 || r.status === 200)).toBe(true);
      expect(new Set(res.map((r) => r.body.attendance.id)).size).toBe(1);
      expect(await rows()).toBe(1);
    });

    it('60 thiet bi khac nhau cung luc -> 60 luot, bo dem dung, khong request nao that bai', async () => {
      const ev = await openEvent(w);
      const res = await Promise.all(
        Array.from({ length: 60 }, async () => {
          const cookie = await deviceCookie(app, ev.token);
          return postCheckin(app, cookie, checkinBody(w, ev.token));
        }),
      );
      expect(res.filter((r) => r.status !== 201).map((r) => r.body)).toEqual([]);
      expect(await rows()).toBe(60);
      expect(await counters(ev.id)).toMatchObject({ checkinCount: 60, onTimeCount: 60 });
      expect(await w.ds.query('SELECT COUNT(*) AS n FROM attendance_jobs')).toEqual([{ n: '60' }]);
    });
  });

  describe('ma thiet bi (4)', () => {
    it('[BM] cookie bi sua chu ky / ma la / cua he thong khac -> coi nhu thiet bi moi, khong "lay" thiet bi cua nguoi khac', async () => {
      const ev = await openEvent(w);
      const { cookie, attendance } = await checkinAs(w, ev.token);
      const [name, value] = cookie.split('=');
      const [code, sig] = value.split('.');
      const forged = [
        `${name}=${code}.${sig.slice(0, -2)}AA`, // sua chu ky
        `${name}=${code}`, // bo chu ky
        `${name}=${code}.${'A'.repeat(sig.length)}`,
        `${name}=${'B'.repeat(43)}.${sig}`, // ma khac, chu ky cu
        `${name}=${code}.${sig}.extra`,
        `${name}=`,
      ];
      for (const c of forged) {
        const res = await postCheckin(app, c, checkinBody(w, ev.token)).expect(201); // la thiet bi moi -> tao luot rieng
        expect(res.body.attendance.id).not.toBe(attendance.id);
        expect(([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]).join()).toMatch(/tdc_dev=/); // cap ma moi
      }
      expect(await rows()).toBe(1 + forged.length);
    });

    it('khong co cookie: server cap ma moi va van cho diem danh (se gan co NEW_DEVICE o worker)', async () => {
      const ev = await openEvent(w);
      const res = await postCheckin(app, null, checkinBody(w, ev.token)).expect(201);
      expect(([] as string[]).concat(res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^tdc_dev=/);
      const [job] = await w.ds.query('SELECT payload_json AS p FROM attendance_jobs');
      expect(job.p).toEqual({ newDevice: true });
    });

    it('cookie bi xoa nhung con ban sao localStorage (header X-Device-Token) -> nhan lai dung thiet bi va dat lai cookie', async () => {
      const ev = await openEvent(w);
      const info = await request(app.getHttpServer()).get(`/api/public/events/by-token/${ev.token}`).expect(200);
      const cookie = ([] as string[]).concat(info.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      await postCheckin(app, cookie, checkinBody(w, ev.token)).expect(201);
      const restored = await request(app.getHttpServer())
        .post('/api/public/checkin').set('X-Device-Token', info.body.deviceToken).send(checkinBody(w, ev.token)).expect(409);
      expect(restored.body.code).toBe('DEVICE_ALREADY_CHECKED_IN');
      expect(([] as string[]).concat(restored.headers['set-cookie'] as unknown as string[])[0]).toContain(info.body.deviceToken);
      // header gia khong co tac dung
      await request(app.getHttpServer()).post('/api/public/checkin').set('X-Device-Token', 'gia.mao').send(checkinBody(w, ev.token)).expect(201);
    });

    it('[BM] chong CSRF: Origin la trang khac -> 403 BAD_ORIGIN; dung Origin cua trang diem danh -> qua', async () => {
      const ev = await openEvent(w);
      const cookie = await deviceCookie(app, ev.token);
      const res = await postCheckin(app, cookie, checkinBody(w, ev.token)).set('Origin', 'https://evil.example').expect(403);
      expect(res.body.code).toBe('BAD_ORIGIN');
      expect(await rows()).toBe(0);
      await postCheckin(app, cookie, checkinBody(w, ev.token)).set('Origin', 'http://localhost:5173').expect(201);
    });
  });

  describe('rang buoc du lieu lien quan', () => {
    it('[NV] 6: xoa su kien da co luot diem danh -> 409 EVENT_IN_USE (khoa ngoai RESTRICT), du lieu con nguyen', async () => {
      const ev = await openEvent(w);
      await checkinAs(w, ev.token);
      const res = await as(app, w.admin).del(`/api/admin/events/${ev.id}`).send({ reason: 'xoa thu' }).expect(409);
      expect(res.body.code).toBe('EVENT_IN_USE');
      expect(await rows()).toBe(1);
    });

    it('[NV] 3.7: khoa da co sinh vien diem danh -> khong xoa cung (409 UNIT_IN_USE), chi ngung hoat dong', async () => {
      const ev = await openEvent(w);
      const unit = (await as(app, w.admin).post('/api/admin/units').send({ name: 'Khoa thử nghiệm', code: 'TNGHIEM' }).expect(201)).body;
      await checkinAs(w, ev.token, { facultyUnitId: unit.id });
      const res = await as(app, w.admin).del(`/api/admin/units/${unit.id}`).send({ reason: 'xoa thu' }).expect(409);
      expect(res.body.code).toBe('UNIT_IN_USE');
    });

    it('[BM] CHECK o DB: edit_count > 3 hoac thoi gian ra truoc gio vao bi chan ngay ca khi bo qua service', async () => {
      const ev = await openEvent(w);
      const { attendance } = await checkinAs(w, ev.token);
      await expect(w.ds.query('UPDATE attendances SET edit_count = 4 WHERE id = ?', [attendance.id])).rejects.toThrow();
      await expect(w.ds.query('UPDATE attendances SET checkout_at = checkin_at - INTERVAL 1 HOUR WHERE id = ?', [attendance.id])).rejects.toThrow();
      await expect(w.ds.query("UPDATE attendances SET timeliness = 'XYZ' WHERE id = ?", [attendance.id])).rejects.toThrow();
    });
  });
});
