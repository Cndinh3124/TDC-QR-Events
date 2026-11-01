// Ham tro giup SQL dung chung

// [BM] thoat ky tu dac biet cua LIKE de tim kiem khong bi doi nghia
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}
