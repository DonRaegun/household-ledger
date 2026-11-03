// 공통: 상수, 값 형식, 날짜·금액 도우미
const CATEGORIES = {
  out: ['식비', '카페', '교통', '쇼핑', '주거/통신', '의료', '보험', '문화/여가', '경조사', '기타'],
  in: ['급여', '용돈', '부수입', '기타'],
};
const COLORS = {
  '식비': '#f59e0b', '카페': '#a16207', '교통': '#3b82f6', '쇼핑': '#ec4899',
  '주거/통신': '#14b8a6', '의료': '#ef4444', '보험': '#6366f1', '문화/여가': '#8b5cf6', '경조사': '#84cc16',
  '급여': '#16a34a', '용돈': '#06b6d4', '부수입': '#65a30d', '기타': '#94a3b8',
};
const PAY = { cash: '현금', card: '카드', transfer: '계좌이체' };
const MOODS = { need: '필수', want: '선택', regret: '후회' };
const color = (c) => COLORS[c] || COLORS['기타'];
const KEY = 'ledger.v1';
const SKEY = 'ledger.settings.v1';
const $ = (id) => document.getElementById(id);
const won = (n) => n.toLocaleString('ko-KR') + '원';
// 달력 칸처럼 좁은 곳에 쓰는 짧은 금액 표기 (320000 -> 32만)
const short = (n) => n >= 10000
  ? String(Math.round(n / 1000) / 10).replace(/\.0$/, '') + '만'
  : n.toLocaleString('ko-KR');

// 값 형식 검사용 (load()가 실행되기 전에 선언되어 있어야 한다)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/, MONTH_RE = /^\d{4}-\d{2}$/;
// 저장소 문제를 화면에 알리기 위한 상태 (load()보다 먼저 선언해야 한다)
let storageWarning = null;      // 읽기 오류 안내 문구
let storageReadOnly = false;    // true면 덮어쓰기로 데이터를 잃을 수 있으니 저장하지 않는다
let lastStorageAlert = 0;

const pad = (n) => String(n).padStart(2, '0');
function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function today() {
  const d = new Date();
  return `${ym(d)}-${pad(d.getDate())}`;
}
// 'YYYY-MM-DD'를 로컬 시간 기준 Date로 (new Date(문자열)은 UTC로 읽혀 날짜가 밀릴 수 있음)
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 해당 월에 없는 날(31일 등)은 말일로 맞춘다
const clampDay = (y, m, day) => Math.min(day, new Date(y, m + 1, 0).getDate());

// 같은 날 안에서는 늦은 시각이 위로 (시각이 없는 내역은 아래로)
const byNewest = (a, b) =>
  b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || b.id - a.id;
function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
