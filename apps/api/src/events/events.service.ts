// Quan ly su kien - dac ta 3.1, 3.2, 3.7 (bang Su kien), giai doan 2
// Luong moi thao tac: kiem tra quyen + pham vi -> kiem tra du lieu -> xu ly -> ghi nhat ky -> tra ket qua.
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Brackets, DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../common/current-user';
import { Page } from '../common/dto/pagination.dto';
import { appError, Err, isForeignKeyError } from '../common/errors';
import { escapeLike } from '../common/sql';
import { UnitScopeService } from '../common/unit-scope.service';
import { SettingsService } from '../settings/settings.service';
import { Unit } from '../units/entities/unit.entity';
import {
  CreateEventDto, DuplicateEventDto, EventDto, EventListQuery, eventAuditView, toEventDto, UpdateEventDto,
} from './dto/event.dto';
import { ControlLevel, Event, EventStatus, FacultyViewMode } from './entities/event.entity';
import { EventFacultyView } from './entities/event-faculty-view.entity';
import { QrPurpose } from './entities/event-qr-token.entity';
import { assertValidDrl, assertValidGeo, assertValidSchedule, hasCheckinStarted } from './event-rules';
import { EventQr, QrService } from './qr.service';
import { QrRenderService } from './qr-render.service';

// Du lieu da chuan hoa de ghi vao bang (khong con truong tuy chon)
interface EventInput {
  title: string;
  description: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
  startAt: Date;
  endAt: Date;
  checkinOpenAt: Date;
  checkinCloseAt: Date;
  graceMinutes: number;
  hasDrl: boolean;
  drlPoints: number | null;
  controlLevel: ControlLevel;
  requireCheckout: boolean;
}

// verifyCode chi co khi vua sinh / xoay: hien cho QTV dung mot lan (DB chi luu hash)
export type EventResult = EventDto & { verifyCode: string | null };

const STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: 'Nháp', PUBLISHED: 'Đã công bố', CHECKIN_OPEN: 'Đang mở điểm danh', CHECKIN_CLOSED: 'Đã đóng điểm danh',
  REVIEWING: 'Đang duyệt', FINALIZED: 'Đã chốt', CANCELLED: 'Đã hủy',
};
const DEFAULT_RADIUS_M = 100;
// truong anh huong ket qua diem danh / DRL: sua sau khi mo diem danh phai co ly do - dac ta 3.7
const SENSITIVE_KEYS = [
  'startAt', 'endAt', 'checkinOpenAt', 'checkinCloseAt', 'latitude', 'longitude', 'radiusM',
  'hasDrl', 'drlPoints', 'graceMinutes', 'controlLevel', 'requireCheckout',
] as const;

