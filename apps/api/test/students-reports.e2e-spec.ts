// Test ho so sinh vien, gop MSSV, bao cao DRL va xuat Excel - dac ta 3.6, 3.7, 8.3
import { INestApplication } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { safeCell } from '../src/reports/reports.service';
import { login, makeUser, Session } from './helpers';
import { as, checkinAs, createTestApp, openEvent, runWorker, setupWorld, World } from './public-helpers';

describe('Sinh vien va bao cao DRL', () => {
  let app: INestApplication;
  let w: World;
  let mgr: Session; // quan ly khoa CNTT
  let kt: Session; // quan ly khoa KT

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    w = await setupWorld(app);
    await makeUser(w.ds, { email: 'kt@tdc.edu.vn', unit: 'KT' });
    kt = await login(app, 'kt@tdc.edu.vn');
    mgr = await login(app, 'cntt@tdc.edu.vn');
  });

  const api = (s: Session) => as(app, s);
  const A = '24211TM1001'; // CNTT
  const B = '24211TM1002'; // KT

  // tao su kien cua CNTT, cac sinh vien diem danh, duyet het, (tuy chon) chot
  async function run(drl: number, students: Array<[string, string, string]>, finalize = true, o: Record<string, unknown> = {}) {
    const ev = await openEvent(w, { unitId: w.faculty, drlPoints: drl, ...o });
    const ids: string[] = [];
    for (const [mssv, name, faculty] of students) {
      ids.push((await checkinAs(w, ev.token, { mssv, fullName: name, facultyUnitId: faculty })).attendance.id);
    }
    await runWorker(app);
    await api(w.admin).post(`/api/admin/events/${ev.id}/close`).expect(200);
    await api(w.admin).post('/api/admin/attendances/bulk').send({ eventId: ev.id, action: 'APPROVE', ids }).expect(200);
    if (finalize) await api(w.admin).post(`/api/admin/events/${ev.id}/finalize`).expect(200);
    return { ev, ids };
  }

  describe('bao cao DRL', () => {
    beforeEach(async () => {
      await run(3, [[A, 'Nguyen An', w.faculty], [B, 'Le Binh', w.faculty2]]);
      await run(5, [[A, 'Nguyen An', w.faculty]]);
    });

    const report = (s: Session, qs = '') => api(s).get(`/api/admin/reports/drl${qs}`);

    it('theo sinh vien: cong don nhieu su kien, xep diem cao truoc', async () => {
      const res = await report(w.admin).expect(200);
      expect(res.body).toMatchObject({ by: 'student', total: 2, totalDrl: 11 });
      expect(res.body.items).toEqual([
        { mssv: A, fullName: 'Nguyen An', faculty: 'Khoa Công nghệ thông tin', eventCount: 2, totalDrl: 8 },
        { mssv: B, fullName: 'Le Binh', faculty: expect.any(String), eventCount: 1, totalDrl: 3 },
      ]);
    });

    it('theo khoa: luon du 9 khoa, khoa khong co diem hien 0', async () => {
      const res = await report(w.admin, '?by=faculty').expect(200);
      expect(res.body.items).toHaveLength(9);
      const byName = Object.fromEntries(res.body.items.map((r: any) => [r.faculty, r]));
      expect(byName['Khoa Công nghệ thông tin']).toMatchObject({ studentCount: 1, eventCount: 2, totalDrl: 8 });
      expect(res.body.items.filter((r: any) => r.totalDrl === 0)).toHaveLength(7);
      expect(res.body.totalDrl).toBe(11);
    });

    it('chi tinh su kien DA CHOT, luot da duyet va khong huy', async () => {
      const open = await run(4, [['24211TM1003', 'Chua Chot', w.faculty]], false);
      const rejected = await run(2, [['24211TM1004', 'Bi Tu Choi', w.faculty], ['24211TM1005', 'Bi Huy', w.faculty]], false);
      await api(w.admin).post('/api/admin/attendances/bulk').send({ eventId: rejected.ev.id, action: 'REJECT', ids: [rejected.ids[0]], reason: 'Khong hop le' }).expect(200);
      await api(w.admin).post(`/api/admin/attendances/${rejected.ids[1]}/void`).send({ reason: 'Nham' }).expect(200);
      await api(w.admin).post(`/api/admin/events/${rejected.ev.id}/finalize`).expect(200);
      expect(open.ev.id).toBeDefined(); // su kien 'open' chua chot nen khong vao bao cao
      const res = await report(w.admin).expect(200);
      expect(res.body.items.map((i: any) => i.mssv)).toEqual([A, B]);
    });

    it('loc theo ngay (gio Viet Nam), su kien, khoa', async () => {
      expect((await report(w.admin, '?from=2000-01-01&to=2000-12-31').expect(200)).body.total).toBe(0);
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 31 * 3600e3).toISOString().slice(0, 10);
      expect((await report(w.admin, `?from=${today}&to=${tomorrow}`).expect(200)).body.total).toBe(2);
      expect((await report(w.admin, `?facultyUnitId=${w.faculty2}`).expect(200)).body.items.map((i: any) => i.mssv)).toEqual([B]);
      expect((await report(w.admin, '?from=hom-nay').expect(400)).body.statusCode).toBe(400);
      expect((await report(w.admin, '?by=lop').expect(400)).body.statusCode).toBe(400);
    });

    it('[BM] quan ly khoa chi thay sinh vien khoa minh; khoa khong lien quan thay rong; loc khoa ngoai pham vi 404; chua dang nhap 401', async () => {
      const mine = await report(mgr).expect(200);
      expect(mine.body.items.map((i: any) => i.mssv)).toEqual([A]);
      expect(mine.body.totalDrl).toBe(8);
      const byFaculty = await report(mgr, '?by=faculty').expect(200);
      expect(byFaculty.body.items.map((r: any) => r.faculty)).toEqual(['Khoa Công nghệ thông tin']);
      expect((await report(kt).expect(200)).body.total).toBe(0); // su kien cua CNTT khong thuoc KT
      await report(mgr, `?facultyUnitId=${w.faculty2}`).expect(404);
      await request(app.getHttpServer()).get('/api/admin/reports/drl').expect(401);
    });
  });

  describe('xuat Excel', () => {
    it('tra tep xlsx doc duoc, ghi nhat ky; o bat dau bang = duoc vo hieu hoa (formula injection)', async () => {
      await run(3, [[A, '=HYPERLINK("http://x","bam")', w.faculty]]);
      const res = await api(w.admin).get('/api/admin/reports/drl.xlsx').buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toBe('attachment; filename="tong-hop-drl.xlsx"');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      const row = wb.getWorksheet('Tổng hợp ĐRL')!.getRow(2);
      expect(row.getCell(1).value).toBe(A);
      expect(row.getCell(2).value).toBe(`'=HYPERLINK("http://x","bam")`);
      expect(row.getCell(5).value).toBe(3);
      expect(await w.ds.query("SELECT action FROM audit_logs WHERE action = 'REPORT_EXPORT'")).toHaveLength(1);
    });

    it('TU CHOI: chua dang nhap 401; tham so sai 400; quan ly khoa chi nhan du lieu khoa minh', async () => {
      await run(3, [[A, 'An', w.faculty], [B, 'Binh', w.faculty2]]);
      await request(app.getHttpServer()).get('/api/admin/reports/drl.xlsx').expect(401);
      await api(w.admin).get('/api/admin/reports/drl.xlsx?by=xx').expect(400);
      const res = await api(mgr).get('/api/admin/reports/drl.xlsx').buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body);
      expect(wb.getWorksheet('Tổng hợp ĐRL')!.rowCount).toBe(2); // tieu de + 1 sinh vien
    });

    it('safeCell: them dau nhay khi bat dau bang = + - @ tab CR; giu nguyen chuoi thuong', () => {
      for (const v of ['=1+1', '+84', '-1', '@SUM(A1)', '\tx', '\rx']) expect(safeCell(v)).toBe(`'${v}`);
      for (const v of ['Nguyen An', '24211TM1001', 'a=b', '']) expect(safeCell(v)).toBe(v);
    });
  });

  describe('ho so sinh vien', () => {
    beforeEach(async () => {
      await run(3, [[A, 'Nguyen An', w.faculty], [B, 'Le Binh', w.faculty2]]);
    });

    it('danh sach theo pham vi; tim theo MSSV / ten; chi tiet co lich su', async () => {
      expect((await api(w.admin).get('/api/admin/students').expect(200)).body.total).toBe(2);
      const mine = await api(mgr).get('/api/admin/students').expect(200);
      expect(mine.body.items.map((s: any) => s.mssv)).toEqual([A]);
      expect(mine.body.items[0]).toMatchObject({ attendanceCount: 1, totalDrl: 3 });
      expect((await api(w.admin).get('/api/admin/students?q=Binh').expect(200)).body.items.map((s: any) => s.mssv)).toEqual([B]);
      const detail = await api(mgr).get(`/api/admin/students/${A.toLowerCase()}`).expect(200);
      expect(detail.body.student).toMatchObject({ mssv: A, totalDrl: 3 });
      expect(detail.body.history).toHaveLength(1);
    });

    it('TU CHOI: sinh vien khoa khac -> 404; MSSV la -> 404; chua dang nhap 401', async () => {
      await api(mgr).get(`/api/admin/students/${B}`).expect(404);
      await api(w.admin).get('/api/admin/students/KHONG-CO').expect(404);
      await api(mgr).patch(`/api/admin/students/${B}`).send({ fullName: 'Hack', reason: 'Thu' }).expect(404);
      await request(app.getHttpServer()).get('/api/admin/students').expect(401);
    });

    it('sua: bat buoc ly do va co thay doi; khong chuyen sang khoa ngoai pham vi; ghi nhat ky', async () => {
      await api(mgr).patch(`/api/admin/students/${A}`).send({ fullName: 'Moi' }).expect(400);
      await api(mgr).patch(`/api/admin/students/${A}`).send({ reason: 'Khong doi gi' }).expect(400);
      await api(mgr).patch(`/api/admin/students/${A}`).send({ facultyUnitId: w.faculty2, reason: 'Chuyen khoa' }).expect(404);
      const ok = await api(mgr).patch(`/api/admin/students/${A}`).send({ fullName: 'Nguyen Van An', reason: 'Sua ten theo CCCD' }).expect(200);
      expect(ok.body.fullName).toBe('Nguyen Van An');
      expect(await w.ds.query("SELECT action FROM audit_logs WHERE action = 'STUDENT_UPDATE'")).toHaveLength(1);
    });

    describe('gop MSSV', () => {
      const merge = (s: Session, from: string, body: object) => api(s).post(`/api/admin/students/${from}/merge`).send(body);

      it('chi Doan truong; sau khi gop, bao cao cong don vao MSSV chinh; MSSV cu an khoi danh sach', async () => {
        const typo = '24211TM1099';
        await run(5, [[typo, 'Nguyen An', w.faculty]]);
        await merge(mgr, typo, { intoMssv: A, reason: 'Go nham MSSV' }).expect(403);
        const res = await merge(w.admin, typo, { intoMssv: A, reason: 'Go nham MSSV' }).expect(200);
        expect(res.body).toMatchObject({ mssv: A, attendanceCount: 2, totalDrl: 8 });
        const rep = await api(w.admin).get('/api/admin/reports/drl').expect(200);
        expect(rep.body.items.find((i: any) => i.mssv === A)).toMatchObject({ eventCount: 2, totalDrl: 8 });
        expect(rep.body.items.map((i: any) => i.mssv)).not.toContain(typo);
        expect((await api(w.admin).get('/api/admin/students').expect(200)).body.items.map((s: any) => s.mssv)).not.toContain(typo);
        expect(await w.ds.query("SELECT action FROM audit_logs WHERE action = 'STUDENT_MERGE'")).toHaveLength(1);
      });

      it('TU CHOI: thieu ly do; gop vao chinh no; dich khong ton tai; da gop roi; dich da bi gop; cung nhan DRL trong mot su kien da chot', async () => {
        await merge(w.admin, B, { intoMssv: A }).expect(400);
        expect((await merge(w.admin, A, { intoMssv: A, reason: 'Thu' }).expect(400)).body.code).toBe('INVALID_MERGE');
        await merge(w.admin, A, { intoMssv: '24211TM9998', reason: 'Thu' }).expect(404);
        // A va B cung duoc cong diem o mot su kien da chot
        const both = await run(2, [[A, 'Nguyen An', w.faculty], [B, 'Le Binh', w.faculty2]]);
        void both;
        expect((await merge(w.admin, B, { intoMssv: A, reason: 'Thu' }).expect(409)).body.code).toBe('MERGE_CONFLICT');
        // gop hop le roi gop lai
        const c = '24211TM1050';
        await run(1, [[c, 'Pham C', w.faculty]]);
        await merge(w.admin, c, { intoMssv: A, reason: 'Trung nguoi' }).expect(200);
        expect((await merge(w.admin, c, { intoMssv: B, reason: 'Lai' }).expect(409)).body.code).toBe('ALREADY_MERGED');
        const d = '24211TM1051';
        await run(1, [[d, 'Pham D', w.faculty]]);
        expect((await merge(w.admin, d, { intoMssv: c, reason: 'Dich da gop' }).expect(409)).body.code).toBe('TARGET_MERGED');
        await merge(w.admin, d, { intoMssv: 'abc', reason: 'Sai dinh dang' }).expect(400);
      });

      it('chot su kien: MSSV da gop va MSSV chinh cung duoc duyet -> chi tinh DRL mot lan', async () => {
        const typo = '24211TM1098';
        const ev = await run(4, [[A, 'Nguyen An', w.faculty], [typo, 'Nguyen An', w.faculty]], false);
        await merge(w.admin, typo, { intoMssv: A, reason: 'Cung mot nguoi' }).expect(200);
        const done = await api(w.admin).post(`/api/admin/events/${ev.ev.id}/finalize`).expect(200);
        expect(done.body).toMatchObject({ awardedCount: 1, totalDrl: 4 });
      });
    });
  });
});
