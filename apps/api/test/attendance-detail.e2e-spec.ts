// Test ngan keo chi tiet mot luot diem danh (A07): lich su sua, su kien khac cua cung MSSV, pham vi - dac ta 3.7, 2.4
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { login, makeUser, Session } from './helpers';
import { as, checkinAs, createTestApp, openEvent, runWorker, setupWorld, World } from './public-helpers';

describe('Chi tiet luot diem danh (A07)', () => {
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

  const api = (s: Session) => as(app, s);
  const detail = (s: Session, id: string) => api(s).get(`/api/admin/attendances/${id}`);
  const studentPatch = (cookie: string, id: string, body: object) =>
    request(app.getHttpServer()).patch(`/api/public/attendances/${id}`).set('Cookie', cookie).send({ idempotencyKey: randomUUID(), ...body });

  it('lich su sua (sinh vien + quan tri, moi nhat truoc, khoa hien ten) va su kien khac cua cung MSSV', async () => {
    const ev = await openEvent(w, { unitId: w.faculty, title: 'Hội thảo AI' });
    const other = await openEvent(w, { unitId: w.faculty, title: 'Ngày hội việc làm' });
    const me = await checkinAs(w, ev.token, { mssv: '24211TM2001', fullName: 'Tran An' });
    await checkinAs(w, other.token, { mssv: '24211TM2001', fullName: 'Tran An' });
    await checkinAs(w, ev.token, { mssv: '24211TM2002', fullName: 'Nguoi Khac' });
    await studentPatch(me.cookie, me.attendance.id, { fullName: 'Trần An' }).expect(200);
    await api(w.admin).patch(`/api/admin/attendances/${me.attendance.id}`)
      .send({ facultyUnitId: w.faculty2, reason: 'Sinh vien chon nham khoa' }).expect(200);
    await runWorker(app);

    const res = await detail(w.cntt, me.attendance.id).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { attendance, edits, otherAttendances } = res.body;
    expect(attendance).toMatchObject({ id: me.attendance.id, fullName: 'Trần An', editCount: 1 });
    expect(attendance.confirmCode).toMatch(/^[A-Z2-9]{8}$/); // don vi to chuc thay ma
    expect(edits).toHaveLength(2);
    expect(edits[0]).toMatchObject({
      actorType: 'ADMIN', actorName: 'Nguoi dung admin', reason: 'Sinh vien chon nham khoa',
      changes: [{ field: 'facultyUnitId', from: 'Khoa Công nghệ thông tin', to: expect.stringContaining('Kinh tế') }],
    });
    expect(edits[1]).toMatchObject({ actorType: 'STUDENT', actorName: null, changes: [{ field: 'fullName', from: 'Tran An', to: 'Trần An' }] });
    expect(otherAttendances.map((o: any) => o.eventTitle)).toEqual(['Ngày hội việc làm']);
    // [BM] khong lo ma thiet bi / IP / toa do
    const text = JSON.stringify(res.body);
    for (const k of ['actorId', '"ip"', 'userAgent', '"lat"', '"lng"', 'deviceId', 'Nguoi Khac']) expect(text).not.toContain(k);
  });

  it('MSSV da gop: hien ca luot cua MSSV phu', async () => {
    const ev1 = await openEvent(w, { unitId: w.faculty, title: 'Sự kiện 1' });
    const ev2 = await openEvent(w, { unitId: w.faculty, title: 'Sự kiện 2' });
    const main = await checkinAs(w, ev1.token, { mssv: '24211TM3001' });
    await checkinAs(w, ev2.token, { mssv: '24211TM3009' });
    await runWorker(app);
    await api(w.admin).post('/api/admin/students/24211TM3009/merge').send({ intoMssv: '24211TM3001', reason: 'Go nham MSSV' }).expect(200);
    const others = (await detail(w.admin, main.attendance.id).expect(200)).body.otherAttendances;
    expect(others).toEqual([expect.objectContaining({ eventTitle: 'Sự kiện 2', mssv: '24211TM3009', voided: false })]);
  });

  it('TU CHOI: khoa khac 404, id la 404, id sai dang 400, chua dang nhap 401', async () => {
    const ev = await openEvent(w, { unitId: w.faculty });
    const me = await checkinAs(w, ev.token, { mssv: '24211TM4001' });
    expect((await detail(kt, me.attendance.id).expect(404)).body.code).toBe('NOT_FOUND');
    await detail(w.admin, randomUUID()).expect(404);
    await detail(w.admin, 'khong-phai-uuid').expect(400);
    await request(app.getHttpServer()).get(`/api/admin/attendances/${me.attendance.id}`).expect(401);
  });

  it('[NV] 2.4: khoa chi-xem su kien cap truong chi mo duoc luot sinh vien khoa minh, khong thay ma xac nhan; su kien khac ngoai tam nhin bi an', async () => {
    const ev = await openEvent(w, { title: 'Sự kiện cấp trường' });
    const hidden = await openEvent(w, { title: 'Sự kiện trường không chia sẻ' });
    await api(w.admin).post(`/api/admin/events/${ev.id}/faculty-view`).send({ mode: 'ALL', reason: 'Chia se cho cac khoa' }).expect(200);
    const mine = await checkinAs(w, ev.token, { mssv: '24211TM5001', facultyUnitId: w.faculty });
    await checkinAs(w, hidden.token, { mssv: '24211TM5001', facultyUnitId: w.faculty });
    const theirs = await checkinAs(w, ev.token, { mssv: '24211TM5002', facultyUnitId: w.faculty2 });
    const res = await detail(w.cntt, mine.attendance.id).expect(200);
    expect(res.body.attendance.confirmCode).toBeNull();
    expect(res.body.otherAttendances).toEqual([]);
    await detail(w.cntt, theirs.attendance.id).expect(404);
    expect((await detail(w.admin, mine.attendance.id).expect(200)).body.otherAttendances).toHaveLength(1);
  });
});