interface Transition {
  action: string;
  from: EventStatus[];
  to: EventStatus;
  reason?: string;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(Unit) private readonly units: Repository<Unit>,
    @InjectRepository(EventFacultyView) private readonly views: Repository<EventFacultyView>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scope: UnitScopeService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly qr: QrService,
    private readonly render: QrRenderService,
  ) {}

  // ---------- doc ----------

  // [BM] QTV truong thay tat ca; quan ly khoa chi thay su kien cua don vi minh va cap duoi
  async list(actor: CurrentUser, q: EventListQuery): Promise<Page<EventDto>> {
    const ids = await this.scope.visibleUnitIds(actor);
    const qb = this.events.createQueryBuilder('e').leftJoinAndSelect('e.unit', 'u');
    this.applyVisibility(qb, ids);
    if (q.unitId) qb.andWhere('e.unitId = :unitId', { unitId: q.unitId });
    if (q.status) qb.andWhere('e.status = :status', { status: q.status });
    if (q.q) qb.andWhere('e.title LIKE :q', { q: `%${escapeLike(q.q)}%` });
    if (q.from) qb.andWhere('e.startAt >= :from', { from: q.from });
    if (q.to) qb.andWhere('e.startAt <= :to', { to: q.to });
    // [NV] 10: "Dang hoat dong" / "Da huy" / "Luu tru"
    if (q.view === 'archived') qb.andWhere('e.archivedAt IS NOT NULL');
    else if (q.view === 'cancelled') qb.andWhere('e.archivedAt IS NULL AND e.status = :c', { c: 'CANCELLED' });
    else qb.andWhere('e.archivedAt IS NULL AND e.status <> :c', { c: 'CANCELLED' });

    const [rows, total] = await qb
      .orderBy('e.startAt', 'DESC').addOrderBy('e.id', 'ASC')
      .skip((q.page - 1) * q.limit).take(q.limit)
      .getManyAndCount();
    const now = new Date();
    const items = rows.map((r) => toEventDto(r, now, ids === null || ids.includes(r.unitId)));
    return { items, total, page: q.page, limit: q.limit };
  }

  // [NV] 2.2: ngoai su kien trong pham vi, quan ly khoa con thay su kien cap truong Doan truong cho xem (chi doc):
  // che do ALL, hoac SELECTED va co khoa nam trong pham vi cua ho. Alias: e = events, u = units cua don vi to chuc.
  private applyVisibility(qb: SelectQueryBuilder<Event>, ids: string[] | null): void {
    if (!ids) return;
    qb.andWhere(
      new Brackets((w) =>
        w.where('e.unitId IN (:...ids)', { ids }).orWhere(
          new Brackets((v) =>
            v.where('u.type = :school', { school: 'SCHOOL' }).andWhere(
              new Brackets((m) =>
                m.where('e.facultyViewMode = :all', { all: 'ALL' }).orWhere(
                  'e.facultyViewMode = :sel AND EXISTS (SELECT 1 FROM event_faculty_views fv WHERE fv.event_id = e.id AND fv.unit_id IN (:...ids))',
                  { sel: 'SELECTED' },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // id cac su kien nguoi dung duoc thay (manage hoac view); null = tat ca (QTV truong). Dung cho bao cao.
  async visibleEventIds(actor: CurrentUser): Promise<string[] | null> {
    const ids = await this.scope.visibleUnitIds(actor);
    if (!ids) return null;
    const qb = this.events.createQueryBuilder('e').leftJoin('e.unit', 'u').select('e.id', 'id');
    this.applyVisibility(qb, ids);
    return (await qb.getRawMany<{ id: string }>()).map((r) => r.id);
  }

  async get(actor: CurrentUser, id: string): Promise<EventDto> {
    const e = await this.events.findOne({ where: { id }, relations: { unit: true } });
    const access = e ? await this.access(actor, e) : 'none';
    if (!e || access === 'none') throw Err.notFound('sự kiện');
    // danh sach khoa duoc chon chi gui cho don vi to chuc, nguoi chi-xem khong thay khoa khac co ai
    const unitIds = access === 'manage' ? await this.sharedUnitIds(e) : null;
    return toEventDto(e, new Date(), access === 'manage', unitIds);
  }

  // [NV] chot-backend-hieu-nang.md muc 5: so dem truc tiep cho man theo doi, doc tu bang event_counters (khong dem lai bang diem danh).
  // Nguoi chi-xem cung doc duoc (chi la so tong, khong co du lieu sinh vien).
  async counters(actor: CurrentUser, id: string) {
    const e = await this.events.findOne({ where: { id } });
    if (!e || (await this.access(actor, e)) === 'none') throw Err.notFound('sự kiện');
    const [r] = await this.events.manager.query(
      `SELECT COALESCE(SUM(checkin_count), 0) AS checkinCount, COALESCE(SUM(checkout_count), 0) AS checkoutCount,
              COALESCE(SUM(on_time_count), 0) AS onTimeCount, COALESCE(SUM(late_count), 0) AS lateCount
         FROM event_counters WHERE event_id = ?`,
      [id],
    );
    return {
      checkinCount: Number(r.checkinCount), checkoutCount: Number(r.checkoutCount),
      onTimeCount: Number(r.onTimeCount), lateCount: Number(r.lateCount),
    };
  }

  // ---------- them / sua ----------

  async create(actor: CurrentUser, dto: CreateEventDto): Promise<EventResult> {
    // [NV] 2.1: bo trong don vi thi lay don vi cua nguoi tao (QTV truong -> su kien cap truong)
    const unitId = dto.unitId ?? actor.unitId;
    await this.assertUsableUnit(actor, unitId);
    const input = await this.buildInput(dto);
    return this.insertEvent(actor, unitId, input, 'EVENT_CREATE');
  }

  async update(actor: CurrentUser, id: string, dto: UpdateEventDto): Promise<EventResult> {
    const done = await this.ds.transaction(async (m) => {
      const e = await this.lockScoped(m, actor, id);
      this.assertEditable(e);
      const before = eventAuditView(e);
      const started = hasCheckinStarted(e, new Date());

      this.applyPatch(e, dto);
      const after = eventAuditView(e);
      const changed = SENSITIVE_KEYS.filter((k) => !same(before[k], after[k]));
      // [NV] 3.7: da mo diem danh ma sua gio / toa do / ban kinh / DRL thi bat buoc co ly do
      if (started && changed.length > 0 && !dto.reason) {
        throw Err.bad('REASON_REQUIRED', 'Sự kiện đã mở điểm danh: sửa giờ, vị trí, điểm rèn luyện hoặc mức kiểm soát phải nhập lý do.');
      }
      const verifyCode = this.qr.syncVerifyCode(e);
      await m.save(e);
      await this.qr.syncTokens(m, e);
      return { before, after, verifyCode };
    });
    // khong co gi doi thi khong ghi nhat ky (tranh nhieu)
    if (JSON.stringify(done.before) !== JSON.stringify(done.after) || done.verifyCode) {
      await this.audit.log(actor, 'EVENT_UPDATE', 'event', id, { before: done.before, after: done.after, reason: dto.reason });
    }
    return this.view(id, done.verifyCode);
  }

  // Nhan ban: chep thong tin tu su kien cu, chi can gio moi; giu nguyen khoang cach mo / dong diem danh
  async duplicate(actor: CurrentUser, id: string, dto: DuplicateEventDto): Promise<EventResult> {
    const src = await this.findScoped(this.events.manager, actor, id);
    await this.assertUsableUnit(actor, src.unitId);
    const openLead = src.startAt.getTime() - src.checkinOpenAt.getTime();
    const closeLag = src.checkinCloseAt.getTime() - src.endAt.getTime();
    const input: EventInput = {
      title: dto.title ?? `${src.title} (bản sao)`.slice(0, 200),
      description: src.description,
      locationName: src.locationName,
      latitude: src.latitude,
      longitude: src.longitude,
      radiusM: src.radiusM,
      startAt: dto.startAt,
      endAt: dto.endAt,
      checkinOpenAt: new Date(dto.startAt.getTime() - openLead),
      checkinCloseAt: new Date(dto.endAt.getTime() + closeLag),
      graceMinutes: src.graceMinutes,
      hasDrl: src.hasDrl,
      drlPoints: src.drlPoints,
      controlLevel: src.controlLevel,
      requireCheckout: src.requireCheckout,
    };
    assertValidSchedule(input);
    return this.insertEvent(actor, src.unitId, input, 'EVENT_DUPLICATE', { sourceEventId: id });
  }

  // ---------- vong doi ----------

  publish(actor: CurrentUser, id: string): Promise<EventResult> {
    return this.transition(actor, id, { action: 'EVENT_PUBLISH', from: ['DRAFT'], to: 'PUBLISHED' });
  }

  // [NV] 3.1: bam tay mo / dong luon duoc uu tien, khong bi gio tu dong ghi de
  open(actor: CurrentUser, id: string): Promise<EventResult> {
    return this.transition(actor, id, {
      action: 'EVENT_OPEN', from: ['PUBLISHED', 'CHECKIN_CLOSED'], to: 'CHECKIN_OPEN',
    });
  }

  close(actor: CurrentUser, id: string): Promise<EventResult> {
    return this.transition(actor, id, {
      action: 'EVENT_CLOSE', from: ['PUBLISHED', 'CHECKIN_OPEN'], to: 'CHECKIN_CLOSED',
    });
  }

  // tra ve che do tu dong theo khung gio (bo bam tay)
  auto(actor: CurrentUser, id: string): Promise<EventResult> {
    return this.transition(actor, id, {
      action: 'EVENT_AUTO', from: ['CHECKIN_OPEN', 'CHECKIN_CLOSED'], to: 'PUBLISHED',
    });
  }

  // [NV] 3.7: huy = khong cong DRL, QR vo hieu; khong hoan tac
  cancel(actor: CurrentUser, id: string, reason: string): Promise<EventResult> {
    return this.transition(actor, id, {
      action: 'EVENT_CANCEL',
      from: ['DRAFT', 'PUBLISHED', 'CHECKIN_OPEN', 'CHECKIN_CLOSED', 'REVIEWING'],
      to: 'CANCELLED',
      reason,
    });
  }

  // "Luu tru": an khoi danh sach, khoi phuc duoc - dac ta 3.7
  async archive(actor: CurrentUser, id: string, reason: string): Promise<EventResult> {
    return this.setArchived(actor, id, reason, true);
  }

  async restore(actor: CurrentUser, id: string, reason: string): Promise<EventResult> {
    return this.setArchived(actor, id, reason, false);
  }

  // [NV] 3.7: xoa cung chi khi chua co luot diem danh (giai doan 3: khoa ngoai RESTRICT se chan)
  async remove(actor: CurrentUser, id: string, reason: string): Promise<void> {
    let before: ReturnType<typeof eventAuditView>;
    try {
      before = await this.ds.transaction(async (m) => {
        const e = await this.lockScoped(m, actor, id);
        if (e.status === 'FINALIZED') {
          throw Err.conflict('EVENT_FINALIZED', 'Sự kiện đã chốt điểm rèn luyện, không thể xóa.');
        }
        await m.delete(Event, { id });
        return eventAuditView(e);
      });
    } catch (e) {
      if (isForeignKeyError(e)) {
        throw Err.conflict('EVENT_IN_USE', 'Sự kiện đã có lượt điểm danh, hãy dùng "Hủy sự kiện" hoặc "Lưu trữ".');
      }
      throw e;
    }
    await this.audit.log(actor, 'EVENT_DELETE', 'event', id, { before, reason });
  }

  // [NV] 2.2: chi QTV truong (controller). NONE / ALL / SELECTED (+ danh sach khoa); chi ap dung cho su kien cap truong
  async setFacultyView(
    actor: CurrentUser, id: string, mode: FacultyViewMode, unitIds: string[] | undefined, reason: string,
  ): Promise<EventDto> {
    const wanted = [...new Set(unitIds ?? [])].sort();
    if (mode === 'SELECTED' && wanted.length === 0) {
      throw Err.bad('FACULTIES_REQUIRED', 'Hãy chọn ít nhất một khoa được xem.');
    }
    if (mode !== 'SELECTED' && wanted.length > 0) {
      throw Err.bad('FACULTIES_NOT_ALLOWED', 'Chỉ chế độ "Chọn khoa" mới có danh sách khoa.');
    }
    const changed = await this.ds.transaction(async (m) => {
      const e = await this.lockScoped(m, actor, id);
      const current = await this.sharedUnitIds(e, m);
      if (e.facultyViewMode === mode && current.join() === wanted.join()) return null; // khong doi: khong ghi nhat ky
      if (mode !== 'NONE' && !(await this.isSchoolUnit(e.unitId))) {
        throw Err.bad('NOT_SCHOOL_EVENT', 'Chỉ sự kiện cấp trường mới có thể cho các khoa xem.');
      }
      await this.assertSelectableFaculties(wanted);
      const before = { facultyViewMode: e.facultyViewMode, facultyViewUnitIds: current };
      e.facultyViewMode = mode;
      await m.save(e);
      await m.delete(EventFacultyView, { eventId: id });
      if (wanted.length > 0) await m.insert(EventFacultyView, wanted.map((unitId) => ({ eventId: id, unitId, createdBy: actor.id })));
      return { before, after: { facultyViewMode: mode, facultyViewUnitIds: wanted } };
    });
    if (changed) await this.audit.log(actor, 'EVENT_FACULTY_VIEW', 'event', id, { ...changed, reason });
    return this.get(actor, id);
  }

  // ---------- ma QR / ma 4 so ----------

  async getQr(actor: CurrentUser, id: string): Promise<EventQr & { hasVerifyCode: boolean }> {
    const e = await this.findScoped(this.events.manager, actor, id);
    return { ...(await this.qr.getActive(this.events.manager, id)), hasVerifyCode: e.verifyCodeHash !== null };
  }

  // [NV] 3.2: "Tao ma moi" - ma cu het hieu luc ngay
  async rotateQr(actor: CurrentUser, id: string, purpose: QrPurpose, reason: string): Promise<EventQr> {
    await this.ds.transaction(async (m) => {
      const e = await this.lockScoped(m, actor, id);
      this.assertQrChangeable(e);
      if (purpose === 'CHECKOUT' && !e.requireCheckout) {
        throw Err.conflict('CHECKOUT_DISABLED', 'Sự kiện này không bật điểm danh ra.');
      }
      await this.qr.rotate(m, id, purpose);
    });
    // [BM] nhat ky khong chua token
    await this.audit.log(actor, 'EVENT_QR_ROTATE', 'event', id, { after: { purpose }, reason });
    return this.qr.getActive(this.events.manager, id);
  }

  async rotateVerifyCode(actor: CurrentUser, id: string, reason: string): Promise<{ verifyCode: string }> {
    const verifyCode = await this.ds.transaction(async (m) => {
      const e = await this.lockScoped(m, actor, id);
      this.assertQrChangeable(e);
      if (e.controlLevel !== 'TIGHT') {
        throw Err.conflict('NOT_TIGHT', 'Chỉ sự kiện mức kiểm soát "Chặt" mới có mã 4 số.');
      }
      const code = this.qr.rotateVerifyCode(e);
      await m.save(e);
      return code;
    });
    await this.audit.log(actor, 'EVENT_CODE_ROTATE', 'event', id, { reason }); // [BM] khong ghi ma
    return { verifyCode };
  }

  async qrFile(actor: CurrentUser, id: string, purpose: QrPurpose, format: 'png' | 'pdf'): Promise<Buffer> {
    const e = await this.findScoped(this.events.manager, actor, id);
    const info = (await this.qr.getActive(this.events.manager, id))[purpose === 'CHECKIN' ? 'checkin' : 'checkout'];
    if (!info) throw Err.notFound('mã QR đang hiệu lực');
    if (format === 'png') return this.render.png(info.url);
    return this.render.pdf({
      url: info.url, purpose, title: e.title, startAt: e.startAt, endAt: e.endAt, locationName: e.locationName,
    });
  }

  // ---------- noi bo ----------

  private async insertEvent(
    actor: CurrentUser, unitId: string, input: EventInput, action: string, extra: object = {},
  ): Promise<EventResult> {
    const id = randomUUID(); // tu dat id de tinh hash ma 4 so truoc khi luu
    const { after, verifyCode } = await this.ds.transaction(async (m) => {
      const e = m.create(Event, {
        ...input, id, unitId, status: 'DRAFT', verifyCodeHash: null, facultyViewMode: 'NONE', cancelReason: null, archivedAt: null, createdBy: actor.id,
      });
      const code = this.qr.syncVerifyCode(e);
      await m.save(e);
      await this.qr.syncTokens(m, e);
      return { after: eventAuditView(e), verifyCode: code };
    });
    await this.audit.log(actor, action, 'event', id, { before: Object.keys(extra).length ? extra : undefined, after });
    return this.view(id, verifyCode);
  }

  // Doi trang thai co khoa dong: tranh hai thao tac (mo / huy...) chay chong nhau
  private async transition(actor: CurrentUser, id: string, t: Transition): Promise<EventResult> {
    const { before, after } = await this.ds.transaction(async (m) => {
      const e = await this.lockScoped(m, actor, id);
      if (e.archivedAt) throw Err.conflict('EVENT_ARCHIVED', 'Sự kiện đang được lưu trữ, hãy khôi phục trước.');
      if (!t.from.includes(e.status)) {
        throw Err.conflict('INVALID_STATE', `Không thể thực hiện khi sự kiện đang ở trạng thái "${STATUS_LABEL[e.status]}".`);
      }
      const prev = eventAuditView(e);
      e.status = t.to;
      if (t.to === 'CANCELLED') {
        e.cancelReason = t.reason ?? null;
        await this.qr.deactivate(m, id); // [NV] 3.7: huy -> QR vo hieu
      }
      await m.save(e);
      return { before: prev, after: eventAuditView(e) };
    });
    await this.audit.log(actor, t.action, 'event', id, { before, after, reason: t.reason });
    return this.view(id);
  }

  private async setArchived(actor: CurrentUser, id: string, reason: string, archive: boolean): Promise<EventResult> {
    const { before, after } = await this.ds.transaction(async (m) => {
      const e = await this.lockScoped(m, actor, id);
      if (archive && e.archivedAt) throw Err.conflict('ALREADY_ARCHIVED', 'Sự kiện đã được lưu trữ.');
      if (!archive && !e.archivedAt) throw Err.conflict('NOT_ARCHIVED', 'Sự kiện chưa được lưu trữ.');
      const prev = eventAuditView(e);
      e.archivedAt = archive ? new Date() : null;
      await m.save(e);
      return { before: prev, after: eventAuditView(e) };
    });
    await this.audit.log(actor, archive ? 'EVENT_ARCHIVE' : 'EVENT_RESTORE', 'event', id, { before, after, reason });
    return this.view(id);
  }

  // Ap dung ban sua len entity (da khoa): gan -> chuan hoa -> kiem tra lai toan bo
  private applyPatch(e: Event, dto: UpdateEventDto): void {
    if (dto.title !== undefined) e.title = dto.title;
    if (dto.description !== undefined) e.description = dto.description || null;
    if (dto.locationName !== undefined) e.locationName = dto.locationName || null;
    if (dto.latitude !== undefined) e.latitude = dto.latitude;
    if (dto.longitude !== undefined) e.longitude = dto.longitude;
    if (dto.radiusM !== undefined) e.radiusM = dto.radiusM;
    // xoa toa do thi xoa luon ban kinh (neu khong gui ban kinh rieng)
    if (dto.latitude === null && dto.longitude === null && dto.radiusM === undefined) e.radiusM = null;
    this.completeGeo(e);
    assertValidGeo(e.latitude, e.longitude, e.radiusM);

    if (dto.startAt !== undefined) e.startAt = dto.startAt;
    if (dto.endAt !== undefined) e.endAt = dto.endAt;
    if (dto.checkinOpenAt !== undefined) e.checkinOpenAt = dto.checkinOpenAt;
    if (dto.checkinCloseAt !== undefined) e.checkinCloseAt = dto.checkinCloseAt;
    if (dto.graceMinutes !== undefined) e.graceMinutes = dto.graceMinutes;
    assertValidSchedule(e);

    if (dto.hasDrl !== undefined) e.hasDrl = dto.hasDrl;
    if (dto.drlPoints !== undefined) e.drlPoints = dto.drlPoints;
    else if (dto.hasDrl === false) e.drlPoints = null; // tat DRL thi bo diem
    assertValidDrl(e.hasDrl, e.drlPoints);

    if (dto.controlLevel !== undefined) e.controlLevel = dto.controlLevel;
    if (dto.requireCheckout !== undefined) e.requireCheckout = dto.requireCheckout;
    this.applyControl(e, dto.requireCheckout);
  }

  // [NV] 5.2: muc Chat bat buoc co diem danh ra
  private applyControl(e: { controlLevel: ControlLevel; requireCheckout: boolean }, requested?: boolean): void {
    if (e.controlLevel !== 'TIGHT') return;
    if (requested === false) {
      throw Err.bad('TIGHT_REQUIRES_CHECKOUT', 'Mức kiểm soát "Chặt" bắt buộc có điểm danh ra.');
    }
    e.requireCheckout = true;
  }

  // co toa do nhung thieu ban kinh thi dung ban kinh mac dinh
  private completeGeo(e: { latitude: number | null; longitude: number | null; radiusM: number | null }): void {
    if (e.latitude !== null && e.longitude !== null && e.radiusM === null) e.radiusM = DEFAULT_RADIUS_M;
  }

  // Gop gia tri nguoi dung nhap voi mac dinh (cau hinh he thong) va kiem tra
  private async buildInput(dto: CreateEventDto): Promise<EventInput> {
    const [openBefore, grace] = await Promise.all([
      this.settings.get<number>('default_open_before_min'),
      this.settings.get<number>('default_grace_min'),
    ]);
    const drlPoints = dto.drlPoints ?? null;
    assertValidDrl(dto.hasDrl, drlPoints);
    // [NV] 5.2: DRL >= 5 thi mac dinh muc Chat (nguoi tao van chon lai duoc)
    const controlLevel = dto.controlLevel ?? (drlPoints !== null && drlPoints >= 5 ? 'TIGHT' : 'NORMAL');
    const control = { controlLevel, requireCheckout: dto.requireCheckout ?? false };
    this.applyControl(control, dto.requireCheckout);

    const geo = { latitude: dto.latitude ?? null, longitude: dto.longitude ?? null, radiusM: dto.radiusM ?? null };
    this.completeGeo(geo);
    assertValidGeo(geo.latitude, geo.longitude, geo.radiusM);

    const times = {
      startAt: dto.startAt,
      endAt: dto.endAt,
      checkinOpenAt: dto.checkinOpenAt ?? new Date(dto.startAt.getTime() - openBefore * 60_000),
      checkinCloseAt: dto.checkinCloseAt ?? dto.endAt,
    };
    assertValidSchedule(times);

    return {
      title: dto.title,
      description: dto.description || null,
      locationName: dto.locationName || null,
      ...geo,
      ...times,
      graceMinutes: dto.graceMinutes ?? grace,
      hasDrl: dto.hasDrl,
      drlPoints,
      ...control,
    };
  }

  // [BM] don vi phai nam trong pham vi cua nguoi tao, ton tai va con hoat dong
  private async assertUsableUnit(actor: CurrentUser, unitId: string): Promise<void> {
    await this.scope.assertCanAccessUnit(actor, unitId);
    const unit = await this.units.findOne({ where: { id: unitId } });
    if (!unit) throw Err.notFound('đơn vị');
    if (!unit.isActive) throw Err.bad('UNIT_INACTIVE', 'Đơn vị đã ngừng hoạt động, không thể tạo sự kiện.');
  }

  private assertEditable(e: Event): void {
    if (e.archivedAt) throw Err.conflict('EVENT_ARCHIVED', 'Sự kiện đang được lưu trữ, hãy khôi phục trước khi sửa.');
    if (e.status === 'CANCELLED') throw Err.conflict('EVENT_CANCELLED', 'Sự kiện đã hủy, không thể sửa.');
    if (e.status === 'FINALIZED') throw Err.conflict('EVENT_FINALIZED', 'Sự kiện đã chốt, cần Đoàn trường mở khóa mới sửa được.');
  }

  private assertQrChangeable(e: Event): void {
    if (e.status === 'CANCELLED') throw Err.conflict('EVENT_CANCELLED', 'Sự kiện đã hủy, mã QR không còn hiệu lực.');
    if (e.status === 'FINALIZED') throw Err.conflict('EVENT_FINALIZED', 'Sự kiện đã chốt, không thể đổi mã.');
  }

  // 'manage' = trong pham vi don vi (sua duoc); 'view' = su kien cap truong duoc cho phep xem (chi doc); 'none' = khong thay
  async access(actor: CurrentUser, e: Event): Promise<'manage' | 'view' | 'none'> {
    if (await this.scope.canAccessUnit(actor, e.unitId)) return 'manage';
    // [BM] phai la su kien cap truong that su, de co "bat nham" tren su kien khoa khac van khong lo
    if (e.facultyViewMode === 'NONE' || !(await this.isSchoolUnit(e.unitId))) return 'none';
    if (e.facultyViewMode === 'ALL') return 'view';
    // SELECTED: chi khi co khoa duoc chon nam trong pham vi (khoa hoac cap duoi) cua nguoi xem
    const mine = await this.scope.visibleUnitIds(actor);
    if (!mine) return 'view';
    return (await this.views.count({ where: { eventId: e.id, unitId: In(mine) } })) > 0 ? 'view' : 'none';
  }

  // danh sach id khoa duoc chon (da sap xep); rong neu che do khac SELECTED
  private async sharedUnitIds(e: Event, m: EntityManager = this.events.manager): Promise<string[]> {
    if (e.facultyViewMode !== 'SELECTED') return [];
    const rows = await m.find(EventFacultyView, { where: { eventId: e.id }, select: ['unitId'] });
    return rows.map((r) => r.unitId).sort();
  }

  // chi chon duoc khoa that (loai FACULTY); Doan truong luon co quyen nen khong nam trong danh sach
  private async assertSelectableFaculties(unitIds: string[]): Promise<void> {
    if (unitIds.length === 0) return;
    const found = await this.units.count({ where: { id: In(unitIds), type: 'FACULTY' } });
    if (found !== unitIds.length) throw Err.bad('INVALID_FACULTY', 'Có đơn vị không tồn tại hoặc không phải khoa.');
  }

  private async isSchoolUnit(unitId: string): Promise<boolean> {
    return (await this.units.findOne({ where: { id: unitId }, select: ['type'] }))?.type === 'SCHOOL';
  }

  // [BM] ngoai pham vi hoac khong ton tai deu tra 404 (khong lo su ton tai) - quy uoc cua du an.
  // Rieng su kien cap truong da duoc chia se: nguoi xem biet no ton tai nen tra 403 (chi duoc xem).
  private async requireManage(actor: CurrentUser, e: Event | null): Promise<Event> {
    if (!e) throw Err.notFound('sự kiện');
    const access = await this.access(actor, e);
    if (access === 'manage') return e;
    if (access === 'view') throw appError(403, 'READ_ONLY_EVENT', 'Bạn chỉ được xem sự kiện cấp trường này, không được thay đổi.');
    throw Err.notFound('sự kiện');
  }

  async findScoped(m: EntityManager, actor: CurrentUser, id: string): Promise<Event> {
    return this.requireManage(actor, await m.findOne(Event, { where: { id } }));
  }

  async lockScoped(m: EntityManager, actor: CurrentUser, id: string): Promise<Event> {
    return this.requireManage(actor, await m.findOne(Event, { where: { id }, lock: { mode: 'pessimistic_write' } }));
  }

  private load(id: string): Promise<Event> {
    return this.events.findOneOrFail({ where: { id }, relations: { unit: true } });
  }

  private async view(id: string, verifyCode: string | null = null): Promise<EventResult> {
    const e = await this.load(id);
    return { ...toEventDto(e, new Date(), true, await this.sharedUnitIds(e)), verifyCode };
  }
}

// so sanh gia tri trong ban ghi nhat ky (Date so theo thoi diem)
function same(a: unknown, b: unknown): boolean {
  return (a instanceof Date ? a.getTime() : a) === (b instanceof Date ? b.getTime() : b);
}
