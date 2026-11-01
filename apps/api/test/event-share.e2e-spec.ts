// Test Doan truong cho cac khoa xem su kien cap truong (tat ca / chon khoa, chi doc) - dac ta 2.2
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Event } from '../src/events/entities/event.entity';
import { EventFacultyView } from '../src/events/entities/event-faculty-view.entity';
import { as, createTestApp, login, makeUser, resetDb, Session, unitId } from './helpers';

const H = 3600_000;
const DAY = 24 * H;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
const body = (o: Record<string, unknown> = {}) => ({
  title: 'Su kien cap truong', hasDrl: true, drlPoints: 6, startAt: at(7 * DAY), endAt: at(7 * DAY + 2 * H), ...o,
});

describe('Chia se su kien cap truong cho cac khoa xem', () => {
  let app: INestApplication;
  let ds: DataSource;
  let admin: Session;
  let cntt: Session;
  let kt: Session;
  let schoolEvent: string;
  let CNTT: string;
  let KT: string;
  let DTN: string;

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
    [CNTT, KT, DTN] = [await unitId(ds, 'CNTT'), await unitId(ds, 'KT'), await unitId(ds, 'DTN')];
    schoolEvent = (await as(app, admin).post('/api/admin/events').send(body()).expect(201)).body.id;
  });

  const REASON = 'Cac khoa can nam lich';
  const share = (s: Session, id: string, mode: string, unitIds?: string[], reason: string | undefined = REASON) =>
    as(app, s).post(`/api/admin/events/${id}/faculty-view`).send({ mode, ...(unitIds ? { unitIds } : {}), ...(reason ? { reason } : {}) });
  const audit = async (a: string) => (await as(app, admin).get(`/api/admin/audit-logs?action=${a}`).expect(200)).body;
  const rows = (id = schoolEvent) => ds.getRepository(EventFacultyView).find({ where: { eventId: id } });
  const mode = async (id = schoolEvent) => (await ds.getRepository(Event).findOneByOrFail({ id })).facultyViewMode;
  const listIds = async (s: Session) => (await as(app, s).get('/api/admin/events').expect(200)).body.items.map((x: any) => x.id);

  // 16 thao tac sua / vong doi / QR / cap quyen: nguoi chi-xem phai bi chan het
  const mutations = (s: Session, id: string): Array<[string, () => request.Test]> => {
    const reason = { reason: 'thu nghiem' };
    return [
      ['PATCH', () => as(app, s).patch(`/api/admin/events/${id}`).send({ title: 'Khoa sua' })],
      ['duplicate', () => as(app, s).post(`/api/admin/events/${id}/duplicate`).send({ startAt: at(DAY), endAt: at(2 * DAY) })],
      ['publish', () => as(app, s).post(`/api/admin/events/${id}/publish`)],
      ['open', () => as(app, s).post(`/api/admin/events/${id}/open`)],
      ['close', () => as(app, s).post(`/api/admin/events/${id}/close`)],
      ['auto', () => as(app, s).post(`/api/admin/events/${id}/auto`)],
      ['cancel', () => as(app, s).post(`/api/admin/events/${id}/cancel`).send(reason)],
      ['archive', () => as(app, s).post(`/api/admin/events/${id}/archive`).send(reason)],
      ['restore', () => as(app, s).post(`/api/admin/events/${id}/restore`).send(reason)],
      ['DELETE', () => as(app, s).del(`/api/admin/events/${id}`).send(reason)],
      ['qr', () => as(app, s).get(`/api/admin/events/${id}/qr`)],
      ['qr.png', () => as(app, s).get(`/api/admin/events/${id}/qr.png`)],
      ['qr.pdf', () => as(app, s).get(`/api/admin/events/${id}/qr.pdf`)],
      ['qr/rotate', () => as(app, s).post(`/api/admin/events/${id}/qr/rotate`).send({ purpose: 'CHECKIN', ...reason })],
      ['verify-code/rotate', () => as(app, s).post(`/api/admin/events/${id}/verify-code/rotate`).send(reason)],
      ['faculty-view', () => share(s, id, 'NONE')],
    ];
  };
  const expectAll = async (calls: Array<[string, () => request.Test]>, status: number) => {
    for (const [name, call] of calls) expect([name, (await call()).status]).toEqual([name, status]);
  };

  describe('che do TAT CA khoa', () => {
    it('mac dinh khong chia se: khoa khong thay (danh sach, chi tiet)', async () => {
      expect(await listIds(cntt)).toEqual([]);
      await as(app, cntt).get(`/api/admin/events/${schoolEvent}`).expect(404);
      expect((await as(app, admin).get(`/api/admin/events/${schoolEvent}`).expect(200)).body).toMatchObject({
        facultyViewMode: 'NONE', facultyViewUnitIds: [], canManage: true,
      });
    });

    it('cho phep tat ca: moi khoa thay o che do chi doc (canManage = false); co nhat ky truoc / sau', async () => {
      const res = await share(admin, schoolEvent, 'ALL').expect(200);
      expect(res.body).toMatchObject({ facultyViewMode: 'ALL', canManage: true });
      for (const s of [cntt, kt]) {
        const list = (await as(app, s).get('/api/admin/events').expect(200)).body;
        expect(list.items.map((x: any) => [x.id, x.canManage])).toEqual([[schoolEvent, false]]);
        expect((await as(app, s).get(`/api/admin/events/${schoolEvent}`).expect(200)).body).toMatchObject({ canManage: false, facultyViewMode: 'ALL' });
      }
      const log = (await audit('EVENT_FACULTY_VIEW')).items[0];
      expect(log).toMatchObject({ entityId: schoolEvent, reason: REASON });
      expect(log.beforeJson).toEqual({ facultyViewMode: 'NONE', facultyViewUnitIds: [] });
      expect(log.afterJson).toEqual({ facultyViewMode: 'ALL', facultyViewUnitIds: [] });
    });

    it('[BM] CHI DUOC XEM: 16 thao tac sua / vong doi / QR / cap quyen deu bi 403, du lieu khong doi', async () => {
      await share(admin, schoolEvent, 'ALL').expect(200);
      await expectAll(mutations(cntt, schoolEvent), 403);
      expect(await ds.getRepository(Event).findOneByOrFail({ id: schoolEvent })).toMatchObject({
        title: 'Su kien cap truong', status: 'DRAFT', archivedAt: null, facultyViewMode: 'ALL',
      });
      expect((await audit('EVENT_UPDATE')).total).toBe(0);
    });

    it('[BM] khoa chi xem: phan hoi khong chua token QR, ma 4 so, hay danh sach khoa duoc chon', async () => {
      await share(admin, schoolEvent, 'ALL').expect(200);
      const tokens = await ds.query('SELECT token FROM event_qr_tokens WHERE event_id = ?', [schoolEvent]);
      const json = JSON.stringify((await as(app, cntt).get(`/api/admin/events/${schoolEvent}`).expect(200)).body)
        + JSON.stringify((await as(app, cntt).get('/api/admin/events').expect(200)).body);
      for (const t of tokens) expect(json).not.toContain(t.token);
      expect(json).not.toMatch(/verifyCode"|verifyCodeHash/);
    });
  });

  describe('che do CHON KHOA', () => {
    it('chi khoa duoc chon thay; khoa khong duoc chon nhan 404 o moi thao tac', async () => {
      const res = await share(admin, schoolEvent, 'SELECTED', [CNTT]).expect(200);
      expect(res.body).toMatchObject({ facultyViewMode: 'SELECTED', facultyViewUnitIds: [CNTT] });
      expect(await listIds(cntt)).toEqual([schoolEvent]);
      expect((await as(app, cntt).get(`/api/admin/events/${schoolEvent}`).expect(200)).body.canManage).toBe(false);
      // khoa KT khong duoc chon: khong thay, va moi thao tac deu 404 (khong lo su ton tai)
      expect(await listIds(kt)).toEqual([]);
      await as(app, kt).get(`/api/admin/events/${schoolEvent}`).expect(404);
      await expectAll(mutations(kt, schoolEvent).filter(([n]) => n !== 'faculty-view'), 404);
      // cap quyen la viec rieng cua Doan truong: vai tro bi chan truoc, voi MOI id (ke ca id khong ton tai) nen khong lo gi
      await as(app, kt).post(`/api/admin/events/${schoolEvent}/faculty-view`).send({ mode: 'ALL', reason: 'Tu cap quyen' }).expect(403);
      await as(app, kt).post('/api/admin/events/11111111-1111-4111-8111-111111111111/faculty-view').send({ mode: 'ALL', reason: 'Tu cap quyen' }).expect(403);
      expect(await mode()).toBe('SELECTED');
    });

    it('khoa duoc chon van chi XEM: moi thao tac sua / QR bi 403', async () => {
      await share(admin, schoolEvent, 'SELECTED', [CNTT]).expect(200);
      await expectAll(mutations(cntt, schoolEvent), 403);
      expect(await mode()).toBe('SELECTED');
      expect((await rows()).map((r) => r.unitId)).toEqual([CNTT]);
    });

    it('[BM] nguoi chi-xem khong thay khoa khac duoc chon; don vi to chuc thay danh sach day du', async () => {
      await share(admin, schoolEvent, 'SELECTED', [KT, CNTT]).expect(200);
      expect((await as(app, cntt).get(`/api/admin/events/${schoolEvent}`).expect(200)).body.facultyViewUnitIds).toBeNull();
      const list = (await as(app, cntt).get('/api/admin/events').expect(200)).body.items[0];
      expect(list.facultyViewUnitIds).toBeNull();
      expect(JSON.stringify(list)).not.toContain(KT);
      expect((await as(app, admin).get(`/api/admin/events/${schoolEvent}`).expect(200)).body.facultyViewUnitIds.sort()).toEqual([CNTT, KT].sort());
    });

    it('doi danh sach khoa, doi che do: dong chia se luon khop voi che do', async () => {
      await share(admin, schoolEvent, 'SELECTED', [CNTT]).expect(200);
      await share(admin, schoolEvent, 'SELECTED', [KT]).expect(200);
      expect(await listIds(cntt)).toEqual([]);
      expect(await listIds(kt)).toEqual([schoolEvent]);
      await share(admin, schoolEvent, 'SELECTED', [CNTT, KT]).expect(200);
      expect((await rows()).map((r) => r.unitId).sort()).toEqual([CNTT, KT].sort());
      await share(admin, schoolEvent, 'ALL').expect(200);
      expect(await rows()).toHaveLength(0); // chuyen sang tat ca thi bo danh sach cu
      expect(await listIds(cntt)).toEqual([schoolEvent]);
      await share(admin, schoolEvent, 'SELECTED', [KT]).expect(200);
      expect(await listIds(cntt)).toEqual([]); // khong "nho" lai khoa cu
      await share(admin, schoolEvent, 'NONE').expect(200);
      expect(await rows()).toHaveLength(0);
      expect(await listIds(kt)).toEqual([]);
      await as(app, kt).get(`/api/admin/events/${schoolEvent}`).expect(404);
    });

    it('khoa cap duoi (lop) duoc chon thi quan ly khoa cha thay duoc; khoa khac van khong', async () => {
      const child = '55555555-5555-4555-8555-555555555555';
      await ds.query("INSERT INTO units (id, name, code, type, parent_id) VALUES (?, 'Lop 24CNTT1', 'L24CNTT1', 'FACULTY', ?)", [child, CNTT]);
      await share(admin, schoolEvent, 'SELECTED', [child]).expect(200);
      expect(await listIds(cntt)).toEqual([schoolEvent]);
      expect(await listIds(kt)).toEqual([]);
    });

    it('lap lai dung cai da dat (ke ca doi thu tu khoa) khong ghi them nhat ky', async () => {
      await share(admin, schoolEvent, 'SELECTED', [CNTT, KT]).expect(200);
      await share(admin, schoolEvent, 'SELECTED', [KT, CNTT]).expect(200);
      await share(admin, schoolEvent, 'ALL').expect(200);
      await share(admin, schoolEvent, 'ALL').expect(200);
      expect((await audit('EVENT_FACULTY_VIEW')).total).toBe(2);
    });

    it('thao tac cung luc: du ket qua nao thang, dong chia se van khop che do', async () => {
      const calls = [
        share(admin, schoolEvent, 'SELECTED', [CNTT]),
        share(admin, schoolEvent, 'SELECTED', [KT]),
        share(admin, schoolEvent, 'ALL'),
        share(admin, schoolEvent, 'NONE'),
        share(admin, schoolEvent, 'SELECTED', [CNTT, KT]),
      ];
      expect((await Promise.all(calls)).map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      const m = await mode();
      const n = (await rows()).length;
      expect(m === 'SELECTED' ? n > 0 : n === 0).toBe(true);
    });
  });

  describe('TU CHOI', () => {
    it('du lieu xau: thieu / sai che do, danh sach khoa sai, truong cu, ly do', async () => {
      const bad: Array<[string, object]> = [
        ['thieu mode', { reason: REASON }],
        ['mode la', { mode: 'EVERYONE', reason: REASON }],
        ['truong cu enabled', { enabled: true, reason: REASON }],
        ['SELECTED khong co unitIds', { mode: 'SELECTED', reason: REASON }],
        ['SELECTED unitIds rong', { mode: 'SELECTED', unitIds: [], reason: REASON }],
        ['ALL kem unitIds', { mode: 'ALL', unitIds: [CNTT], reason: REASON }],
        ['NONE kem unitIds', { mode: 'NONE', unitIds: [CNTT], reason: REASON }],
        ['unitIds trung', { mode: 'SELECTED', unitIds: [CNTT, CNTT], reason: REASON }],
        ['unitIds khong phai uuid', { mode: 'SELECTED', unitIds: ['cntt'], reason: REASON }],
        ['unitIds la chuoi', { mode: 'SELECTED', unitIds: CNTT, reason: REASON }],
        ['chon Doan truong (khong phai khoa)', { mode: 'SELECTED', unitIds: [DTN], reason: REASON }],
        ['khoa khong ton tai', { mode: 'SELECTED', unitIds: ['11111111-1111-4111-8111-111111111111'], reason: REASON }],
        ['khoa that + khoa khong ton tai', { mode: 'SELECTED', unitIds: [CNTT, '11111111-1111-4111-8111-111111111111'], reason: REASON }],
        ['qua 50 khoa', { mode: 'SELECTED', unitIds: Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), reason: REASON }],
        ['thieu ly do', { mode: 'ALL' }],
        ['ly do qua ngan', { mode: 'ALL', reason: 'a' }],
        ['truong la', { mode: 'ALL', reason: REASON, unitId: CNTT }],
      ];
      for (const [name, b] of bad) {
        const res = await as(app, admin).post(`/api/admin/events/${schoolEvent}/faculty-view`).send(b);
        expect([name, res.status]).toEqual([name, 400]);
      }
      expect(await mode()).toBe('NONE');
      expect(await rows()).toHaveLength(0);
      expect((await audit('EVENT_FACULTY_VIEW')).total).toBe(0);
    });

    it('id sai (400), khong ton tai (404), chua dang nhap (401)', async () => {
      await share(admin, 'khong-phai-uuid', 'ALL').expect(400);
      await share(admin, '11111111-1111-4111-8111-111111111111', 'ALL').expect(404);
      await request(app.getHttpServer()).post(`/api/admin/events/${schoolEvent}/faculty-view`).send({ mode: 'ALL', reason: REASON }).expect(401);
    });

    it('quan ly khoa khong tu cap quyen xem, ke ca cho su kien cua chinh khoa (403)', async () => {
      const own = (await as(app, cntt).post('/api/admin/events').send(body({ title: 'Cua khoa' })).expect(201)).body.id;
      await share(cntt, own, 'ALL').expect(403);
      await share(cntt, schoolEvent, 'SELECTED', [CNTT]).expect(403);
      expect(await mode()).toBe('NONE');
      expect(await mode(own)).toBe('NONE');
    });

    it('chi su kien cap truong moi chia se duoc: su kien cua khoa -> 400 (ALL / SELECTED); tat (NONE) thi khong sao', async () => {
      const own = (await as(app, cntt).post('/api/admin/events').send(body({ title: 'Cua CNTT' })).expect(201)).body.id;
      expect((await share(admin, own, 'ALL').expect(400)).body.code).toBe('NOT_SCHOOL_EVENT');
      expect((await share(admin, own, 'SELECTED', [KT]).expect(400)).body.code).toBe('NOT_SCHOOL_EVENT');
      await share(admin, own, 'NONE').expect(200);
      expect(await rows(own)).toHaveLength(0);
      await as(app, kt).get(`/api/admin/events/${own}`).expect(404);
    });

    it('[BM] co / dong chia se bi ghi nham vao su kien cua khoa (ghi thang DB): khoa khac van thay 404, khong 403', async () => {
      const own = (await as(app, cntt).post('/api/admin/events').send(body({ title: 'Cua CNTT' })).expect(201)).body.id;
      await ds.getRepository(Event).update({ id: own }, { facultyViewMode: 'ALL' });
      await as(app, kt).get(`/api/admin/events/${own}`).expect(404);
      await ds.getRepository(Event).update({ id: own }, { facultyViewMode: 'SELECTED' });
      await ds.getRepository(EventFacultyView).insert({ eventId: own, unitId: KT, createdBy: 'x' });
      await as(app, kt).get(`/api/admin/events/${own}`).expect(404);
      await as(app, kt).patch(`/api/admin/events/${own}`).send({ title: 'Tan cong' }).expect(404);
      expect(await listIds(kt)).toEqual([]);
    });
  });

  describe('danh sach, vong doi, rang buoc DB', () => {
    it('danh sach gop su kien cua khoa + duoc chia se; phan trang, tim kiem, loc dung; khong ro ri khoa khac', async () => {
      await as(app, cntt).post('/api/admin/events').send(body({ title: 'Cua CNTT', startAt: at(DAY), endAt: at(DAY + H) })).expect(201);
      await as(app, kt).post('/api/admin/events').send(body({ title: 'Cua KT' })).expect(201);
      const other = (await as(app, admin).post('/api/admin/events').send(body({ title: 'Chi cho KT', startAt: at(9 * DAY), endAt: at(9 * DAY + H) })).expect(201)).body.id;
      await share(admin, schoolEvent, 'SELECTED', [CNTT, KT]).expect(200);
      await share(admin, other, 'SELECTED', [KT]).expect(200);

      const list = (await as(app, cntt).get('/api/admin/events').expect(200)).body;
      expect(list.items.map((x: any) => [x.title, x.canManage])).toEqual([['Su kien cap truong', false], ['Cua CNTT', true]]);
      expect(list.total).toBe(2); // khong thay "Chi cho KT" va "Cua KT"
      expect((await as(app, cntt).get('/api/admin/events?limit=1&page=2').expect(200)).body.items).toHaveLength(1);
      expect((await as(app, cntt).get('/api/admin/events?q=cap%20truong').expect(200)).body.total).toBe(1);
      expect((await as(app, cntt).get(`/api/admin/events?unitId=${KT}`).expect(200)).body.total).toBe(0);
      expect((await as(app, cntt).get(`/api/admin/events?unitId=${DTN}`).expect(200)).body.total).toBe(1);
      expect((await as(app, kt).get('/api/admin/events').expect(200)).body.total).toBe(3);
    });

    it('su kien da huy / luu tru chi hien o bo loc tuong ung', async () => {
      await share(admin, schoolEvent, 'SELECTED', [CNTT]).expect(200);
      await as(app, admin).post(`/api/admin/events/${schoolEvent}/cancel`).send({ reason: 'Huy su kien' }).expect(200);
      expect(await listIds(cntt)).toEqual([]);
      expect((await as(app, cntt).get('/api/admin/events?view=cancelled').expect(200)).body.total).toBe(1);
    });

    it('nhan ban su kien da chia se: ban sao KHONG ke thua che do hay danh sach khoa', async () => {
      await share(admin, schoolEvent, 'SELECTED', [CNTT]).expect(200);
      const dup = await as(app, admin).post(`/api/admin/events/${schoolEvent}/duplicate`).send({ startAt: at(10 * DAY), endAt: at(10 * DAY + H) }).expect(201);
      expect(dup.body).toMatchObject({ facultyViewMode: 'NONE', facultyViewUnitIds: [] });
      expect(await rows(dup.body.id)).toHaveLength(0);
      await as(app, cntt).get(`/api/admin/events/${dup.body.id}`).expect(404);
    });

    it('xoa su kien thi xoa luon dong chia se; khoa dang duoc chon thi khong xoa cung duoc (409)', async () => {
      await ds.query('DELETE FROM admin_users WHERE unit_id = ?', [KT]); // chi con dong chia se chan xoa khoa
      await share(admin, schoolEvent, 'SELECTED', [KT]).expect(200);
      const res = await as(app, admin).del(`/api/admin/units/${KT}`).send({ reason: 'xoa thu' }).expect(409);
      expect(res.body.code).toBe('UNIT_IN_USE');
      await as(app, admin).del(`/api/admin/events/${schoolEvent}`).send({ reason: 'Tao nham' }).expect(204);
      expect(await ds.getRepository(EventFacultyView).count()).toBe(0);
      await as(app, admin).del(`/api/admin/units/${KT}`).send({ reason: 'Khoa sap nhap' }).expect(204);
    });

    it('DB: khong cho trung (su kien, khoa) va khong cho khoa khong ton tai', async () => {
      const repo = ds.getRepository(EventFacultyView);
      await repo.insert({ eventId: schoolEvent, unitId: CNTT, createdBy: 'x' });
      await expect(repo.insert({ eventId: schoolEvent, unitId: CNTT, createdBy: 'x' })).rejects.toThrow();
      await expect(repo.insert({ eventId: schoolEvent, unitId: '44444444-4444-4444-8444-444444444444', createdBy: 'x' })).rejects.toThrow();
      await expect(repo.insert({ eventId: '44444444-4444-4444-8444-444444444444', unitId: KT, createdBy: 'x' })).rejects.toThrow();
    });
  });

  describe('migration chuyen co cu sang che do moi', () => {
    // dua DB ve migration 3 (cot faculty_view_enabled), chen du lieu cu bang SQL tho, roi chay lai migration 4.
    // Cac migration ra sau migration 4 (diem danh, khieu nai, hoat dong, ...) phai lui qua truoc (chua co du lieu).
    // Lui cho den khi migration moi nhat la event-faculty-view-mode, roi lui them chinh no - khong dem cung de
    // migration ve sau khong lam hong test nay.
    const latest = async (): Promise<string> => (await ds.query('SELECT name FROM migrations ORDER BY id DESC LIMIT 1'))[0].name;
    const undoTwo = async () => {
      for (let i = 0; i < 20 && !(await latest()).startsWith('EventFacultyViewMode'); i++) await ds.undoLastMigration();
      await ds.undoLastMigration(); // event-faculty-view-mode
    };
    const insertOld = (id: string, enabled: number) =>
      ds.query(
        `INSERT INTO events (id, unit_id, title, start_at, end_at, checkin_open_at, checkin_close_at, has_drl, drl_points, created_by, faculty_view_enabled)
         VALUES (?, ?, 'Cu', '2026-12-01 08:00:00', '2026-12-01 10:00:00', '2026-12-01 07:30:00', '2026-12-01 10:00:00', 1, 3, 'x', ?)`,
        [id, DTN, enabled],
      );

    it('co cu bat -> ALL (giu nguyen quyen xem), co cu tat -> NONE; ha cap: ALL -> bat, SELECTED -> tat', async () => {
      await ds.query('DELETE FROM events');
      await undoTwo();
      await insertOld('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1);
      await insertOld('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 0);
      await ds.runMigrations();
      const modes = async () =>
        Object.fromEntries((await ds.query('SELECT id, faculty_view_mode m FROM events')).map((r: any) => [r.id.slice(-1), r.m]));
      expect(await modes()).toEqual({ 1: 'ALL', 2: 'NONE' });

      await ds.query("UPDATE events SET faculty_view_mode = 'SELECTED' WHERE id LIKE '%a2'");
      await undoTwo();
      const flags = Object.fromEntries((await ds.query('SELECT id, faculty_view_enabled f FROM events')).map((r: any) => [r.id.slice(-1), Number(r.f)]));
      expect(flags).toEqual({ 1: 1, 2: 0 }); // SELECTED khong duoc tu mo rong thanh "cho tat ca"
      await ds.runMigrations();
    });
  });
});
