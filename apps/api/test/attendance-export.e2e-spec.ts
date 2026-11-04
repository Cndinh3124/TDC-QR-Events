// Test xuat Excel danh sach diem danh cua mot su kien: noi dung, bo loc, phan quyen / pham vi, [BM] formula injection + nhat ky
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { login, makeUser, Session } from './helpers';
import { as, checkinAs, createTestApp, openEvent, runWorker, setupWorld, World } from './public-helpers';

describe('Xuat Excel diem danh theo su kien', () => {
  let app: INestApplication;
  let w: World;
  let kt: Session;

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
  });

  const xlsx = (s: Session | null, id: string, qs = '') => {
    const req = s ? as(app, s).get(`/api/admin/events/${id}/attendances.xlsx${qs}`) : request(app.getHttpServer()).get(`/api/admin/events/${id}/attendances.xlsx${qs}`);
    return req.buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  };
  const sheet = async (body: Buffer, name = 'Điểm danh') => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body);
    return wb.getWorksheet(name)!;
  };
  const cell = (ws: ExcelJS.Worksheet, row: number, col: number) => ws.getRow(row).getCell(col).value;

  it('xuat dung cot, thu tu, tieng Viet; co sheet Thong tin; ghi nhat ky', async () => {
    const ev = await openEvent(w, { unitId: w.faculty, title: 'Chào tân sinh viên' });
    await checkinAs(w, ev.token, { mssv: '24211TM1001', fullName: 'Nguyễn An', email: 'an@tdc.edu.vn' });
    await checkinAs(w, ev.token, { mssv: '24211TM1002', fullName: 'Lê Bình' });
    await runWorker(app);

    const res = await xlsx(w.admin, ev.id).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toBe('attachment; filename="diem-danh-su-kien.xlsx"');
    expect(res.headers['cache-control']).toBe('no-store');

    const ws = await sheet(res.body);
    expect(ws.rowCount).toBe(3); // tieu de + 2 luot
    expect(cell(ws, 1, 2)).toBe('MSSV');
    expect(cell(ws, 2, 1)).toBe(1);
    expect(cell(ws, 2, 2)).toBe('24211TM1001');
    expect(cell(ws, 2, 3)).toBe('Nguyễn An');
    expect(cell(ws, 2, 4)).toBe('an@tdc.edu.vn');
    expect(cell(ws, 2, 5)).toBe('Khoa Công nghệ thông tin');
    expect(cell(ws, 2, 8)).toBe('Đúng giờ');
    expect(cell(ws, 1, 9)).toBe('Thiết bị');
    expect(cell(ws, 2, 10)).toBe('Tự điểm danh');
    expect(cell(ws, 2, 11)).toBe('Chờ duyệt');
    expect(cell(ws, 3, 3)).toBe('Lê Bình');

    const info = await sheet(res.body, 'Thông tin');
    expect(cell(info, 1, 2)).toBe('Chào tân sinh viên');
    expect(cell(info, 4, 2)).toBe(2);

    const log = await w.ds.query("SELECT entity, entity_id AS entityId FROM audit_logs WHERE action = 'ATTENDANCE_EXPORT'");
    expect(log).toHaveLength(1);
    expect(log[0].entityId).toBe(ev.id);
  });

  it('cot Thiet bi: ra "Trinh duyet · HDH", de trong voi luot thu cong / khong co user-agent; khong lo chuoi goc va IP', async () => {
    const ev = await openEvent(w, { unitId: w.faculty });
    const a = await checkinAs(w, ev.token, { mssv: '24211TM7001', fullName: 'Co UA' });
    const b = await checkinAs(w, ev.token, { mssv: '24211TM7002', fullName: 'Khong UA' });
    await w.ds.query('UPDATE attendances SET user_agent = ? WHERE id = ?', [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', a.attendance.id,
    ]);
    await w.ds.query('UPDATE attendances SET user_agent = NULL WHERE id = ?', [b.attendance.id]);
    await as(app, w.admin).post(`/api/admin/events/${ev.id}/attendances`).send({
      mssv: '24211TM7003', fullName: 'Them tay', facultyUnitId: w.faculty, checkinAt: new Date().toISOString(), reason: 'Quen quet ma',
    }).expect(201);

    const ws = await sheet((await xlsx(w.admin, ev.id).expect(200)).body);
    const byName = (n: string) => Array.from({ length: ws.rowCount - 1 }, (_, i) => i + 2).find((r) => cell(ws, r, 3) === n)!;
    expect(cell(ws, byName('Co UA'), 9)).toBe('Safari 17 · iOS 17');
    expect(cell(ws, byName('Khong UA'), 9)).toBe('');
    expect(cell(ws, byName('Them tay'), 9)).toBe('');
    const text = JSON.stringify(ws.getSheetValues());
    for (const k of ['Mozilla', 'AppleWebKit', 'KHTML', '127.0.0.1', '::1', '::ffff']) expect(text).not.toContain(k);
  });

  it('[BM] khong xuat ma xac nhan, ma thiet bi, IP, toa do', async () => {
    const ev = await openEvent(w, { unitId: w.faculty });
    const me = await checkinAs(w, ev.token, { mssv: '24211TM2001', fullName: 'An' });
    const ws = await sheet((await xlsx(w.admin, ev.id).expect(200)).body);
    const headers = (ws.getRow(1).values as unknown[]).filter(Boolean).join('|');
    for (const k of ['Mã xác nhận', 'thiết bị', 'IP', 'Vĩ độ', 'Kinh độ', 'user']) expect(headers).not.toContain(k);
    const all = JSON.stringify(ws.getSheetValues());
    expect(all).not.toContain(me.attendance.confirmCode ?? '__khong_co__');
  });

  it('[BM] o bat dau bang = + - @ bi vo hieu hoa (formula injection)', async () => {
    const ev = await openEvent(w, { unitId: w.faculty });
    await checkinAs(w, ev.token, { mssv: '24211TM3001', fullName: '=HYPERLINK("http://x","bam")' });
    const ws = await sheet((await xlsx(w.admin, ev.id).expect(200)).body);
    expect(cell(ws, 2, 3)).toBe(`'=HYPERLINK("http://x","bam")`);
  });

  it('bo loc giong danh sach: review, flagged, q, voided; mac dinh bo luot da huy', async () => {
    const ev = await openEvent(w, { unitId: w.faculty });
    const a = await checkinAs(w, ev.token, { mssv: '24211TM4001', fullName: 'An' });
    const b = await checkinAs(w, ev.token, { mssv: '24211TM4002', fullName: 'Binh' });
    const c = await checkinAs(w, ev.token, { mssv: '24211TM4003', fullName: 'Chi' });
    const d = await checkinAs(w, ev.token, { mssv: '24211TM4003', fullName: 'Chi' }); // trung MSSV -> co co
    await runWorker(app);
    await as(app, w.admin).post(`/api/admin/events/${ev.id}/close`).expect(200);
    await as(app, w.admin).patch(`/api/admin/attendances/${a.attendance.id}/review`).send({ status: 'APPROVED' }).expect(200);
    await as(app, w.admin).post(`/api/admin/attendances/${b.attendance.id}/void`).send({ reason: 'Dien nham' }).expect(200);
    const rows = async (qs: string) => (await sheet((await xlsx(w.admin, ev.id, qs).expect(200)).body)).rowCount - 1;

    expect(await rows('')).toBe(3); // b da huy -> khong tinh
    expect(await rows('?review=APPROVED')).toBe(1);
    expect(await rows('?flagged=yes')).toBe(2); // c va d trung MSSV
    expect(await rows('?q=Chi')).toBe(2);
    expect(await rows('?voided=only')).toBe(1);
    expect(await rows('?voided=include')).toBe(4);
    const flagged = await sheet((await xlsx(w.admin, ev.id, '?flagged=yes').expect(200)).body);
    expect(String(cell(flagged, 2, 14))).toContain('Trùng MSSV');
    const voided = await sheet((await xlsx(w.admin, ev.id, '?voided=only').expect(200)).body);
    expect(cell(voided, 2, 15)).toBe('Đã hủy: Dien nham');
    expect([c, d].length).toBe(2);
  });

  it('TU CHOI: chua dang nhap 401; id sai 400; su kien khong ton tai 404; khoa khac 404', async () => {
    const ev = await openEvent(w, { unitId: w.faculty });
    await checkinAs(w, ev.token, { mssv: '24211TM5001' });
    await xlsx(null, ev.id).expect(401);
    await xlsx(w.admin, 'khong-phai-uuid').expect(400);
    await xlsx(w.admin, randomUUID()).expect(404);
    await xlsx(kt, ev.id).expect(404); // quan ly khoa KT khong thay su kien cua CNTT
    // loc sai khong lam sap
    await xlsx(w.admin, ev.id, '?review=XYZ').expect(400);
    await xlsx(w.admin, ev.id, '?voided=maybe').expect(400);
    // lan bi tu choi khong ghi nhat ky xuat
    expect(await w.ds.query("SELECT 1 FROM audit_logs WHERE action = 'ATTENDANCE_EXPORT'")).toHaveLength(0);
  });

  it('[NV] 2.4: khoa chi-xem su kien cap truong chi nhan sinh vien khoa minh; khoa khong duoc chia se 404', async () => {
    const ev = await openEvent(w, { title: 'Sự kiện cấp trường' });
    await as(app, w.admin).post(`/api/admin/events/${ev.id}/faculty-view`).send({ mode: 'ALL', reason: 'Chia se cho cac khoa' }).expect(200);
    await checkinAs(w, ev.token, { mssv: '24211TM6001', fullName: 'Cua CNTT', facultyUnitId: w.faculty });
    await checkinAs(w, ev.token, { mssv: '24211TM6002', fullName: 'Cua KT', facultyUnitId: w.faculty2 });

    const mine = await sheet((await xlsx(w.cntt, ev.id).expect(200)).body);
    expect(mine.rowCount).toBe(2); // tieu de + 1 sinh vien khoa CNTT
    expect(cell(mine, 2, 3)).toBe('Cua CNTT');
    expect(JSON.stringify(mine.getSheetValues())).not.toContain('Cua KT');
    expect((await sheet((await xlsx(w.admin, ev.id).expect(200)).body)).rowCount).toBe(3);

    const hidden = await openEvent(w, { title: 'Không chia sẻ' });
    await xlsx(w.cntt, hidden.id).expect(404);
  });

  it('khong co luot nao van tra tep hop le (chi co dong tieu de)', async () => {
    const ev = await openEvent(w, { unitId: w.faculty });
    const ws = await sheet((await xlsx(w.admin, ev.id).expect(200)).body);
    expect(ws.rowCount).toBe(1);
  });
});
