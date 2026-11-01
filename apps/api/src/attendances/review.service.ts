// Bat dau duyet, chot su kien (cong DRL) va mo khoa - dac ta 3.6
// Luong: kiem tra quyen + pham vi -> kiem tra trang thai -> xu ly trong giao dich -> ghi nhat ky.
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { appError, Err } from '../common/errors';
import { Event } from '../events/entities/event.entity';
import { checkinState } from '../events/event-rules';
import { EventsService } from '../events/events.service';

export interface FinalizeResult {
  status: 'FINALIZED';
  awardedCount: number;
  totalDrl: number;
}

@Injectable()
export class ReviewService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  // [NV] 3.6: dong diem danh xong thi vao giai doan duyet; tinh co NO_CHECKOUT
  async startReview(actor: CurrentUser, eventId: string): Promise<{ status: 'REVIEWING' }> {
    const changed = await this.ds.transaction(async (m) => {
      const e = await this.events.lockScoped(m, actor, eventId);
      this.assertNotLocked(e);
      if (e.status === 'REVIEWING') return false;
      await this.startIfNeeded(m, e);
      return true;
    });
    if (changed) await this.audit.log(actor, 'EVENT_REVIEW_START', 'event', eventId, {});
    return { status: 'REVIEWING' };
  }

  // Goi trong giao dich da khoa su kien: dua ve REVIEWING neu chua (thao tac duyet dau tien tu bat dau).
  // Tra true neu vua chuyen trang thai.
  async startIfNeeded(m: EntityManager, e: Event): Promise<boolean> {
    if (e.status === 'REVIEWING') return false;
    if (checkinState(e, new Date()) !== 'CLOSED') {
      throw Err.conflict('CHECKIN_STILL_OPEN', 'Sự kiện chưa đóng điểm danh, chưa thể duyệt. Hãy đóng điểm danh trước.');
    }
    e.status = 'REVIEWING';
    await m.save(e);
    if (e.requireCheckout) {
      // [NV] 5.3: bat buoc diem danh ra ma khong co luot ra -> co NO_CHECKOUT (chi them, khong tu xoa)
      await m.query(
        `INSERT IGNORE INTO attendance_flags (attendance_id, code, detail_json)
         SELECT id, 'NO_CHECKOUT', NULL FROM attendances WHERE event_id = ? AND checkout_at IS NULL AND voided_at IS NULL`,
        [e.id],
      );
    }
    return true;
  }

  // [NV] 3.6: chot = khoa du lieu + ghi nhan DRL. Phai duyet het luot cho (khong con PENDING).
  async finalize(actor: CurrentUser, eventId: string): Promise<FinalizeResult> {
    const result = await this.ds.transaction(async (m) => {
      const e = await this.events.lockScoped(m, actor, eventId);
      this.assertNotLocked(e);
      await this.startIfNeeded(m, e);
      const [{ n }] = await m.query(
        "SELECT COUNT(*) AS n FROM attendances WHERE event_id = ? AND review_status = 'PENDING' AND voided_at IS NULL",
        [eventId],
      );
      if (Number(n) > 0) {
        throw appError(409, 'PENDING_LEFT', `Còn ${Number(n)} lượt chưa duyệt. Hãy duyệt hoặc từ chối hết trước khi chốt.`);
      }
      const res = await this.awardAll(m, e);
      e.status = 'FINALIZED';
      await m.save(e);
      return res;
    });
    await this.audit.log(actor, 'EVENT_FINALIZE', 'event', eventId, { after: result });
    return { status: 'FINALIZED', ...result };
  }

  // [NV] 3.6: sau khi chot chi Doan truong mo khoa (co ly do); diem cu bi huy, chot lai se tinh lai
  async unlock(actor: CurrentUser, eventId: string, reason: string): Promise<{ status: 'REVIEWING' }> {
    await this.ds.transaction(async (m) => {
      const e = await this.events.lockScoped(m, actor, eventId);
      if (e.status !== 'FINALIZED') throw Err.conflict('NOT_FINALIZED', 'Sự kiện chưa được chốt.');
      await m.query('UPDATE attendances SET drl_awarded = NULL WHERE event_id = ?', [eventId]);
      e.status = 'REVIEWING';
      await m.save(e);
    });
    await this.audit.log(actor, 'EVENT_UNLOCK', 'event', eventId, { reason });
    return { status: 'REVIEWING' };
  }

  // Tinh lai DRL cho ca su kien. Luot du dieu kien: da duyet, khong huy, (neu bat buoc) co diem danh ra.
  // [NV] 3.6: moi sinh vien chi nhan MOT lan cho mot su kien (luot som nhat); MSSV da gop tinh la cung mot nguoi.
  async awardAll(m: EntityManager, e: Event): Promise<{ awardedCount: number; totalDrl: number }> {
    if (!e.hasDrl || e.drlPoints === null) {
      await m.query('UPDATE attendances SET drl_awarded = NULL WHERE event_id = ?', [e.id]);
      return { awardedCount: 0, totalDrl: 0 };
    }
    await m.query('UPDATE attendances SET drl_awarded = 0 WHERE event_id = ?', [e.id]);
    await m.query(
      `UPDATE attendances a JOIN (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY canon ORDER BY checkin_at, id) AS rn FROM (
           SELECT a2.id, a2.checkin_at, COALESCE(s.merged_into, a2.mssv) AS canon
             FROM attendances a2 LEFT JOIN students s ON s.mssv = a2.mssv
            WHERE a2.event_id = ? AND a2.review_status = 'APPROVED' AND a2.voided_at IS NULL
              AND (? = 0 OR a2.checkout_at IS NOT NULL)
         ) q
       ) r ON r.id = a.id
       SET a.drl_awarded = ? WHERE r.rn = 1`,
      [e.id, e.requireCheckout ? 1 : 0, e.drlPoints],
    );
    const [{ n }] = await m.query('SELECT COUNT(*) AS n FROM attendances WHERE event_id = ? AND drl_awarded > 0', [e.id]);
    return { awardedCount: Number(n), totalDrl: Number(n) * e.drlPoints };
  }

  // Dung khi xu ly khieu nai o su kien DA CHOT: tinh DRL cho mot luot, van giu luat "mot lan moi sinh vien"
  async awardOne(m: EntityManager, e: Event, attendanceId: string): Promise<void> {
    if (!e.hasDrl || e.drlPoints === null) return;
    const [row] = await m.query(
      `SELECT a.id, a.review_status AS st, a.voided_at AS voided, a.checkout_at AS co, COALESCE(s.merged_into, a.mssv) AS canon
         FROM attendances a LEFT JOIN students s ON s.mssv = a.mssv WHERE a.id = ? AND a.event_id = ?`,
      [attendanceId, e.id],
    );
    if (!row) return;
    const qualified = row.st === 'APPROVED' && !row.voided && (!e.requireCheckout || row.co !== null);
    let points = qualified ? e.drlPoints : 0;
    if (points > 0) {
      const [{ n }] = await m.query(
        `SELECT COUNT(*) AS n FROM attendances a LEFT JOIN students s ON s.mssv = a.mssv
          WHERE a.event_id = ? AND a.id <> ? AND a.drl_awarded > 0 AND COALESCE(s.merged_into, a.mssv) = ?`,
        [e.id, attendanceId, row.canon],
      );
      if (Number(n) > 0) points = 0;
    }
    await m.query('UPDATE attendances SET drl_awarded = ? WHERE id = ?', [points, attendanceId]);
  }

  private assertNotLocked(e: Event): void {
    if (e.archivedAt) throw Err.conflict('EVENT_ARCHIVED', 'Sự kiện đang được lưu trữ, hãy khôi phục trước.');
    if (e.status === 'CANCELLED') throw Err.conflict('EVENT_CANCELLED', 'Sự kiện đã hủy.');
    if (e.status === 'FINALIZED') throw Err.conflict('EVENT_FINALIZED', 'Sự kiện đã chốt, cần Đoàn trường mở khóa mới thay đổi được.');
    if (e.status === 'DRAFT') throw Err.conflict('INVALID_STATE', 'Sự kiện còn là bản nháp, chưa có điểm danh.');
  }
}
