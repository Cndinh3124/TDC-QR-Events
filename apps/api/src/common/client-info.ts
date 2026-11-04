// Doc user-agent thanh nhan ngan "Trinh duyet phien ban · He dieu hanh" de nguoi duyet nhin ra bat thuong.
// [BM] chi tra nhan da rut gon, khong bao gio tra chuoi user-agent goc (co the dai, co noi dung tuy y do client gui).
// Khong phan biet duoc doi may / hang may: user-agent khong chua thong tin do.

const major = (m: RegExpMatchArray | null): string => (m ? ` ${m[1]}` : '');

function browserOf(ua: string): string {
  // thu tu quan trong: cac trinh duyet dua tren Chromium / WebKit van ghi "Chrome" hoac "Safari" trong chuoi
  if (/Zalo/i.test(ua)) return 'Zalo';
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/EdgA?\/|EdgiOS\//.test(ua)) return `Edge${major(ua.match(/Edg(?:A|iOS)?\/(\d+)/))}`;
  if (/OPR\/|OPT\//.test(ua)) return `Opera${major(ua.match(/OP[RT]\/(\d+)/))}`;
  if (/SamsungBrowser\//.test(ua)) return `Samsung Internet${major(ua.match(/SamsungBrowser\/(\d+)/))}`;
  if (/Firefox\/|FxiOS\//.test(ua)) return `Firefox${major(ua.match(/(?:Firefox|FxiOS)\/(\d+)/))}`;
  if (/Chrome\/|CriOS\//.test(ua)) return `Chrome${major(ua.match(/(?:Chrome|CriOS)\/(\d+)/))}`;
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return `Safari${major(ua.match(/Version\/(\d+)/))}`;
  return 'Khác';
}

function osOf(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return `iOS${major(ua.match(/OS (\d+)[_\d]*/))}`;
  if (/Android/.test(ua)) return `Android${major(ua.match(/Android (\d+)/))}`;
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Khác';
}

// null khi khong co user-agent (luot them thu cong, hoac da bi xoa sau thoi han luu tru)
export function describeClient(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? '').trim();
  if (!ua) return null;
  return `${browserOf(ua)} · ${osOf(ua)}`;
}
