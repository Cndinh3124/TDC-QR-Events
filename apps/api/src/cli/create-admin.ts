// Tao tai khoan QTV Doan truong dau tien bang CLI - dac ta 8.1
// [BM] khong co endpoint cong khai de tao QTV dau tien.
// Dung: npm run create-admin -- --email a@tdc.edu.vn --name "Nguyen Van A"
// Mat khau: bien moi truong ADMIN_PASSWORD, hoac nhap tay (khong hien ky tu).
import 'reflect-metadata';
import * as argon2 from 'argon2';
import * as readline from 'readline';
import { DataSource } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { assertStrongPassword } from '../common/password-policy';
import { loadEnv } from '../config/env';
import { buildDbOptions } from '../database/data-source';
import { Unit } from '../units/entities/unit.entity';
import { AdminUser } from '../users/entities/admin-user.entity';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function askHidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as any)._writeToOutput;
    process.stdout.write(q);
    // an ky tu dang go
    (rl as any)._writeToOutput = (s: string) => {
      if (s.includes('\n') || s.includes('\r')) w.call(rl, s);
    };
    rl.question('', (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a);
    });
  });
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const fullName = (arg('name') || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 190) throw new Error('Thieu hoac sai --email');
  if (fullName.length < 2 || fullName.length > 120) throw new Error('Thieu hoac sai --name (2-120 ky tu)');

  const password = process.env.ADMIN_PASSWORD || (await askHidden('Mat khau (>= 10 ky tu): '));
  assertStrongPassword(password, email);

  const ds = new DataSource(buildDbOptions(loadEnv()));
  await ds.initialize();
  try {
    const school = await ds.getRepository(Unit).findOneBy({ type: 'SCHOOL' });
    if (!school) throw new Error('Chua co don vi Doan truong, hay chay migration truoc.');
    if (await ds.getRepository(AdminUser).findOneBy({ email })) throw new Error('Email nay da ton tai.');

    const user = await ds.getRepository(AdminUser).save({
      email,
      fullName,
      role: 'SCHOOL_ADMIN' as const,
      unitId: school.id,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      isActive: true,
      mustChangePassword: true,
    });
    await ds.getRepository(AuditLog).insert({
      actorId: null,
      action: 'CLI_CREATE_ADMIN',
      entity: 'user',
      entityId: user.id,
      afterJson: { email, role: 'SCHOOL_ADMIN' } as any,
    });
    console.log(`Da tao QTV Doan truong: ${email} (se bi buoc doi mat khau o lan dang nhap dau)`);
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error('Loi:', e.message);
  process.exit(1);
});
