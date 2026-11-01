// Tham so + kieu tra ve cua man Tong quan va nhac viec - dac ta 3.6, 7, 10
import { IsOptional, IsUUID, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class OverviewQuery {
  // ngay theo gio Viet Nam; mac dinh 30 ngay gan nhat (ke ca hom nay)
  @IsOptional() @Matches(DAY, { message: 'from phải có dạng YYYY-MM-DD' })
  from?: string;

  @IsOptional() @Matches(DAY, { message: 'to phải có dạng YYYY-MM-DD' })
  to?: string;

  // khoa cua sinh vien (giong bao cao DRL)
  @IsOptional() @IsUUID()
  facultyUnitId?: string;

  @IsOptional() @IsUUID()
  eventId?: string;
}

export interface Compared {
  value: number;
  previous: number;
}

export interface LiveEvent {
  id: string;
  title: string;
  unitName: string | null;
  startAt: Date;
  endAt: Date;
  checkinCount: number;
  checkoutCount: number;
  onTimeCount: number;
  lateCount: number;
}

export interface RecentEvent {
  id: string;
  title: string;
  unitName: string | null;
  startAt: Date;
  status: string;
  attendanceCount: number;
}

export interface Overview {
  range: { from: string; to: string; days: number };
  kpis: {
    attendance: Compared;
    // null khi khong co luot nao trong ky
    onTimeRate: { value: number | null; previous: number | null };
    students: Compared;
    drl: Compared;
    // anh chup hien tai, khong phu thuoc khoang ngay
    pendingReview: number;
    openAppeals: number;
  };
  daily: Array<{ date: string; attendance: number; onTime: number }>;
  byFaculty: Array<{ facultyId: string; faculty: string; attendance: number; drl: number }>;
  live: LiveEvent[];
  recent: RecentEvent[];
}

export interface Reminders {
  pendingReview: Array<{ eventId: string; title: string; endAt: Date; status: string; pendingCount: number }>;
  appealsDue: Array<{
    appealId: string; eventId: string; eventTitle: string; mssv: string; fullName: string | null; deadlineAt: Date; overdue: boolean;
  }>;
}
