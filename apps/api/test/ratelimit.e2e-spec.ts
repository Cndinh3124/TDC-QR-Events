// Gioi han tan suat dang nhap theo IP - dac ta 8.4
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, makeUser, resetDb } from './helpers';

describe('Gioi han tan suat dang nhap', () => {
  let app: INestApplication;
  const old = process.env.LOGIN_RATE_LIMIT_PER_MIN;

  beforeAll(async () => {
    process.env.LOGIN_RATE_LIMIT_PER_MIN = '3';
    app = await createTestApp(); // app rieng -> bo dem rieng
  });
  afterAll(async () => {
    process.env.LOGIN_RATE_LIMIT_PER_MIN = old;
    await app.close();
  });

  it('TU CHOI: vuot 3 lan/phut tu cung IP -> 429 voi dinh dang loi chung', async () => {
    const ds = await resetDb(app);
    await makeUser(ds, { email: 'admin@tdc.edu.vn', role: 'SCHOOL_ADMIN' });
    const send = () => request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'admin@tdc.edu.vn', password: 'sai-mat-khau-1' });
    for (let i = 0; i < 3; i++) await send().expect(401);
    const res = await send().expect(429);
    expect(res.body).toMatchObject({ statusCode: 429, code: 'TOO_MANY_REQUESTS' });
  });
});
