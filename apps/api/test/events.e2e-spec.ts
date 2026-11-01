// Test su kien: them / sua / vong doi / pham vi don vi / validate - dac ta 3.1, 3.7, 5.2, 8.2, 8.3
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Event } from '../src/events/entities/event.entity';
import { EventQrToken } from '../src/events/entities/event-qr-token.entity';
import { as, createTestApp, login, makeUser, resetDb, Session, unitId } from './helpers';

const H = 3600_000;
const DAY = 24 * H;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
// su kien hop le o tuong lai 7 ngay; ghi de tung truong de thu truong hop xau
const body = (o: Record<string, unknown> = {}) => ({
  title: 'Chào tân sinh viên',
  hasDrl: true,
  drlPoints: 3,
  startAt: at(7 * DAY),
  endAt: at(7 * DAY + 2 * H),
  ...o,
});

describe('Su kien', () => {
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

  const create = async (s: Session, o: Record<string, unknown> = {}, status = 201) =>
    (await as(app, s).post('/api/admin/events').send(body(o)).expect(status)).body;
  const audit = async (action: string) =>
    (await as(app, admin).get(`/api/admin/audit-logs?action=${action}`).expect(200)).body;

  // ---------------- them ----------------

  describe('them su kien', () => {
    it('QTV truong: mac dinh cap truong, lay gio mo / an han tu cau hinh, nhat ky duoc ghi', async () => {
      const e = await create(admin);
      expect(e).toMatchObject({ status: 'DRAFT', graceMinutes: 15, controlLevel: 'NORMAL', requireCheckout: false, hasVerifyCode: false, checkinState: 'NOT_AVAILABLE' });
      expect(e.unit.code).toBe('DTN');
      // mo truoc 30 phut (default_open_before_min), dong luc ket thuc
      expect(new Date(e.startAt).getTime() - new Date(e.checkinOpenAt).getTime()).toBe(30 * 60_000);
      expect(e.checkinCloseAt).toBe(e.endAt);
      const logs = await audit('EVENT_CREATE');
      expect(logs.total).toBe(1);
      expect(logs.items[0].afterJson.title).toBe('Chào tân sinh viên');
    });

    it('[BM] response khong lo hash ma 4 so; token QR khong nam trong response / nhat ky', async () => {
      const e = await create(admin, { drlPoints: 6 });
      const json = JSON.stringify(e);
      expect(json).not.toMatch(/verifyCodeHash|verify_code_hash/);
      const tokens = await ds.getRepository(EventQrToken).find({ where: { eventId: e.id } });
      expect(tokens).toHaveLength(2);
      for (const t of tokens) expect(json).not.toContain(t.token);
      const logs = JSON.stringify((await audit('EVENT_CREATE')).items);
      for (const t of tokens) expect(logs).not.toContain(t.token);
      expect(logs).not.toContain(e.verifyCode);
    });

    it('[NV] 5.2: DRL >= 5 mac dinh muc Chat, bat diem danh ra, tra ma 4 so mot lan; DRL thap thi muc Thuong', async () => {
      const tight = await create(admin, { drlPoints: 5 });
      expect(tight).toMatchObject({ controlLevel: 'TIGHT', requireCheckout: true, hasVerifyCode: true });
      expect(tight.verifyCode).toMatch(/^\d{4}$/);
      const again = await as(app, admin).get(`/api/admin/events/${tight.id}`).expect(200);
      expect(again.body).not.toHaveProperty('verifyCode'); // xem lai khong thay ma
      expect(again.body.hasVerifyCode).toBe(true);
      const normal = await create(admin, { drlPoints: 4 });
      expect(normal).toMatchObject({ controlLevel: 'NORMAL', verifyCode: null });
      // nguoi tao van chon lai duoc
      const chosen = await create(admin, { drlPoints: 9, controlLevel: 'NORMAL' });
      expect(chosen.controlLevel).toBe('NORMAL');
    });

    it('quan ly khoa: mac dinh don vi cua minh', async () => {
      const e = await create(cntt);
      expect(e.unit.code).toBe('CNTT');
    });

    it('PHAM VI: quan ly khoa khong tao duoc su kien cho khoa khac hay cap truong (404)', async () => {
      await create(cntt, { unitId: await unitId(ds, 'KT') }, 404);
      await create(cntt, { unitId: await unitId(ds, 'DTN') }, 404);
      expect(await ds.getRepository(Event).count()).toBe(0);
    });

    it('TU CHOI: don vi khong ton tai (404) hoac da ngung hoat dong (400)', async () => {
      await create(admin, { unitId: '11111111-1111-4111-8111-111111111111' }, 404);
      const dp = await unitId(ds, 'DP');
      await as(app, admin).post(`/api/admin/units/${dp}/deactivate`).send({ reason: 'Khoa sap nhap' }).expect(200);
      const res = await create(admin, { unitId: dp }, 400);
      expect(res.code).toBe('UNIT_INACTIVE');
    });

    it('co toa do ma thieu ban kinh thi dung ban kinh mac dinh 100 m', async () => {
      const e = await create(admin, { latitude: 10.850, longitude: 106.771 });
      expect(e).toMatchObject({ latitude: 10.85, longitude: 106.771, radiusM: 100 });
    });

    it('gio co mui gio +07:00 duoc luu dung thoi diem UTC; ky tu dieu khien bi bo khoi ten', async () => {
      const e = await create(admin, {
        title: 'Hội\u0000 thảo\n  nghề\tnghiệp',
        description: 'Dòng 1\nDòng 2\u0007',
        startAt: '2026-12-05T08:00:00+07:00',
        endAt: '2026-12-05T11:00:00+07:00',
      });
      expect(e.startAt).toBe('2026-12-05T01:00:00.000Z');
      expect(e.title).toBe('Hội thảo nghề nghiệp');
      expect(e.description).toBe('Dòng 1\nDòng 2');
    });

    // moi dong: [mo ta, truong ghi de]
    const bad: Array<[string, Record<string, unknown>]> = [
      ['thieu hasDrl', { hasDrl: undefined }],
      ['DRL = 0', { drlPoints: 0 }],
      ['DRL = 11', { drlPoints: 11 }],
      ['DRL le', { drlPoints: 2.5 }],
      ['DRL la chuoi', { drlPoints: '5' }],
      ['co DRL ma khong nhap diem', { drlPoints: undefined }],
      ['khong cong DRL ma van nhap diem', { hasDrl: false, drlPoints: 5 }],
      ['gio ket thuc truoc gio bat dau', { startAt: at(7 * DAY), endAt: at(7 * DAY - H) }],
      ['gio ket thuc = gio bat dau', { startAt: '2027-01-01T08:00:00Z', endAt: '2027-01-01T08:00:00Z' }],
      ['dong diem danh truoc khi mo', { checkinOpenAt: at(7 * DAY), checkinCloseAt: at(7 * DAY - H) }],
      ['mo diem danh sau khi ket thuc', { checkinOpenAt: at(8 * DAY), checkinCloseAt: at(9 * DAY) }],
      ['gio khong co mui gio', { startAt: '2026-12-05T08:00:00' }],
      ['gio chi co ngay', { startAt: '2026-12-05' }],
      ['gio sai (thang 13)', { startAt: '2026-13-05T08:00:00Z' }],
      ['gio la so', { startAt: 1780000000000 }],
      ['ten qua ngan', { title: 'ab' }],
      ['ten qua dai', { title: 'a'.repeat(201) }],
      ['ten toan khoang trang', { title: '      ' }],
      ['mo ta qua dai', { description: 'x'.repeat(2001) }],
      ['vi do ngoai khoang', { latitude: 91, longitude: 106 }],
      ['kinh do ngoai khoang', { latitude: 10, longitude: 181 }],
      ['toa do qua 6 chu so thap phan', { latitude: 10.1234567, longitude: 106 }],
      ['thieu kinh do', { latitude: 10.85 }],
      ['chi co ban kinh', { radiusM: 100 }],
      ['ban kinh qua nho', { latitude: 10.85, longitude: 106.77, radiusM: 5 }],
      ['ban kinh qua lon', { latitude: 10.85, longitude: 106.77, radiusM: 5001 }],
      ['an han am', { graceMinutes: -1 }],
      ['an han qua lon', { graceMinutes: 121 }],
      ['muc kiem soat Nghiem ngat (chua co)', { controlLevel: 'STRICT' }],
      ['muc Chat nhung tat diem danh ra', { controlLevel: 'TIGHT', requireCheckout: false }],
      ['unitId khong phai uuid', { unitId: 'khoa-cntt' }],
      ['truong la (status)', { status: 'FINALIZED' }],
      ['truong la (createdBy)', { createdBy: 'ai-do' }],
      ['truong la (verifyCodeHash)', { verifyCodeHash: 'x' }],
    ];
    it.each(bad)('TU CHOI (400): %s', async (_name, override) => {
      const res = await create(admin, override, 400);
      expect(res.statusCode).toBe(400);
      expect(await ds.getRepository(Event).count()).toBe(0);
    });

    it('TU CHOI: khong dang nhap -> 401; sai token -> 401', async () => {
      await request(app.getHttpServer()).post('/api/admin/events').send(body()).expect(401);
      await request(app.getHttpServer()).get('/api/admin/events').set('Authorization', 'Bearer abc').expect(401);
    });

    it('TU CHOI: tai khoan bi buoc doi mat khau chua dung duoc API su kien (403)', async () => {
      await makeUser(ds, { email: 'moi@tdc.edu.vn', unit: 'CNTT', mustChange: true });
      const s = await login(app, 'moi@tdc.edu.vn');
      const res = await as(app, s).get('/api/admin/events').expect(403);
      expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('khi tao gap loi, khong de lai ban ghi mo coi', async () => {
      await create(admin, { endAt: at(DAY) , startAt: at(2 * DAY) }, 400);
      expect(await ds.getRepository(Event).count()).toBe(0);
      expect(await ds.getRepository(EventQrToken).count()).toBe(0);
    });
  });

  // ---------------- pham vi ----------------

  describe('pham vi don vi', () => {
    it('[BM] moi API doc / ghi / QR cua su kien khoa khac deu tra 404 (khong lo su ton tai)', async () => {
      const e = await create(cntt);
      const id = e.id;
      const reason = { reason: 'thu nghiem' };
      const calls: Array<[string, () => request.Test]> = [
        ['GET', () => as(app, kt).get(`/api/admin/events/${id}`)],
        ['PATCH', () => as(app, kt).patch(`/api/admin/events/${id}`).send({ title: 'Doi ten' })],
        ['duplicate', () => as(app, kt).post(`/api/admin/events/${id}/duplicate`).send({ startAt: at(DAY), endAt: at(2 * DAY) })],
        ['publish', () => as(app, kt).post(`/api/admin/events/${id}/publish`)],
        ['open', () => as(app, kt).post(`/api/admin/events/${id}/open`)],
        ['close', () => as(app, kt).post(`/api/admin/events/${id}/close`)],
        ['auto', () => as(app, kt).post(`/api/admin/events/${id}/auto`)],
        ['cancel', () => as(app, kt).post(`/api/admin/events/${id}/cancel`).send(reason)],
        ['archive', () => as(app, kt).post(`/api/admin/events/${id}/archive`).send(reason)],
        ['restore', () => as(app, kt).post(`/api/admin/events/${id}/restore`).send(reason)],
        ['DELETE', () => as(app, kt).del(`/api/admin/events/${id}`).send(reason)],
        ['qr', () => as(app, kt).get(`/api/admin/events/${id}/qr`)],
        ['qr.png', () => as(app, kt).get(`/api/admin/events/${id}/qr.png`)],
        ['qr.pdf', () => as(app, kt).get(`/api/admin/events/${id}/qr.pdf`)],
        ['qr/rotate', () => as(app, kt).post(`/api/admin/events/${id}/qr/rotate`).send({ purpose: 'CHECKIN', ...reason })],
        ['verify-code/rotate', () => as(app, kt).post(`/api/admin/events/${id}/verify-code/rotate`).send(reason)],
      ];
      for (const [name, call] of calls) {
        const res = await call();
        expect([name, res.status]).toEqual([name, 404]);
      }
      // du lieu khong bi anh huong
      const after = await ds.getRepository(Event).findOneByOrFail({ id });
      expect(after).toMatchObject({ title: 'Chào tân sinh viên', status: 'DRAFT', archivedAt: null });
      expect(await audit('EVENT_UPDATE')).toMatchObject({ total: 0 });
    });

    it('danh sach chi gom su kien trong pham vi; loc unitId ngoai pham vi khong lo gi', async () => {
      await create(cntt, { title: 'Su kien CNTT' });
      await create(kt, { title: 'Su kien KT' });
      await create(admin, { title: 'Su kien truong' });
      const mine = await as(app, cntt).get('/api/admin/events').expect(200);
      expect(mine.body.items.map((x: any) => x.title)).toEqual(['Su kien CNTT']);
      const peek = await as(app, cntt).get(`/api/admin/events?unitId=${await unitId(ds, 'KT')}`).expect(200);
      expect(peek.body).toMatchObject({ total: 0, items: [] });
      const all = await as(app, admin).get('/api/admin/events').expect(200);
      expect(all.body.total).toBe(3);
    });

    it('QTV truong thao tac duoc tren su kien cua khoa', async () => {
      const e = await create(cntt);
      await as(app, admin).patch(`/api/admin/events/${e.id}`).send({ title: 'Truong sua ho khoa' }).expect(200);
      await as(app, admin).post(`/api/admin/events/${e.id}/publish`).expect(200);
    });

    it('xoa don vi dang co su kien -> 409 (khoa ngoai); ngung hoat dong thi giu nguyen su kien', async () => {
      await create(cntt);
      const id = await unitId(ds, 'CNTT');
      await makeUser(ds, { email: 'tam@tdc.edu.vn', unit: 'DP' });
      await ds.query('DELETE FROM admin_users WHERE unit_id = ?', [id]); // bo tai khoan de chi con su kien chan xoa
      const res = await as(app, admin).del(`/api/admin/units/${id}`).send({ reason: 'xoa thu' }).expect(409);
      expect(res.body.code).toBe('UNIT_IN_USE');
      expect(await ds.getRepository(Event).count()).toBe(1);
    });
  });

  // ---------------- xem / loc ----------------

  describe('danh sach va loc', () => {
    it('sap xep moi nhat truoc, phan trang, tim theo ten (ky tu % khong thanh dai dien)', async () => {
      await create(admin, { title: 'A hoi thao', startAt: at(1 * DAY), endAt: at(1 * DAY + H) });
      await create(admin, { title: '100% tinh nguyen', startAt: at(3 * DAY), endAt: at(3 * DAY + H) });
      await create(admin, { title: 'C van nghe', startAt: at(2 * DAY), endAt: at(2 * DAY + H) });
      const list = await as(app, admin).get('/api/admin/events?limit=2&page=1').expect(200);
      expect(list.body.total).toBe(3);
      expect(list.body.items.map((x: any) => x.title)).toEqual(['100% tinh nguyen', 'C van nghe']);
      const q1 = await as(app, admin).get('/api/admin/events?q=100%25').expect(200);
      expect(q1.body.total).toBe(1);
      const q2 = await as(app, admin).get('/api/admin/events?q=%25').expect(200);
      expect(q2.body.total).toBe(1); // chi khop ten co ky tu %
      const range = await as(app, admin).get(`/api/admin/events?from=${at(2.5 * DAY)}`).expect(200);
      expect(range.body.total).toBe(1);
    });

    it('TU CHOI: tham so loc sai (view, status, limit, id)', async () => {
      await as(app, admin).get('/api/admin/events?view=all').expect(400);
      await as(app, admin).get('/api/admin/events?status=XYZ').expect(400);
      await as(app, admin).get('/api/admin/events?limit=101').expect(400);
      await as(app, admin).get('/api/admin/events?unitId=abc').expect(400);
      await as(app, admin).get('/api/admin/events/khong-phai-uuid').expect(400);
      await as(app, admin).get('/api/admin/events/11111111-1111-4111-8111-111111111111').expect(404);
    });
  });

  // ---------------- vong doi ----------------

  describe('vong doi', () => {
    it('Nhap -> Cong bo -> Mo -> Dong -> Mo lai -> Tro ve tu dong; sai trang thai bi tu choi (409)', async () => {
      const { id } = await create(admin);
      const post = (p: string, b?: object) => as(app, admin).post(`/api/admin/events/${id}/${p}`).send(b ?? {});
      // chua cong bo thi chua mo / dong duoc
      expect((await post('open').expect(409)).body.code).toBe('INVALID_STATE');
      await post('close').expect(409);
      await post('auto').expect(409);

      expect((await post('publish').expect(200)).body.status).toBe('PUBLISHED');
      await post('publish').expect(409);
      expect((await post('open').expect(200)).body).toMatchObject({ status: 'CHECKIN_OPEN', checkinState: 'OPEN' });
      await post('open').expect(409);
      expect((await post('close').expect(200)).body).toMatchObject({ status: 'CHECKIN_CLOSED', checkinState: 'CLOSED' });
      expect((await post('open').expect(200)).body.status).toBe('CHECKIN_OPEN');
      expect((await post('auto').expect(200)).body.status).toBe('PUBLISHED');
      for (const a of ['EVENT_PUBLISH', 'EVENT_OPEN', 'EVENT_CLOSE', 'EVENT_AUTO']) expect((await audit(a)).total).toBeGreaterThan(0);
    });

    it('[NV] 3.1: PUBLISHED tu dong theo khung gio; bam tay mo / dong luon duoc uu tien', async () => {
      const state = async (id: string) => (await as(app, admin).get(`/api/admin/events/${id}`).expect(200)).body.checkinState;
      const future = (await create(admin)).id;
      const nowEv = (await create(admin, { startAt: at(-10 * 60_000), endAt: at(H) })).id;
      const past = (await create(admin, { startAt: at(-3 * H), endAt: at(-2 * H) })).id;
      for (const id of [future, nowEv, past]) await as(app, admin).post(`/api/admin/events/${id}/publish`).expect(200);
      expect(await state(future)).toBe('NOT_YET');
      expect(await state(nowEv)).toBe('OPEN');
      expect(await state(past)).toBe('CLOSED');
      // bam tay dong su kien dang trong khung gio -> dong that; bam tay mo su kien chua den gio -> mo that
      await as(app, admin).post(`/api/admin/events/${nowEv}/close`).expect(200);
      await as(app, admin).post(`/api/admin/events/${future}/open`).expect(200);
      expect(await state(nowEv)).toBe('CLOSED');
      expect(await state(future)).toBe('OPEN');
      // tra ve tu dong thi theo gio lai
      await as(app, admin).post(`/api/admin/events/${nowEv}/auto`).expect(200);
      expect(await state(nowEv)).toBe('OPEN');
    });

    it('nhan ban chua cong bo van la nhap -> checkinState NOT_AVAILABLE', async () => {
      const { id } = await create(admin, { startAt: at(-10 * 60_000), endAt: at(H) });
      expect((await as(app, admin).get(`/api/admin/events/${id}`).expect(200)).body.checkinState).toBe('NOT_AVAILABLE');
    });

    it('huy: bat buoc ly do; vo hieu QR; khong sua / mo / cong bo / huy lai duoc', async () => {
      const { id } = await create(admin, { drlPoints: 7 });
      await as(app, admin).post(`/api/admin/events/${id}/publish`).expect(200);
      await as(app, admin).post(`/api/admin/events/${id}/cancel`).send({}).expect(400);
      await as(app, admin).post(`/api/admin/events/${id}/cancel`).send({ reason: 'ab' }).expect(400);
      const res = await as(app, admin).post(`/api/admin/events/${id}/cancel`).send({ reason: 'Trung lich thi' }).expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Trung lich thi', checkinState: 'NOT_AVAILABLE' });
      expect(await ds.getRepository(EventQrToken).count({ where: { eventId: id, isActive: true } })).toBe(0);
      expect((await as(app, admin).patch(`/api/admin/events/${id}`).send({ title: 'Sua sau huy' }).expect(409)).body.code).toBe('EVENT_CANCELLED');
      for (const p of ['publish', 'open', 'close', 'auto']) await as(app, admin).post(`/api/admin/events/${id}/${p}`).expect(409);
      await as(app, admin).post(`/api/admin/events/${id}/cancel`).send({ reason: 'Huy lan nua' }).expect(409);
      await as(app, admin).get(`/api/admin/events/${id}/qr.png`).expect(404);
      expect((await audit('EVENT_CANCEL')).items[0].reason).toBe('Trung lich thi');
    });

    it('luu tru / khoi phuc: bat buoc ly do, an khoi danh sach thuong, khong thao tac khi dang luu tru', async () => {
      const { id } = await create(admin);
      await as(app, admin).post(`/api/admin/events/${id}/archive`).send({}).expect(400);
      await as(app, admin).post(`/api/admin/events/${id}/restore`).send({ reason: 'khoi phuc' }).expect(409); // chua luu tru
      await as(app, admin).post(`/api/admin/events/${id}/archive`).send({ reason: 'Het hoc ky' }).expect(200);
      await as(app, admin).post(`/api/admin/events/${id}/archive`).send({ reason: 'Lan hai' }).expect(409);
      expect((await as(app, admin).get('/api/admin/events').expect(200)).body.total).toBe(0);
      expect((await as(app, admin).get('/api/admin/events?view=archived').expect(200)).body.total).toBe(1);
      expect((await as(app, admin).patch(`/api/admin/events/${id}`).send({ title: 'Sua khi luu tru' }).expect(409)).body.code).toBe('EVENT_ARCHIVED');
      await as(app, admin).post(`/api/admin/events/${id}/publish`).expect(409);
      await as(app, admin).post(`/api/admin/events/${id}/restore`).send({ reason: 'Can dung lai' }).expect(200);
      expect((await as(app, admin).get('/api/admin/events').expect(200)).body.total).toBe(1);
      await as(app, admin).post(`/api/admin/events/${id}/publish`).expect(200);
    });

    it('bo loc "Da huy" tach rieng voi "Dang hoat dong"', async () => {
      const a = await create(admin, { title: 'Con hoat dong' });
      const b = await create(admin, { title: 'Bi huy' });
      await as(app, admin).post(`/api/admin/events/${b.id}/cancel`).send({ reason: 'Khong du nguoi' }).expect(200);
      const active = await as(app, admin).get('/api/admin/events').expect(200);
      const cancelled = await as(app, admin).get('/api/admin/events?view=cancelled').expect(200);
      expect(active.body.items.map((x: any) => x.id)).toEqual([a.id]);
      expect(cancelled.body.items.map((x: any) => x.id)).toEqual([b.id]);
    });

    it('xoa cung: bat buoc ly do, xoa luon token QR, ghi nhat ky; khong xoa duoc su kien da chot', async () => {
      const { id } = await create(admin, { drlPoints: 8 });
      await as(app, admin).del(`/api/admin/events/${id}`).send({}).expect(400);
      await as(app, admin).del(`/api/admin/events/${id}`).expect(400);
      // gia lap da chot (giai doan 4 se co API chot)
      await ds.getRepository(Event).update({ id }, { status: 'FINALIZED' });
      expect((await as(app, admin).del(`/api/admin/events/${id}`).send({ reason: 'xoa thu' }).expect(409)).body.code).toBe('EVENT_FINALIZED');
      await ds.getRepository(Event).update({ id }, { status: 'DRAFT' });
      await as(app, admin).del(`/api/admin/events/${id}`).send({ reason: 'Tao nham' }).expect(204);
      await as(app, admin).get(`/api/admin/events/${id}`).expect(404);
      expect(await ds.getRepository(EventQrToken).count({ where: { eventId: id } })).toBe(0);
      expect((await audit('EVENT_DELETE')).items[0]).toMatchObject({ entityId: id, reason: 'Tao nham' });
    });

    it('thao tac cung luc: hai lan "mo" chi mot lan thanh cong, "mo" va "huy" khong de lai trang thai lech', async () => {
      const { id } = await create(admin, { drlPoints: 6 });
      await as(app, admin).post(`/api/admin/events/${id}/publish`).expect(200);
      const open = () => as(app, admin).post(`/api/admin/events/${id}/open`);
      const codes = (await Promise.all([open(), open(), open()])).map((r) => r.status).sort();
      expect(codes).toEqual([200, 409, 409]);
      await Promise.all([
        as(app, admin).post(`/api/admin/events/${id}/cancel`).send({ reason: 'Huy khi dang mo' }),
        as(app, admin).post(`/api/admin/events/${id}/close`),
      ]);
      const e = await ds.getRepository(Event).findOneByOrFail({ id });
      const active = await ds.getRepository(EventQrToken).count({ where: { eventId: id, isActive: true } });
      // neu da huy thi khong con QR nao hoat dong; neu chi dong thi QR van con
      expect(e.status === 'CANCELLED' ? active === 0 : active > 0).toBe(true);
    });
  });

  // ---------------- sua ----------------

  describe('sua su kien', () => {
    it('Nhap / Cong bo (chua mo): sua tu do khong can ly do; ghi truoc - sau', async () => {
      const { id } = await create(admin);
      const res = await as(app, admin)
        .patch(`/api/admin/events/${id}`)
        .send({ title: 'Ten moi', locationName: 'Hội trường A', drlPoints: 4, startAt: at(8 * DAY), endAt: at(8 * DAY + H), checkinOpenAt: at(8 * DAY - H), checkinCloseAt: at(8 * DAY + H) })
        .expect(200);
      expect(res.body).toMatchObject({ title: 'Ten moi', locationName: 'Hội trường A', drlPoints: 4 });
      const log = (await audit('EVENT_UPDATE')).items[0];
      expect(log.beforeJson.title).toBe('Chào tân sinh viên');
      expect(log.afterJson.title).toBe('Ten moi');
    });

    it('[NV] 3.7: da mo diem danh -> sua gio / toa do / ban kinh / DRL bat buoc co ly do; sua ten / mo ta thi khong', async () => {
      const { id } = await create(admin);
      await as(app, admin).post(`/api/admin/events/${id}/publish`).expect(200);
      await as(app, admin).post(`/api/admin/events/${id}/open`).expect(200);
      const patch = (b: object) => as(app, admin).patch(`/api/admin/events/${id}`).send(b);
      await patch({ title: 'Doi ten khi dang mo', description: 'Mo ta moi', locationName: 'Phòng B' }).expect(200);
      const sensitive: object[] = [
        { endAt: at(7 * DAY + 3 * H) }, { drlPoints: 9 }, { hasDrl: false },
        { latitude: 10.8, longitude: 106.7 }, { graceMinutes: 30 }, { checkinCloseAt: at(7 * DAY + 4 * H) },
      ];
      for (const s of sensitive) {
        const res = await patch(s).expect(400);
        expect([JSON.stringify(s), res.body.code]).toEqual([JSON.stringify(s), 'REASON_REQUIRED']);
      }
      const ok = await patch({ drlPoints: 9, reason: 'Ban to chuc nang diem' }).expect(200);
      expect(ok.body.drlPoints).toBe(9);
      expect((await audit('EVENT_UPDATE')).items[0].reason).toBe('Ban to chuc nang diem');
      // gui lai dung gia tri cu thi khong coi la thay doi
      await patch({ drlPoints: 9 }).expect(200);
    });

    it('da den gio mo (PUBLISHED, khung gio da bat dau) cung tinh la da mo diem danh', async () => {
      const { id } = await create(admin, { startAt: at(-10 * 60_000), endAt: at(H) });
      await as(app, admin).post(`/api/admin/events/${id}/publish`).expect(200);
      await as(app, admin).patch(`/api/admin/events/${id}`).send({ drlPoints: 5 }).expect(400);
      await as(app, admin).patch(`/api/admin/events/${id}`).send({ drlPoints: 5, reason: 'Dieu chinh diem' }).expect(200);
    });

    // moi dong: [mo ta, ban sua]
    const badPatch: Array<[string, Record<string, unknown>]> = [
      ['ten null', { title: null }],
      ['gio bat dau null', { startAt: null }],
      ['hasDrl null', { hasDrl: null }],
      ['DRL ngoai khoang', { drlPoints: 12 }],
      ['bat DRL nhung khong co diem', { hasDrl: true, drlPoints: null }],
      ['tat DRL nhung gui diem', { hasDrl: false, drlPoints: 5 }],
      ['gio ket thuc truoc bat dau', { endAt: at(DAY) }],
      ['dong diem danh truoc khi mo', { checkinCloseAt: at(DAY) }],
      ['toa do thieu mot nua', { longitude: null }],
      ['muc Chat nhung tat diem danh ra', { controlLevel: 'TIGHT', requireCheckout: false }],
      ['doi don vi (khong cho)', { unitId: '11111111-1111-4111-8111-111111111111' }],
      ['doi trang thai (khong cho)', { status: 'PUBLISHED' }],
      ['ly do qua ngan', { reason: 'a' }],
    ];
    it.each(badPatch)('TU CHOI (400): %s', async (_n, patchBody) => {
      const { id } = await create(admin, { latitude: 10.85, longitude: 106.77, radiusM: 80 });
      await as(app, admin).patch(`/api/admin/events/${id}`).send(patchBody).expect(400);
      const e = await ds.getRepository(Event).findOneByOrFail({ id });
      expect(e).toMatchObject({ title: 'Chào tân sinh viên', status: 'DRAFT', drlPoints: 3, hasDrl: true, radiusM: 80 });
    });

    it('xoa toa do thi xoa luon ban kinh; tat DRL thi bo diem', async () => {
      const { id } = await create(admin, { latitude: 10.85, longitude: 106.77, radiusM: 80 });
      const res = await as(app, admin).patch(`/api/admin/events/${id}`).send({ latitude: null, longitude: null, hasDrl: false }).expect(200);
      expect(res.body).toMatchObject({ latitude: null, longitude: null, radiusM: null, hasDrl: false, drlPoints: null });
    });

    it('doi sang muc Chat: sinh ma 4 so + QR ra; roi khoi muc Chat: bo ma 4 so', async () => {
      const { id } = await create(admin, { drlPoints: 2 });
      const tokens = () => ds.getRepository(EventQrToken).find({ where: { eventId: id, isActive: true } });
      expect(await tokens()).toHaveLength(1);
      const up = await as(app, admin).patch(`/api/admin/events/${id}`).send({ controlLevel: 'TIGHT' }).expect(200);
      expect(up.body).toMatchObject({ controlLevel: 'TIGHT', requireCheckout: true, hasVerifyCode: true });
      expect(up.body.verifyCode).toMatch(/^\d{4}$/);
      expect((await tokens()).map((t) => t.purpose).sort()).toEqual(['CHECKIN', 'CHECKOUT']);
      const down = await as(app, admin).patch(`/api/admin/events/${id}`).send({ controlLevel: 'NORMAL', requireCheckout: false }).expect(200);
      expect(down.body).toMatchObject({ controlLevel: 'NORMAL', requireCheckout: false, hasVerifyCode: false, verifyCode: null });
      expect((await tokens()).map((t) => t.purpose)).toEqual(['CHECKIN']);
    });

    it('sua khong doi gi thi khong ghi nhat ky', async () => {
      const { id } = await create(admin);
      await as(app, admin).patch(`/api/admin/events/${id}`).send({ title: 'Chào tân sinh viên', drlPoints: 3 }).expect(200);
      expect((await audit('EVENT_UPDATE')).total).toBe(0);
    });

    it('khong sua duoc su kien da chot (409)', async () => {
      const { id } = await create(admin);
      await ds.getRepository(Event).update({ id }, { status: 'FINALIZED' });
      expect((await as(app, admin).patch(`/api/admin/events/${id}`).send({ title: 'Sua sau chot' }).expect(409)).body.code).toBe('EVENT_FINALIZED');
    });
  });

  // ---------------- nhan ban ----------------

  describe('nhan ban', () => {
    it('chep thong tin, giu khoang cach mo / dong diem danh, sinh QR + ma moi, trang thai Nhap', async () => {
      const src = await create(admin, {
        drlPoints: 6, locationName: 'Hội trường A', latitude: 10.85, longitude: 106.77, radiusM: 60,
        startAt: '2026-12-01T08:00:00Z', endAt: '2026-12-01T11:00:00Z',
        checkinOpenAt: '2026-12-01T07:00:00Z', checkinCloseAt: '2026-12-01T11:10:00Z',
      });
      await as(app, admin).post(`/api/admin/events/${src.id}/publish`).expect(200);
      const res = await as(app, admin)
        .post(`/api/admin/events/${src.id}/duplicate`)
        .send({ startAt: '2027-01-10T13:00:00Z', endAt: '2027-01-10T16:00:00Z' })
        .expect(201);
      expect(res.body).toMatchObject({
        title: 'Chào tân sinh viên (bản sao)', status: 'DRAFT', drlPoints: 6, controlLevel: 'TIGHT', locationName: 'Hội trường A',
        radiusM: 60, checkinOpenAt: '2027-01-10T12:00:00.000Z', checkinCloseAt: '2027-01-10T16:10:00.000Z', hasVerifyCode: true,
      });
      expect(res.body.id).not.toBe(src.id);
      expect(res.body.verifyCode).toMatch(/^\d{4}$/);
      const a = await ds.getRepository(EventQrToken).find({ where: { eventId: src.id } });
      const b = await ds.getRepository(EventQrToken).find({ where: { eventId: res.body.id } });
      expect(b).toHaveLength(2);
      expect(b.map((t) => t.token).some((t) => a.map((x) => x.token).includes(t))).toBe(false);
      expect((await audit('EVENT_DUPLICATE')).items[0].beforeJson).toEqual({ sourceEventId: src.id });
    });

    it('TU CHOI: gio sai, thieu gio, truong la; nhan ban su kien cua khoa khac -> 404', async () => {
      const src = await create(cntt);
      const dup = (s: Session, b: object) => as(app, s).post(`/api/admin/events/${src.id}/duplicate`).send(b);
      await dup(cntt, { startAt: at(2 * DAY), endAt: at(DAY) }).expect(400);
      await dup(cntt, { startAt: at(DAY) }).expect(400);
      await dup(cntt, {}).expect(400);
      await dup(cntt, { startAt: at(DAY), endAt: at(2 * DAY), drlPoints: 10 }).expect(400);
      await dup(kt, { startAt: at(DAY), endAt: at(2 * DAY) }).expect(404);
      expect(await ds.getRepository(Event).count()).toBe(1);
    });

    it('TU CHOI: don vi cua su kien goc da ngung hoat dong -> 400', async () => {
      const src = await create(admin, { unitId: await unitId(ds, 'DP') });
      await as(app, admin).post(`/api/admin/units/${await unitId(ds, 'DP')}/deactivate`).send({ reason: 'Sap nhap' }).expect(200);
      const res = await as(app, admin).post(`/api/admin/events/${src.id}/duplicate`).send({ startAt: at(DAY), endAt: at(2 * DAY) }).expect(400);
      expect(res.body.code).toBe('UNIT_INACTIVE');
    });
  });
});
