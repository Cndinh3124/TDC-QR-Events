// Bien doi dau vao dung chung cho DTO (them module moi dung, khong dong vao DTO cu)
// chuoi mot dong: bo ky tu dieu khien, gom khoang trang - dac ta 8.3
export const line = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim() : value;

// van ban nhieu dong: chi giu xuong dong
export const text = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/(?![\t\n\r])\p{Cc}/gu, '').trim() : value;

// [BM] bat buoc ISO 8601 co mui gio de gio khong bi hieu lech
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
export const isoDate = ({ value }: { value: unknown }) =>
  typeof value === 'string' && ISO_WITH_ZONE.test(value) ? new Date(value) : value;
export const DATE_MSG = 'Thời gian phải theo dạng ISO 8601 kèm múi giờ, ví dụ 2026-11-05T08:00:00+07:00';

// chuoi rong -> null (o nhap de trong), dung cho truong tuy chon co the xoa
export const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : value);
