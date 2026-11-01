// Kiem thu tai diem danh cong khai bang k6 - chot-backend-hieu-nang.md muc 9, dac ta 11
// Kich ban: (1) 2.000 sinh vien ao vao trong 3 phut; (2) dot dinh 100 luot/giay trong 1 phut, ngay sau do.
// Moi lan lap la mot sinh vien moi (cookie rieng, MSSV rieng) nen khong dung vao luat 1 thiet bi / 1 luot.
// Chay: xem loadtest/README.md. CHI chay vao may chu thu nghiem, khong chay vao he thong dang dung that.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TOKEN = __ENV.TOKEN; // token QR cua su kien da mo; bo trong thi setup() tu tao su kien (can ADMIN_EMAIL / ADMIN_PASSWORD)
const STUDENTS = Number(__ENV.STUDENTS || 2000);
const SPREAD_SEC = Number(__ENV.SPREAD_SEC || 170); // rai deu luot vao trong ngan nay giay
const PEAK_RATE = Number(__ENV.PEAK_RATE || 100);
const PEAK_SEC = Number(__ENV.PEAK_SEC || 60);
const PEAK_START_SEC = SPREAD_SEC + 20;

const rejected = new Counter('checkin_rejected'); // 4xx / 5xx tra ve tu /checkin (khong tinh 201)
const limited = new Counter('checkin_rate_limited'); // rieng 429

export const options = {
  scenarios: {
    sustained: {
      executor: 'per-vu-iterations',
      vus: STUDENTS,
      iterations: 1,
      maxDuration: `${SPREAD_SEC + 60}s`,
      exec: 'student',
    },
    peak: {
      executor: 'constant-arrival-rate',
      rate: PEAK_RATE,
      timeUnit: '1s',
      duration: `${PEAK_SEC}s`,
      startTime: `${PEAK_START_SEC}s`,
      preAllocatedVUs: Math.ceil(PEAK_RATE * 2),
      maxVUs: PEAK_RATE * 6,
      exec: 'student',
    },
  },
  thresholds: {
    // muc tieu: p95 < 500 ms, khong mat luot
    'http_req_duration{name:checkin}': ['p(95)<500'],
    'http_req_duration{name:by-token}': ['p(95)<500'],
    checkin_rejected: ['count==0'],
    http_req_failed: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const json = { 'Content-Type': 'application/json' };

export function setup() {
  if (TOKEN) {
    const faculty = http.get(`${BASE}/api/public/units`).json()[0];
    return { token: TOKEN, facultyUnitId: faculty.id };
  }
  const email = __ENV.ADMIN_EMAIL;
  const password = __ENV.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Can TOKEN, hoac ADMIN_EMAIL + ADMIN_PASSWORD de tu tao su kien thu.');
  const login = http.post(`${BASE}/api/admin/auth/login`, JSON.stringify({ email, password }), { headers: json });
  if (login.status !== 200) throw new Error(`Dang nhap that bai (${login.status})`);
  const auth = { headers: { ...json, Authorization: `Bearer ${login.json('accessToken')}` } };

  // su kien KHONG co toa do (neu co thi GPS bat buoc) va khong bat diem danh ra; gio bat dau sau 1 gio de moi luot deu dung gio
  const now = Date.now();
  const ev = http.post(`${BASE}/api/admin/events`, JSON.stringify({
    title: `Kiem thu tai ${new Date(now).toISOString()}`, hasDrl: false,
    startAt: new Date(now + 3600e3).toISOString(), endAt: new Date(now + 3 * 3600e3).toISOString(),
    controlLevel: 'NORMAL', requireCheckout: false,
  }), auth);
  if (ev.status !== 201) throw new Error(`Tao su kien that bai (${ev.status}): ${ev.body}`);
  const id = ev.json('id');
  for (const step of ['publish', 'open']) {
    const r = http.post(`${BASE}/api/admin/events/${id}/${step}`, null, auth);
    if (r.status !== 200) throw new Error(`${step} that bai (${r.status}): ${r.body}`);
  }
  const qr = http.get(`${BASE}/api/admin/events/${id}/qr`, auth);
  const faculty = http.get(`${BASE}/api/public/units`).json()[0];
  console.log(`Su kien thu: ${id} - nho huy hoac xoa du lieu sau khi do.`);
  return { token: qr.json('checkin.token'), facultyUnitId: faculty.id, eventId: id };
}

// n -> MSSV hop le va duy nhat (5 so + 2 chu + 4 so)
function mssv(n) {
  return `${24211 + Math.floor(n / 10000)}TM${String(n % 10000).padStart(4, '0')}`;
}

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function student(data) {
  // dot dinh bat dau sau khi rai xong; chia khong gian MSSV de hai kich ban khong trung nhau
  const n = exec.scenario.name === 'peak' ? STUDENTS + exec.scenario.iterationInTest : exec.scenario.iterationInTest;
  if (exec.scenario.name === 'sustained') sleep(Math.random() * SPREAD_SEC);

  // cookie rieng moi lan lap (VU duoc dung lai o kich ban dot dinh nhung phai la "may moi")
  const jar = new http.CookieJar();

  // B1: quet QR -> mo trang, nhan ma thiet bi
  const page = http.get(`${BASE}/api/public/events/by-token/${data.token}`, { jar, tags: { name: 'by-token' } });
  check(page, { 'by-token 200': (r) => r.status === 200 });

  // B2: nhap form, bam diem danh
  const res = http.post(`${BASE}/api/public/checkin`, JSON.stringify({
    token: data.token, idempotencyKey: uuid4(), mssv: mssv(n), fullName: `Sinh Vien ${n}`, facultyUnitId: data.facultyUnitId,
  }), { headers: json, jar, tags: { name: 'checkin' } });
  const ok = check(res, { 'checkin 201': (r) => r.status === 201 });
  if (!ok) {
    rejected.add(1);
    if (res.status === 429) limited.add(1);
    if (__ENV.DEBUG) console.log(`checkin ${res.status}: ${res.body}`);
  }
}

// luu ket qua de so sanh giua cac lan chay (CI co the dinh kem tep nay)
export function handleSummary(data) {
  const out = __ENV.SUMMARY_FILE || 'loadtest/results/summary.json';
  return { [out]: JSON.stringify(data, null, 2), stdout: textSummary(data) };
}

function textSummary(data) {
  const m = (name, stat) => {
    const v = data.metrics[name] && data.metrics[name].values[stat];
    return v === undefined ? 'n/a' : v.toFixed ? v.toFixed(1) : v;
  };
  const lines = [
    '',
    `Luot checkin gui di : ${data.metrics['http_reqs'] ? data.metrics['http_reqs'].values.count : 0} request (ca by-token)`,
    `checkin p95 / p99   : ${m('http_req_duration{name:checkin}', 'p(95)')} ms / ${m('http_req_duration{name:checkin}', 'p(99)')} ms (muc tieu p95 < 500 ms)`,
    `by-token p95        : ${m('http_req_duration{name:by-token}', 'p(95)')} ms`,
    `bi tu choi          : ${m('checkin_rejected', 'count')} (trong do 429: ${m('checkin_rate_limited', 'count')})`,
    '',
  ];
  return lines.join('\n');
}
