// Luat chan cung theo vi tri khi diem danh - dac ta 5.3 (doi tu "gan co" sang "chan" theo yeu cau 01/11/2026).
// Su kien co toa do + ban kinh: bat buoc co GPS du tin cay va nam trong ban kinh, nguoc lai tu choi diem danh.
import { Err } from '../common/errors';
import { Event } from '../events/entities/event.entity';
import { haversineM } from './flag-rules';
import { GPS_LOW_ACCURACY_M } from './public.constants';

export interface GpsInput {
  lat?: number;
  lng?: number;
  accuracyM?: number;
}

// tra khoang cach (met) de luu vao luot diem danh; null khi su kien khong yeu cau GPS
export function assertInsideRadius(event: Event, gps: GpsInput): number | null {
  if (event.latitude === null || event.longitude === null || event.radiusM === null) return null;

  if (gps.lat === undefined || gps.lng === undefined || gps.accuracyM === undefined) {
    throw Err.bad('GPS_REQUIRED', 'Sự kiện này yêu cầu vị trí. Hãy cho phép trình duyệt truy cập vị trí rồi thử lại.');
  }
  // sai so lon thi khoang cach tinh ra khong dang tin (nhat la trong nha)
  if (gps.accuracyM > GPS_LOW_ACCURACY_M) {
    throw Err.bad('GPS_LOW_ACCURACY', 'Vị trí chưa đủ chính xác. Hãy ra nơi thoáng, bật GPS rồi thử lại.');
  }
  const distance = haversineM(gps.lat, gps.lng, event.latitude, event.longitude);
  // [BM] khong tra khoang cach / toa do: co so do chinh xac se cho phep do nguoc vi tri su kien tu xa
  if (distance > event.radiusM) {
    throw Err.bad('GPS_OUTSIDE', 'Bạn đang ngoài khu vực điểm danh của sự kiện.');
  }
  return distance;
}
