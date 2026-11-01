// Test module Quan ly hoat dong - dac ta quan-ly-hoat-dong 2, 3, 4. Trong tam: quy trinh, pham vi don vi, truong hop bi tu choi.
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { as, createTestApp, makeUser, login, Session, unitId } from './helpers';
import { checkinAs, openEvent, setupWorld, World } from './public-helpers';

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('Quan ly hoat dong', () => {
  let app: INestApplication;
  let ds: DataSource;
  let w: World;
  let admin: Session;
  let cntt: Session;
  let kt: Session;
  let yearId: string;
  let catId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    w = await setupWorld(app);
    ds = w.ds;
    admin = w.admin;
    cntt = w.cntt;
    await makeUser(ds, { email: 'kt@tdc.edu.vn', unit: 'KT' });
    kt = await login(app, 'kt@tdc.edu.vn');
    // nam hoc dang chay: tu 90 ngay truoc den 270 ngay sau
    yearId = (await as(app, admin).post('/api/admin/academic-years')
      .send({ name: '2026–2027', startDate: ymd(Date.now() - 90 * DAY), endDate: ymd(Date.now() + 270 * DAY) }).expect(201)).body.id;
    catId = (await as(app, admin).get('/api/admin/activity-categories').expect(200)).body[0].id;
  });

  const body = (o: Record<string, unknown> = {}) => ({
    academicYearId: yearId, name: 'Hội thảo Kỹ năng phỏng vấn', startAt: at(5 * DAY), endAt: at(5 * DAY + 3_600_000), ...o,
  });
  const create = async (s: Session, o: Record<string, unknown> = {}, status = 201) =>
    (await as(app, s).post('/api/admin/activities').send(body(o)).expect(status)).body;
  // ho so da co link ke hoach, san sang de nop
  const ready = (o: Record<string, unknown> = {}) => create(cntt, { planUrl: 'https://docs.google.com/document/d/abc', ...o });
  const act = (s: Session, id: string, action: string, b: object = {}, status = 200) =>
    as(app, s).post(`/api/admin/activities/${id}/${action}`).send(b).expect(status);
  // dua ho so toi trang thai can test qua dung quy trinh
  async function advance(id: string, to: 'PENDING_PLAN' | 'IN_PROGRESS' | 'PENDING_EVAL' | 'EVALUATED' | 'LOCKED') {
    const steps = ['PENDING_PLAN', 'IN_PROGRESS', 'PENDING_EVAL', 'EVALUATED', 'LOCKED'];
    const cur = (await as(app, admin).get(`/api/admin/activities/${id}`).expect(200)).body.status as string;
    const from = steps.indexOf(cur) + 1; // DRAFT -> -1 + 1 = 0
    for (const s of steps.slice(from, steps.indexOf(to) + 1)) {
      if (s === 'PENDING_PLAN') await act(cntt, id, 'submit');
      if (s === 'IN_PROGRESS') await act(admin, id, 'approve');
      if (s === 'PENDING_EVAL') {
        await as(app, cntt).patch(`/api/admin/activities/${id}`).send({ links: [{ group: 'RESULT', url: 'https://docs.google.com/document/d/ketqua' }] }).expect(200);
        await act(cntt, id, 'submit-result');
      }
      if (s === 'EVALUATED') await act(admin, id, 'evaluate', { result: 'COMPLETED' });
      if (s === 'LOCKED') await act(admin, id, 'reward', { result: 'APPROVED' });
    }
  }

  // ---------------- nam hoc ----------------
  describe('nam hoc', () => {
    it('chi Doan truong tao / sua / khoa; moi nguoi dang nhap xem duoc danh sach', async () => {
      await as(app, cntt).post('/api/admin/academic-years').send({ name: 'x2027', startDate: '2030-08-01', endDate: '2031-07-31' }).expect(403);
      await as(app, cntt).patch(`/api/admin/academic-years/${yearId}`).send({ name: 'Doi ten' }).expect(403);
      await as(app, cntt).post(`/api/admin/academic-years/${yearId}/lock`).send({ reason: 'khoa thu' }).expect(403);
      const list = await as(app, cntt).get('/api/admin/academic-years').expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ name: '2026–2027', locked: false });
    });

    it('TU CHOI: khoang ngay sai, ngay khong ton tai, han ngoai nam hoc, trung ten, chong lan', async () => {
      const post = (b: object) => as(app, admin).post('/api/admin/academic-years').send(b);
      await post({ name: '2031–2032', startDate: '2031-08-01', endDate: '2031-07-01' }).expect(400);
      await post({ name: '2031–2032', startDate: '2031-02-30', endDate: '2032-07-31' }).expect(400);
      await post({ name: '2031–2032', startDate: '2031-08-01', endDate: '2032-07-31', planDeadline: '2033-01-01' }).expect(400);
      await post({ name: '2031–2032', startDate: 'khong-phai-ngay', endDate: '2032-07-31' }).expect(400);
      await post({ name: '2026–2027', startDate: '2040-08-01', endDate: '2041-07-31' }).expect(409); // trung ten
      const overlap = await post({ name: '2027–2028', startDate: ymd(Date.now()), endDate: ymd(Date.now() + 400 * DAY) }).expect(409);
      expect(overlap.body.code).toBe('YEAR_OVERLAP');
    });

    it('khoa so: chan tao / sua ho so, mo lai can ly do va ghi nhat ky', async () => {
      const a = await ready();
      await act(admin, 'x', 'noop', {}, 404).catch(() => {});
      await as(app, admin).post(`/api/admin/academic-years/${yearId}/lock`).send({}).expect(400); // thieu ly do
      await as(app, admin).post(`/api/admin/academic-years/${yearId}/lock`).send({ reason: 'Tong ket nam hoc' }).expect(200);
      const blocked = await as(app, cntt).post('/api/admin/activities').send(body()).expect(409);
      expect(blocked.body.code).toBe('YEAR_LOCKED');
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ name: 'Doi ten hoat dong' }).expect(409);
      await act(cntt, a.id, 'submit', {}, 409);
      expect((await as(app, cntt).get(`/api/admin/activities/${a.id}`).expect(200)).body).toMatchObject({ canEdit: false, canSubmit: false, canReview: false });
      await as(app, admin).post(`/api/admin/academic-years/${yearId}/unlock`).send({ reason: 'Bo sung ho so tre' }).expect(200);
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ name: 'Doi ten hoat dong' }).expect(200);
      const logs = (await as(app, admin).get('/api/admin/audit-logs?action=YEAR_LOCK').expect(200)).body;
      expect(logs.items[0].reason).toBe('Tong ket nam hoc');
    });
  });

  // ---------------- linh vuc ----------------
  describe('linh vuc', () => {
    it('nap san 8 linh vuc; khoa chi thay linh vuc dang dung; Doan truong them / tat', async () => {
      const all = (await as(app, admin).get('/api/admin/activity-categories').expect(200)).body;
      expect(all).toHaveLength(8);
      expect(all.map((c: { name: string }) => c.name)).toContain('Tình nguyện');
      await as(app, cntt).post('/api/admin/activity-categories').send({ name: 'Moi' }).expect(403);
      await as(app, admin).post('/api/admin/activity-categories').send({ name: 'Tình nguyện' }).expect(409);
      const added = (await as(app, admin).post('/api/admin/activity-categories').send({ name: 'Khởi nghiệp' }).expect(201)).body;
      await as(app, admin).patch(`/api/admin/activity-categories/${added.id}`).send({ isActive: false }).expect(200);
      const forFaculty = (await as(app, cntt).get('/api/admin/activity-categories').expect(200)).body;
      expect(forFaculty.map((c: { name: string }) => c.name)).not.toContain('Khởi nghiệp');
      // linh vuc da tat khong gan duoc cho hoat dong moi
      expect((await create(cntt, { categoryId: added.id }, 400)).code).toBe('CATEGORY_INVALID');
    });
  });

  // ---------------- tao ----------------
  describe('tao ho so', () => {
    it('ma [nam]-[STT] tang dan, nam lay theo ngay bat dau, mac dinh don vi cua nguoi tao', async () => {
      const a = await create(cntt);
      const b = await create(cntt);
      const y = new Date(Date.now() + 5 * DAY + 7 * 3600_000).getUTCFullYear();
      expect(a.code).toBe(`${y}-001`);
      expect(b.code).toBe(`${y}-002`);
      expect(a).toMatchObject({ status: 'DRAFT', level: 'FACULTY', unit: { code: 'CNTT' }, canEdit: true, canSubmit: true, canReview: false });
      const adminOne = await create(admin, { unitId: await unitId(ds, 'KT') });
      expect(adminOne.code).toBe(`${y}-003`); // danh so chung toan truong
    });

    it('so thu tu khong trung khi tao dong thoi', async () => {
      const made = await Promise.all(Array.from({ length: 8 }, () => create(cntt)));
      const codes = made.map((m) => m.code);
      expect(new Set(codes).size).toBe(8);
      expect(codes.map((c) => Number(c.split('-')[1])).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('PHAM VI: quan ly khoa khong tao cho khoa khac; Doan truong tao ho ban nao cung duoc', async () => {
      await create(cntt, { unitId: await unitId(ds, 'KT') }, 404);
      const r = await create(admin, { unitId: await unitId(ds, 'KT') });
      expect(r.unit.code).toBe('KT');
    });

    it('TU CHOI: ten ngan, gio dao nguoc, ngoai nam hoc, nam hoc la, truong la, so am', async () => {
      await create(cntt, { name: 'ab' }, 400);
      await create(cntt, { startAt: at(5 * DAY), endAt: at(4 * DAY) }, 400);
      expect((await create(cntt, { startAt: at(400 * DAY), endAt: at(400 * DAY + 3_600_000) }, 400)).code).toBe('OUT_OF_YEAR');
      await create(cntt, { academicYearId: '3f0c1b6e-8a4d-4c9e-9b1a-2d7e5f6a7b8c' }, 400);
      await create(cntt, { code: '2026-999' }, 400); // khong cho tu dat ma
      await create(cntt, { status: 'LOCKED' }, 400);
      await create(cntt, { expectedCount: -1 }, 400);
      await create(cntt, { startAt: '2026-11-05 08:00' }, 400); // thieu mui gio
    });

    it('LINK: chi https, toi da 5 / nhom, khong trung, khong khoang trang; ten mien la bi danh dau', async () => {
      const link = (url: string, group = 'MEDIA') => ({ group, url });
      for (const bad of ['http://facebook.com/x', 'javascript:alert(1)', 'ftp://x.vn/a', 'https://user:pw@x.vn/a', 'https://x.vn/a b', 'khong-phai-link', '//x.vn/a']) {
        expect((await create(cntt, { links: [link(bad)] }, 400)).code).toBe('INVALID_URL');
      }
      const six = Array.from({ length: 6 }, (_, i) => link(`https://facebook.com/p/${i}`));
      expect((await create(cntt, { links: six }, 400)).code).toBe('TOO_MANY_LINKS');
      expect((await create(cntt, { links: [link('https://facebook.com/p/1'), link('https://facebook.com/p/1')] }, 400)).code).toBe('DUPLICATE_LINK');
      expect((await create(cntt, { planUrl: 'http://docs.google.com/x' }, 400)).code).toBe('INVALID_URL');
      expect((await create(cntt, { links: [{ group: 'KHAC', url: 'https://x.vn' }] }, 400)).code).toBe('VALIDATION_ERROR');

      // 5 link o moi nhom la du; cung URL o hai nhom khac nhau van la trung (cung hoat dong)
      const ok = await create(cntt, { links: [...Array.from({ length: 5 }, (_, i) => link(`https://facebook.com/p/${i}`)), ...Array.from({ length: 5 }, (_, i) => link(`https://tdc.edu.vn/tin/${i}`, 'PUBLICATION'))] });
      expect(ok.counts).toMatchObject({ media: 5, publication: 5, result: 0 });
      const odd = (await create(cntt, { links: [link('https://blog-la.example.org/a')] }));
      const detail = (await as(app, cntt).get(`/api/admin/activities/${odd.id}`).expect(200)).body;
      expect(detail.links[0]).toMatchObject({ needsReview: true });
      const known = await create(cntt, { links: [link('https://m.facebook.com/p/9')] });
      expect((await as(app, cntt).get(`/api/admin/activities/${known.id}`).expect(200)).body.links[0].needsReview).toBe(false);
    });

    it('don vi phoi hop: thay duoc ho so (chi doc); khong chon duoc don vi la / chinh don vi to chuc', async () => {
      const a = await create(cntt, { coUnitIds: [await unitId(ds, 'KT')] });
      expect(a.coUnits.map((u: { name: string }) => u.name)).toEqual(['Khoa Kinh tế']);
      const seen = (await as(app, kt).get(`/api/admin/activities/${a.id}`).expect(200)).body;
      expect(seen).toMatchObject({ canEdit: false, canSubmit: false });
      expect((await as(app, kt).get('/api/admin/activities').expect(200)).body.total).toBe(1);
      const r = await as(app, kt).patch(`/api/admin/activities/${a.id}`).send({ name: 'Sua trom' }).expect(403);
      expect(r.body.code).toBe('READ_ONLY_ACTIVITY');
      await act(kt, a.id, 'submit', {}, 403);
      await as(app, kt).post(`/api/admin/activities/${a.id}/comments`).send({ content: 'xin chao' }).expect(403);
      await create(cntt, { coUnitIds: ['3f0c1b6e-8a4d-4c9e-9b1a-2d7e5f6a7b8c'] }, 400);
      expect((await create(cntt, { coUnitIds: [await unitId(ds, 'CNTT')] })).coUnits).toEqual([]); // trung don vi to chuc: bo qua
    });
  });

  // ---------------- doc + pham vi ----------------
  describe('xem va tim kiem', () => {
    it('PHAM VI: khoa khong thay / sua / xoa / nop ho so khoa khac (404); Doan truong thay tat ca', async () => {
      const mine = await create(cntt);
      const theirs = await create(kt);
      const id = theirs.id;
      expect((await as(app, cntt).get('/api/admin/activities').expect(200)).body.items.map((i: { id: string }) => i.id)).toEqual([mine.id]);
      await as(app, cntt).get(`/api/admin/activities/${id}`).expect(404);
      await as(app, cntt).get(`/api/admin/activities/${id}/timeline`).expect(404);
      await as(app, cntt).get(`/api/admin/activities/${id}/comments`).expect(404);
      await as(app, cntt).patch(`/api/admin/activities/${id}`).send({ name: 'Sua trom' }).expect(404);
      await as(app, cntt).del(`/api/admin/activities/${id}`).send({ reason: 'xoa trom' }).expect(404);
      await act(cntt, id, 'submit', {}, 404);
      await as(app, cntt).post(`/api/admin/activities/${id}/events`).send({ eventId: '3f0c1b6e-8a4d-4c9e-9b1a-2d7e5f6a7b8c' }).expect(404);
      expect((await as(app, admin).get('/api/admin/activities').expect(200)).body.total).toBe(2);
    });

    it('tim theo ma / ten (khong phan biet dau), loc nam hoc / don vi / trang thai / linh vuc, thieu truyen thong, phan trang', async () => {
      const a = await create(cntt, { name: 'Hội thảo Kỹ năng mềm', categoryId: catId, links: [{ group: 'MEDIA', url: 'https://facebook.com/p/1' }] });
      await create(cntt, { name: 'Giải bóng đá sinh viên' });
      await create(kt, { name: 'Hiến máu nhân đạo' });
      const get = async (qs: string) => (await as(app, admin).get(`/api/admin/activities${qs}`).expect(200)).body;
      expect((await get('?q=hoi thao')).items.map((i: { id: string }) => i.id)).toEqual([a.id]);
      expect((await get(`?q=${a.code}`)).total).toBe(1);
      expect((await get('?q=BONG DA')).total).toBe(1);
      expect((await get(`?unitId=${await unitId(ds, 'KT')}`)).total).toBe(1);
      expect((await get(`?categoryId=${catId}`)).total).toBe(1);
      expect((await get('?status=DRAFT')).total).toBe(3);
      expect((await get('?status=LOCKED')).total).toBe(0);
      expect((await get('?missingMedia=true')).total).toBe(2);
      expect((await get('?evaluation=NONE')).total).toBe(3);
      expect((await get(`?academicYearId=${yearId}&limit=2&page=2`))).toMatchObject({ page: 2, limit: 2, total: 3 });
      // LIKE: ky tu % khong phai ky tu thay the
      expect((await get('?q=%25')).total).toBe(0);
      await as(app, admin).get('/api/admin/activities?limit=1000').expect(400);
      await as(app, admin).get('/api/admin/activities?status=KHAC').expect(400);
    });
  });

  // ---------------- sua + lich su ----------------
  describe('sua ho so', () => {
    it('ghi phien ban voi cac truong da doi; khong doi gi thi khong tao phien ban; link duoc thay the', async () => {
      const a = await ready({ links: [{ group: 'MEDIA', url: 'https://facebook.com/p/1' }] });
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ name: 'Hội thảo việc làm', links: [{ group: 'MEDIA', url: 'https://facebook.com/p/2' }, { group: 'PUBLICATION', url: 'https://tdc.edu.vn/tin/1' }] }).expect(200);
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ name: 'Hội thảo việc làm' }).expect(200); // khong doi
      const v = (await as(app, cntt).get(`/api/admin/activities/${a.id}/versions`).expect(200)).body.items;
      expect(v.map((x: { version: number; action: string }) => `${x.version}:${x.action}`)).toEqual(['1:CREATE', '2:UPDATE']);
      expect(Object.keys(v[1].diff).sort()).toEqual(['links', 'name']);
      expect(v[1].diff.name).toEqual({ from: 'Hội thảo Kỹ năng phỏng vấn', to: 'Hội thảo việc làm' });
      const d = (await as(app, cntt).get(`/api/admin/activities/${a.id}`).expect(200)).body;
      expect(d.counts).toMatchObject({ media: 1, publication: 1 });
      expect(d.links.map((l: { url: string }) => l.url)).toContain('https://facebook.com/p/2');
      const tl = (await as(app, cntt).get(`/api/admin/activities/${a.id}/timeline`).expect(200)).body.items;
      expect(tl.map((i: { kind: string }) => i.kind)).toEqual(['VERSION']);
      expect(tl[0].actor).toContain('cntt');
    });

    it('xoa gia tri tuy chon bang null / chuoi rong; kinh phi luu dung', async () => {
      const a = await ready({ location: 'Hội trường A', ownerName: 'Lan', budgetPlanned: 5_000_000 });
      const d = (await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ location: '', ownerName: null, budgetActual: 4_500_000 }).expect(200)).body;
      expect(d).toMatchObject({ location: null, ownerName: null, budgetPlanned: 5_000_000, budgetActual: 4_500_000 });
    });

    it('theo trang thai: khoa sua duoc Nhap va Dang trien khai; Cho duyet / Da chot thi khong, Doan truong sua duoc Cho duyet', async () => {
      const a = await ready();
      await advance(a.id, 'PENDING_PLAN');
      expect((await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ note: 'x ghi chu' }).expect(409)).body.code).toBe('NOT_EDITABLE');
      await as(app, admin).patch(`/api/admin/activities/${a.id}`).send({ note: 'admin sua' }).expect(200);
      await advance(a.id, 'IN_PROGRESS');
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ manualCount: 80 }).expect(200);
      await advance(a.id, 'LOCKED');
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ note: 'sau khi chot' }).expect(409);
      await as(app, admin).patch(`/api/admin/activities/${a.id}`).send({ note: 'sau khi chot' }).expect(409);
    });

    it('TU CHOI: khong doi duoc don vi / ma / trang thai qua PATCH', async () => {
      const a = await ready();
      for (const f of [{ unitId: await unitId(ds, 'KT') }, { code: '2030-001' }, { status: 'LOCKED' }, { evaluation: 'COMPLETED' }, { reward: 'APPROVED' }, { createdBy: 'x' }]) {
        await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send(f).expect(400);
      }
    });
  });

  // ---------------- xoa ----------------
  describe('xoa', () => {
    it('chi xoa duoc ban Nhap, bat buoc ly do, ghi nhat ky', async () => {
      const a = await ready();
      await as(app, cntt).del(`/api/admin/activities/${a.id}`).send({}).expect(400);
      await advance(a.id, 'PENDING_PLAN');
      expect((await as(app, cntt).del(`/api/admin/activities/${a.id}`).send({ reason: 'tao nham' }).expect(409)).body.code).toBe('NOT_DELETABLE');
      const b = await ready();
      await as(app, cntt).del(`/api/admin/activities/${b.id}`).send({ reason: 'tao nham hoat dong' }).expect(204);
      await as(app, cntt).get(`/api/admin/activities/${b.id}`).expect(404);
      expect((await as(app, admin).get('/api/admin/audit-logs?action=ACTIVITY_DELETE').expect(200)).body.total).toBe(1);
    });
  });

  // ---------------- quy trinh ----------------
  describe('quy trinh duyet', () => {
    it('di tron ven: nop -> duyet -> nop ket qua -> danh gia -> khen thuong -> mo lai; moi buoc co lich su + nhat ky', async () => {
      const a = await ready();
      expect((await act(cntt, a.id, 'submit')).body).toMatchObject({ status: 'PENDING_PLAN', canEdit: false });
      expect((await act(admin, a.id, 'approve')).body.status).toBe('IN_PROGRESS');
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ links: [{ group: 'RESULT', url: 'https://docs.google.com/document/d/kq' }] }).expect(200);
      expect((await act(cntt, a.id, 'submit-result')).body.status).toBe('PENDING_EVAL');
      const ev = (await act(admin, a.id, 'evaluate', { result: 'COMPLETED', note: 'Tốt' })).body;
      expect(ev).toMatchObject({ status: 'EVALUATED', evaluation: 'COMPLETED', evaluationNote: 'Tốt' });
      const rw = (await act(admin, a.id, 'reward', { result: 'APPROVED' })).body;
      expect(rw).toMatchObject({ status: 'LOCKED', reward: 'APPROVED', canEdit: false });
      await act(admin, a.id, 'reopen', {}, 400); // thieu ly do
      const re = (await act(admin, a.id, 'reopen', { reason: 'Nhap nham diem thuong' })).body;
      expect(re).toMatchObject({ status: 'EVALUATED', reward: null, lockedAt: null, evaluation: 'COMPLETED' });
      const tl = (await as(app, admin).get(`/api/admin/activities/${a.id}/timeline`).expect(200)).body.items;
      expect(tl.filter((i: { kind: string }) => i.kind === 'VERSION')).toHaveLength(1); // chi lan sua tay (them link ket qua), khong lap lai buoc quy trinh
      expect(tl.filter((i: { kind: string }) => i.kind === 'WORKFLOW').map((i: { action: string }) => i.action)).toEqual(['SUBMIT', 'APPROVE', 'SUBMIT_RESULT', 'EVALUATE', 'REWARD', 'REOPEN']);
      for (const code of ['ACTIVITY_SUBMIT', 'ACTIVITY_APPROVE', 'ACTIVITY_EVALUATE', 'ACTIVITY_REWARD', 'ACTIVITY_REOPEN']) {
        expect((await as(app, admin).get(`/api/admin/audit-logs?action=${code}`).expect(200)).body.total).toBe(1);
      }
    });

    it('PHAN QUYEN: khoa khong duyet / tra lai / danh gia / khen thuong / mo lai / duyet hang loat', async () => {
      const a = await ready();
      await advance(a.id, 'PENDING_PLAN');
      for (const [action, b] of [['approve', {}], ['return', { note: 'thieu thong tin' }], ['evaluate', { result: 'COMPLETED' }], ['reward', { result: 'APPROVED' }], ['reopen', { reason: 'mo lai' }]] as const) {
        await act(cntt, a.id, action, b, 403);
      }
      await as(app, cntt).post('/api/admin/activities/bulk/approve').send({ ids: [a.id] }).expect(403);
      await as(app, cntt).post('/api/admin/activities/bulk/evaluate').send({ ids: [a.id], result: 'COMPLETED' }).expect(403);
      // khoa khac khong nop ho so cua khoa nay
      await act(kt, a.id, 'submit', {}, 404);
    });

    it('TU CHOI: nop khi chua co link ke hoach; nop ket qua khi chua co bao cao; sai trang thai', async () => {
      const noPlan = await create(cntt);
      expect((await act(cntt, noPlan.id, 'submit', {}, 400)).body.code).toBe('PLAN_URL_REQUIRED');
      const a = await ready();
      expect((await act(cntt, a.id, 'submit-result', {}, 409)).body.code).toBe('INVALID_STATE'); // con Nhap
      expect((await act(admin, a.id, 'approve', {}, 409)).body.code).toBe('INVALID_STATE'); // chua nop
      await act(admin, a.id, 'evaluate', { result: 'COMPLETED' }, 409);
      await act(admin, a.id, 'reward', { result: 'APPROVED' }, 409);
      await act(admin, a.id, 'reopen', { reason: 'chua chot' }, 409);
      await advance(a.id, 'IN_PROGRESS');
      expect((await act(cntt, a.id, 'submit-result', {}, 400)).body.code).toBe('RESULT_REQUIRED');
      await act(cntt, a.id, 'submit', {}, 409); // nop ke hoach lan nua
      await act(admin, a.id, 'approve', {}, 409); // duyet lan nua
    });

    it('tra lai bo sung: bat buoc noi dung; ve Nhap (ke hoach) hoac Dang trien khai (ket qua); nop lai thi xoa ghi chu', async () => {
      const a = await ready();
      await advance(a.id, 'PENDING_PLAN');
      await act(admin, a.id, 'return', {}, 400);
      await act(admin, a.id, 'return', { note: 'ab' }, 400);
      const r1 = (await act(admin, a.id, 'return', { note: 'Bổ sung kinh phí dự kiến' })).body;
      expect(r1).toMatchObject({ status: 'DRAFT', returnNote: 'Bổ sung kinh phí dự kiến', canEdit: true });
      expect((await act(cntt, a.id, 'submit')).body).toMatchObject({ status: 'PENDING_PLAN', returnNote: null });
      await advance(a.id, 'PENDING_EVAL');
      const r2 = (await act(admin, a.id, 'return', { note: 'Báo cáo thiếu ảnh' })).body;
      expect(r2).toMatchObject({ status: 'IN_PROGRESS', returnNote: 'Báo cáo thiếu ảnh' });
    });

    it('danh gia: Chua hoan thanh bat buoc nhan xet; khen thuong chi khi Hoan thanh, tu choi khen thuong bat buoc ly do', async () => {
      const a = await ready();
      await advance(a.id, 'PENDING_EVAL');
      expect((await act(admin, a.id, 'evaluate', { result: 'NOT_COMPLETED' }, 400)).body.code).toBe('NOTE_REQUIRED');
      await act(admin, a.id, 'evaluate', { result: 'KHAC' }, 400);
      await act(admin, a.id, 'evaluate', { result: 'NOT_COMPLETED', note: 'Thiếu báo cáo chi tiết' });
      expect((await act(admin, a.id, 'reward', { result: 'APPROVED' }, 409)).body.code).toBe('REWARD_NEEDS_COMPLETED');
      expect((await act(admin, a.id, 'reward', { result: 'REJECTED' }, 400)).body.code).toBe('NOTE_REQUIRED');
      const done = (await act(admin, a.id, 'reward', { result: 'REJECTED', note: 'Chưa hoàn thành' })).body;
      expect(done).toMatchObject({ status: 'LOCKED', reward: 'REJECTED', evaluation: 'NOT_COMPLETED' });
    });

    it('hang loat: ho so loi khong lam hong ho so con lai', async () => {
      const a = await ready();
      const b = await ready();
      const c = await ready(); // van la Nhap -> khong duyet duoc
      await advance(a.id, 'PENDING_PLAN');
      await advance(b.id, 'PENDING_PLAN');
      const r = (await as(app, admin).post('/api/admin/activities/bulk/approve').send({ ids: [a.id, b.id, c.id, '3f0c1b6e-8a4d-4c9e-9b1a-2d7e5f6a7b8c'] }).expect(200)).body;
      expect(r.done.sort()).toEqual([a.id, b.id].sort());
      expect(r.failed.map((f: { id: string }) => f.id)).toEqual(expect.arrayContaining([c.id]));
      expect(r.failed).toHaveLength(2);
      expect((await as(app, admin).get(`/api/admin/activities/${a.id}`).expect(200)).body.status).toBe('IN_PROGRESS');
      await as(app, admin).post('/api/admin/activities/bulk/approve').send({ ids: Array.from({ length: 101 }, (_, i) => `3f0c1b6e-8a4d-4c9e-9b1a-${String(i).padStart(12, '0')}`) }).expect(400);
      // danh gia hang loat
      await advance(a.id, 'PENDING_EVAL');
      const e = (await as(app, admin).post('/api/admin/activities/bulk/evaluate').send({ ids: [a.id], result: 'COMPLETED' }).expect(200)).body;
      expect(e.done).toEqual([a.id]);
    });

    it('checklist: tu cham muc do duoc, chi GOI Y; thieu bao cao / truyen thong thi goi y Chua hoan thanh', async () => {
      const a = await ready({ expectedCount: 10, manualCount: 8 });
      await advance(a.id, 'IN_PROGRESS');
      let cl = (await as(app, admin).get(`/api/admin/activities/${a.id}/checklist`).expect(200)).body;
      expect(cl.criteria.find((c: { key: string }) => c.key === 'MEDIA').passed).toBe(false);
      expect(cl.suggestion).toBe('NOT_COMPLETED');
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ links: [{ group: 'MEDIA', url: 'https://facebook.com/p/1' }, { group: 'RESULT', url: 'https://docs.google.com/document/d/kq' }] }).expect(200);
      cl = (await as(app, admin).get(`/api/admin/activities/${a.id}/checklist`).expect(200)).body;
      expect(cl.criteria.filter((c: { auto: boolean }) => c.auto).map((c: { passed: boolean | null }) => c.passed)).toEqual([true, true, true, true]);
      expect(cl.criteria.filter((c: { auto: boolean }) => !c.auto).every((c: { passed: boolean | null }) => c.passed === null)).toBe(true);
      expect(cl.suggestion).toBe('COMPLETED');
      await as(app, cntt).patch(`/api/admin/activities/${a.id}`).send({ manualCount: 3 }).expect(200); // 3 / 10 < 70%
      cl = (await as(app, admin).get(`/api/admin/activities/${a.id}/checklist`).expect(200)).body;
      expect(cl.suggestion).toBe('NOT_COMPLETED');
    });
  });

  // ---------------- gan buoi diem danh ----------------
  describe('gan buoi diem danh', () => {
    it('so nguoi tham gia thuc te lay tu diem danh (khong tinh luot da huy), nhap tay chi dung khi chua gan buoi nao', async () => {
      const a = await ready({ manualCount: 5 });
      const ev = await openEvent(w);
      expect(a.actualSource).toBe('MANUAL');
      const linked = (await as(app, admin).post(`/api/admin/activities/${a.id}/events`).send({ eventId: ev.id }).expect(200)).body;
      expect(linked).toMatchObject({ actualCount: 0, actualSource: 'ATTENDANCE' });
      expect(linked.events).toHaveLength(1);
      const s1 = await checkinAs(w, ev.token);
      await checkinAs(w, ev.token);
      let d = (await as(app, cntt).get(`/api/admin/activities/${a.id}`).expect(200)).body;
      expect(d).toMatchObject({ actualCount: 2, actualSource: 'ATTENDANCE', manualCount: 5 });
      await ds.query('UPDATE attendances SET voided_at = NOW(3), void_reason = ? WHERE id = ?', ['nham', s1.attendance.id]);
      d = (await as(app, cntt).get(`/api/admin/activities/${a.id}`).expect(200)).body;
      expect(d.actualCount).toBe(1);
      expect((await as(app, cntt).get('/api/admin/activities').expect(200)).body.items[0].actualCount).toBe(1);
      await as(app, admin).del(`/api/admin/activities/${a.id}/events/${ev.id}`).expect(200);
      d = (await as(app, cntt).get(`/api/admin/activities/${a.id}`).expect(200)).body;
      expect(d).toMatchObject({ actualCount: 5, actualSource: 'MANUAL' });
    });

    it('TU CHOI: gan trung (409), su kien khong ton tai / ngoai pham vi (404), go lien ket khong co (404)', async () => {
      const a = await ready();
      const evAdmin = await openEvent(w); // su kien cap truong (Doan truong)
      await as(app, cntt).post(`/api/admin/activities/${a.id}/events`).send({ eventId: evAdmin.id }).expect(404); // khoa khong quan ly su kien cap truong
      const own = (await as(app, cntt).post('/api/admin/events').send({ title: 'Su kien khoa CNTT', hasDrl: false, startAt: at(DAY), endAt: at(DAY + 3_600_000) }).expect(201)).body;
      await as(app, cntt).post(`/api/admin/activities/${a.id}/events`).send({ eventId: own.id }).expect(200);
      expect((await as(app, cntt).post(`/api/admin/activities/${a.id}/events`).send({ eventId: own.id }).expect(409)).body.code).toBe('ALREADY_LINKED');
      await as(app, cntt).post(`/api/admin/activities/${a.id}/events`).send({ eventId: '3f0c1b6e-8a4d-4c9e-9b1a-2d7e5f6a7b8c' }).expect(404);
      await as(app, cntt).post(`/api/admin/activities/${a.id}/events`).send({ eventId: 'khong-phai-uuid' }).expect(400);
      await as(app, cntt).del(`/api/admin/activities/${a.id}/events/${evAdmin.id}`).expect(404);
      // ho so da chot khong doi lien ket
      await advance(a.id, 'LOCKED');
      await as(app, cntt).del(`/api/admin/activities/${a.id}/events/${own.id}`).expect(409);
    });
  });

  // ---------------- binh luan + thong bao ----------------
  describe('binh luan va thong bao', () => {
    it('khoa nop ho so -> Doan truong nhan thong bao; Doan truong duyet -> quan ly khoa nhan; khong tu thong bao cho minh', async () => {
      const a = await ready();
      await act(cntt, a.id, 'submit');
      const n1 = (await as(app, admin).get('/api/admin/notifications').expect(200)).body;
      expect(n1).toMatchObject({ total: 1, unread: 1 });
      expect(n1.items[0].message).toContain(a.code);
      expect((await as(app, cntt).get('/api/admin/notifications').expect(200)).body.total).toBe(0);
      await act(admin, a.id, 'approve');
      expect((await as(app, cntt).get('/api/admin/notifications').expect(200)).body.items[0].message).toContain('đã được duyệt');
      expect((await as(app, admin).get('/api/admin/notifications').expect(200)).body.total).toBe(1);
      // khoa khac khong nhan
      expect((await as(app, kt).get('/api/admin/notifications').expect(200)).body.total).toBe(0);
    });

    it('[BM] chi doc / danh dau thong bao cua chinh minh', async () => {
      const a = await ready();
      await act(cntt, a.id, 'submit');
      const mine = (await as(app, admin).get('/api/admin/notifications').expect(200)).body.items[0];
      await as(app, cntt).post(`/api/admin/notifications/${mine.id}/read`).expect(404); // thong bao cua nguoi khac
      expect((await as(app, admin).get('/api/admin/notifications/unread-count').expect(200)).body.unread).toBe(1);
      await as(app, admin).post(`/api/admin/notifications/${mine.id}/read`).expect(204);
      await as(app, admin).post(`/api/admin/notifications/${mine.id}/read`).expect(204); // doc lai khong loi
      expect((await as(app, admin).get('/api/admin/notifications/unread-count').expect(200)).body.unread).toBe(0);
      expect((await as(app, admin).get('/api/admin/notifications?unread=true').expect(200)).body.total).toBe(0);
      await as(app, admin).post('/api/admin/notifications/read-all').expect(204);
      await as(app, admin).get('/api/admin/notifications?limit=500').expect(400);
    });

    it('binh luan: hai ben trao doi, ben kia nhan thong bao; noi dung rong / qua dai bi tu choi', async () => {
      const a = await ready();
      await as(app, cntt).post(`/api/admin/activities/${a.id}/comments`).send({ content: 'Nhờ anh chị xem giúp kế hoạch' }).expect(201);
      await as(app, admin).post(`/api/admin/activities/${a.id}/comments`).send({ content: 'Đã xem, bổ sung kinh phí nhé' }).expect(201);
      const list = (await as(app, cntt).get(`/api/admin/activities/${a.id}/comments`).expect(200)).body.items;
      expect(list.map((c: { content: string }) => c.content)).toEqual(['Nhờ anh chị xem giúp kế hoạch', 'Đã xem, bổ sung kinh phí nhé']);
      expect((await as(app, cntt).get('/api/admin/notifications').expect(200)).body.items[0].message).toContain('Bình luận mới');
      expect((await as(app, admin).get('/api/admin/notifications').expect(200)).body.total).toBe(1);
      await as(app, cntt).post(`/api/admin/activities/${a.id}/comments`).send({ content: '' }).expect(400);
      await as(app, cntt).post(`/api/admin/activities/${a.id}/comments`).send({ content: 'x'.repeat(2001) }).expect(400);
    });
  });
});
