// Gioi han nhap sai ma 4 so - dac ta 5.2, 8.4
// [BM] Ma chi co 10.000 kha nang. Hai lop chan, deu luu trong DB (dung chinh xac khi co 2 ban backend):
//  1. moi luot diem danh toi da 5 lan thu roi khoa 15 phut - "lay phieu" truoc khi kiem tra nen gui song song cung khong vuot;
//  2. tran chung cua su kien, vi cookie thiet bi tao mien phi nen ke do ma co the doi thiet bi lien tuc.
// Chi thiet bi da co luot diem danh vao moi duoc thu ma, nen moi lan "doi thiet bi" ton mot luot hien ra trong danh sach duyet.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { appError } from '../common/errors';
import { Event } from '../events/entities/event.entity';
import { QrService } from '../events/qr.service';
import { CODE_LOCK_MS, CODE_MAX_FAILS, EVENT_CODE_FAIL_LIMIT, EVENT_CODE_WINDOW_MS } from './public.constants';

@Injectable()
export class CodeGuardService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly qr: QrService,
  ) {}

  async assertEventNotPaused(eventId: string, now: Date): Promise<void> {
    const since = new Date(now.getTime() - EVENT_CODE_WINDOW_MS);
    const rows = await this.ds.query(
      'SELECT fail_count AS n FROM event_code_failures WHERE event_id = ? AND window_started_at > ?',
      [eventId, since],
    );
    if (rows.length && Number(rows[0].n) >= EVENT_CODE_FAIL_LIMIT) {
      throw appError(429, 'CODE_ENTRY_PAUSED', 'Mã xác nhận bị nhập sai quá nhiều lần, vui lòng báo ban tổ chức.');
    }
  }

  // "Lay phieu" mot lan thu. Cau lenh don nen nguyen tu: dung 5 phieu, khong hon.
  // Quy tac gan trai sang phai: count cap nhat truoc, locked_until doc count moi.
  async takeTicket(attendanceId: string, now: Date): Promise<void> {
    const res = await this.ds.query(
      `UPDATE attendances
          SET code_fail_count = IF(code_locked_until IS NOT NULL, 1, code_fail_count + 1),
              code_locked_until = IF(code_fail_count >= ?, ?, NULL)
        WHERE id = ? AND (code_locked_until IS NULL OR code_locked_until <= ?)`,
      [CODE_MAX_FAILS, new Date(now.getTime() + CODE_LOCK_MS), attendanceId, now],
    );
    if (res.affectedRows === 0) {
      throw appError(429, 'CODE_LOCKED', 'Bạn đã nhập sai mã quá nhiều lần, vui lòng thử lại sau 15 phút.');
    }
  }

  // [BM] so sanh thoi gian khong doi
  matches(event: Event, code: string): boolean {
    if (!event.verifyCodeHash) return false; // muc Chat ma khong co ma: tu choi
    const given = Buffer.from(this.qr.hashVerifyCode(event.id, code));
    const stored = Buffer.from(event.verifyCodeHash);
    return given.length === stored.length && timingSafeEqual(given, stored);
  }

  async recordEventFailure(eventId: string, now: Date): Promise<void> {
    const windowStart = new Date(now.getTime() - EVENT_CODE_WINDOW_MS);
    // fail_count gan truoc window_started_at: ca hai doc gia tri cu cua cua so
    await this.ds.query(
      `INSERT INTO event_code_failures (event_id, window_started_at, fail_count) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE
         fail_count = IF(window_started_at <= ?, 1, fail_count + 1),
         window_started_at = IF(window_started_at <= ?, ?, window_started_at)`,
      [eventId, now, windowStart, windowStart, now],
    );
  }

  async attemptsLeft(attendanceId: string): Promise<number> {
    const rows = await this.ds.query(
      'SELECT code_fail_count AS n, code_locked_until AS locked FROM attendances WHERE id = ?',
      [attendanceId],
    );
    if (!rows.length || rows[0].locked) return 0;
    return Math.max(0, CODE_MAX_FAILS - Number(rows[0].n));
  }
}
