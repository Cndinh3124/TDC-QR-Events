// Ham tro giup cho test diem danh cong khai
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Event } from '../src/events/entities/event.entity';
import { FlagWorker } from '../src/public/flag.worker';
import { as, createTestApp, login, makeUser, resetDb, Session, unitId } from './helpers';

export const H = 3600_000;
export const at = (ms: number) => new Date(Date.now() + ms).toISOString();

export interface PubEvent {
  id: string;
  token: string; // QR vao
  outToken: string | null; // QR ra (chi khi bat diem danh ra)
  verifyCode: string | null; // ma 4 so (chi muc Chat)
}

export interface World {
  app: INestApplication;
  ds: DataSource;
  admin: Session;
  cntt: Session;
  faculty: string; // id khoa CNTT
  faculty2: string; // id khoa KT
}

// dung app + DB sach + hai tai khoan; goi trong beforeEach
export async function setupWorld(app: INestApplication): Promise<World> {
  const ds = await resetDb(app);
  await makeUser(ds, { email: 'admin@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
  await makeUser(ds, { email: 'cntt@tdc.edu.vn', unit: 'CNTT' });
  return {
    app, ds,
    admin: await login(app, 'admin@tdc.edu.vn'),
    cntt: await login(app, 'cntt@tdc.edu.vn'),
    faculty: await unitId(ds, 'CNTT'),
    faculty2: await unitId(ds, 'KT'),
  };
}

// Tao su kien (muc Thuong, hoac Chat neu muon) roi bam mo diem danh. drlPoints >= 5 thi mac dinh Chat.
export async function openEvent(w: World, o: Record<string, unknown> = {}): Promise<PubEvent> {
  const tight = o.controlLevel === 'TIGHT';
  const created = (
    await as(w.app, w.admin)
      .post('/api/admin/events')
      .send({
        title: 'Chào tân sinh viên', hasDrl: true, drlPoints: 3, startAt: at(H), endAt: at(3 * H),
        controlLevel: tight ? 'TIGHT' : 'NORMAL', requireCheckout: tight, ...o,
      })
      .expect(201)
  ).body;
  await as(w.app, w.admin).post(`/api/admin/events/${created.id}/publish`).expect(200);
  await as(w.app, w.admin).post(`/api/admin/events/${created.id}/open`).expect(200);
  const qr = (await as(w.app, w.admin).get(`/api/admin/events/${created.id}/qr`).expect(200)).body;
  return { id: created.id, token: qr.checkin.token, outToken: qr.checkout?.token ?? null, verifyCode: created.verifyCode ?? null };
}

// sua thang DB de dua su kien ve trang thai can test (gio, trang thai...)
export const patchEvent = (w: World, id: string, patch: Partial<Event>) => w.ds.getRepository(Event).update({ id }, patch);

let mssvSeq = 1000;
// MSSV hop le, moi lan goi mot so khac
export const nextMssv = () => `24211TM${++mssvSeq}`;

export function checkinBody(w: World, token: string, o: Record<string, unknown> = {}) {
  return {
    token, idempotencyKey: randomUUID(), mssv: nextMssv(), fullName: 'Nguyễn Văn An', facultyUnitId: w.faculty, ...o,
  };
}

// "dien thoai": co cookie rieng (supertest agent giu cookie)
export const phone = (app: INestApplication) => request.agent(app.getHttpServer());

// lay cookie thiet bi (vao trang diem danh truoc nhu sinh vien that)
export async function deviceCookie(app: INestApplication, token: string): Promise<string> {
  const res = await request(app.getHttpServer()).get(`/api/public/events/by-token/${token}`).expect(200);
  return ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

// diem danh vao bang mot cookie thiet bi cho truoc
export const postCheckin = (app: INestApplication, cookie: string | null, body: object) => {
  const r = request(app.getHttpServer()).post('/api/public/checkin');
  return (cookie ? r.set('Cookie', cookie) : r).send(body);
};

// Diem danh vao nhu sinh vien that: vao trang (nhan cookie) roi gui. Tra cookie + luot.
export async function checkinAs(w: World, token: string, o: Record<string, unknown> = {}) {
  const cookie = await deviceCookie(w.app, token);
  const res = await postCheckin(w.app, cookie, checkinBody(w, token, o)).expect(201);
  return { cookie, attendance: res.body.attendance as { id: string; mssv: string; confirmCode: string } };
}

export const runWorker = (app: INestApplication) => app.get(FlagWorker).drain();

export const flagsOf = async (ds: DataSource, attendanceId: string): Promise<string[]> =>
  (await ds.query('SELECT code FROM attendance_flags WHERE attendance_id = ? ORDER BY code', [attendanceId])).map(
    (r: { code: string }) => r.code,
  );

export { as, createTestApp };
