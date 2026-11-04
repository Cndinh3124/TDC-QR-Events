// Test doc user-agent -> nhan "Trinh duyet · He dieu hanh" (khong can DB)
import { describeClient } from '../src/common/client-info';

describe('describeClient', () => {
  const cases: Array<[string, string, string]> = [
    ['Safari tren iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari 17 · iOS 17'],
    ['Chrome tren iPhone (CriOS)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1', 'Chrome 126 · iOS 16'],
    ['Chrome tren Android', 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 'Chrome 126 · Android 14'],
    ['Samsung Internet', 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36', 'Samsung Internet 24 · Android 13'],
    ['Edge tren Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87', 'Edge 126 · Windows'],
    ['Firefox tren macOS', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox 127 · macOS'],
    ['Opera', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0', 'Opera 111 · Windows'],
    ['Zalo in-app tren Android', 'Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Zalo/12.3', 'Zalo · Android 12'],
    ['Facebook in-app tren iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0.0]', 'Facebook · iOS 17'],
    ['Chrome tren Linux', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Chrome 126 · Linux'],
  ];
  it.each(cases)('%s', (_name, ua, expected) => {
    expect(describeClient(ua)).toBe(expected);
  });

  it('khong co user-agent thi tra null (thu cong / da qua han luu)', () => {
    for (const v of [null, undefined, '', '   ']) expect(describeClient(v)).toBeNull();
  });

  it('chuoi la hoac cong cu (curl, bot) -> "Khac", khong nem loi', () => {
    expect(describeClient('curl/8.4.0')).toBe('Khác · Khác');
    expect(describeClient('node-superagent/3.8.3')).toBe('Khác · Khác');
  });

  it('[BM] khong bao gio chua chuoi goc: user-agent chua noi dung doc hai thi dau ra van la nhan ngan', () => {
    const out = describeClient('<script>alert(1)</script> Chrome/999 "; DROP TABLE x; -- Android 99')!;
    expect(out).toBe('Chrome 999 · Android 99');
    expect(out).not.toMatch(/[<>"';]/);
    expect(describeClient('x'.repeat(5000))).toBe('Khác · Khác');
  });
});
