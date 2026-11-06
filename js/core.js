// 공통: 상수, 값 형식, 날짜·금액 도우미
const CATEGORIES = {
  out: ['식비', '카페', '교통', '쇼핑', '문화/여가', '고정비', '의료', '경조사', '기타'],
  in: ['급여', '용돈', '부수입', '기타'],
};
// 예전 이름 -> 지금 이름 (주거/통신·보험은 '고정비'로 합쳤다. '쇼핑/여가'는 개발 중에만 있던 이름이라 '쇼핑'으로 되돌린다). 옛 데이터와 백업 파일을 읽을 때 바꾼다
const CAT_RENAME = { '주거/통신': '고정비', '보험': '고정비', '쇼핑/여가': '쇼핑' };
const catName = (c) => CAT_RENAME[c] || c;
// 큰 카테고리(묶음): 통계에는 이 묶음으로 보여 주고, 누르면 안의 작은 카테고리가 나온다. 색은 묶음마다 하나라서 통계가 알록달록하지 않다
const GROUPS = [
  { name: '먹고 마시기', cats: ['식비', '카페'], color: '#f2a65a' },
  { name: '교통', cats: ['교통'], color: '#5b9bf0' },
  { name: '쇼핑/여가', cats: ['쇼핑', '문화/여가'], color: '#e585b5' },
  { name: '고정비', cats: ['고정비'], color: '#4fbfae' },
  { name: '기타', cats: ['의료', '경조사', '기타'], color: '#8e99ad' },   // 의료·경조사처럼 자주 쓰지 않는 것은 기타 안에 모은다
];
const groupOf = (c) => (GROUPS.find((g) => g.cats.includes(catName(c))) || GROUPS[GROUPS.length - 1]).name;
const groupColor = (name) => (GROUPS.find((g) => g.name === name) || GROUPS[GROUPS.length - 1]).color;
const IN_COLORS = { '급여': '#4cc38a', '용돈': '#5cc6de', '부수입': '#8fcf6e' };   // 수입 카테고리 색 (통계에는 나오지 않는다)
// 카테고리 아이콘: 모두 다르게. 선 모양이라 색은 묶음 색을 따라간다 (24x24)
const ICONS = {
  '식비': '<path d="M5 3v5a3 3 0 0 0 6 0V3M8 3v6M8 11v10"/><path d="M16 21V3c2.5 1.5 4 4.5 4 8h-4"/>',
  '카페': '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2M8 3v2M12 3v2"/>',
  '교통': '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M8 17v3M16 17v3"/><circle cx="8" cy="14" r=".7"/><circle cx="16" cy="14" r=".7"/>',
  '쇼핑': '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  '문화/여가': '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z"/>',
  '고정비': '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10M10 20v-5h4v5"/>',
  '의료': '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  '경조사': '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13h16M12 9v11M12 9C10 5 6 6 7 9c.5 1 3 1 5 0zM12 9c2-4 6-3 5 0-.5 1-3 1-5 0z"/>',
  '기타': '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
  '급여': '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  '용돈': '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3"/>',
  '부수입': '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
};
const catIcon = (c) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[catName(c)] || ICONS['기타']}</svg>`;
const PAY = { cash: '현금', card: '카드', transfer: '계좌이체' };
const MOODS = { need: '필수', want: '선택', regret: '후회' };
const color = (c) => IN_COLORS[c] || groupColor(groupOf(c));
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

// 지난달(연별 보기는 작년) 지출 합계. 아직 진행 중인 달·해는 지난 기간도 같은 날짜까지만 더해서 공정하게 비교한다.
// view: 보고 있는 달의 Date, t: 오늘('YYYY-MM-DD')
function previousSpending(list, view, yearView, t = today()) {
  const { rows, running } = previousOuts(list, view, yearView, t);
  return { prev: rows.reduce((s, i) => s + i.amount, 0), running };
}
// 카테고리별로도 같은 기준으로 합친다 ({카테고리: 금액})
function previousByCategory(list, view, yearView, t = today()) {
  const byCat = {};
  previousOuts(list, view, yearView, t).rows.forEach((i) => (byCat[i.category] = (byCat[i.category] || 0) + i.amount));
  return byCat;
}
function previousOuts(list, view, yearView, t) {
  const running = yearView ? view.getFullYear() === Number(t.slice(0, 4)) : ym(view) === t.slice(0, 7);
  const prefix = yearView ? String(view.getFullYear() - 1) : ym(new Date(view.getFullYear(), view.getMonth() - 1, 1));
  const rows = list.filter((i) => i.type === 'out' && i.date.startsWith(prefix) &&
    (!running || (yearView ? i.date.slice(5) <= t.slice(5) : Number(i.date.slice(8)) <= Number(t.slice(8)))));
  return { rows, running };
}

// 한 달을 7일씩 끊은 주별 지출: 1주=1~7일, 2주=8~14일 ... (마지막 주는 말일까지)
function weeklySpending(list, view) {
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, k) => ({ n: k + 1, from: k * 7 + 1, to: Math.min(days, k * 7 + 7), sum: 0 }));
  const p = ym(view);
  list.filter((i) => i.type === 'out' && i.date.startsWith(p)).forEach((i) => { weeks[Math.floor((Number(i.date.slice(8)) - 1) / 7)].sum += i.amount; });
  return weeks;
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

// 시각('HH:MM')을 오전/오후 표기로, 그리고 돌려서 고르는 칸(오전·오후, 1~12시, 분)과 서로 바꾼다
function timeLabel(v) {
  if (!TIME_RE.test(v || '')) return '';
  const [h, m] = v.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${pad(m)}`;
}
// 금액을 한글로 읽는다: 12345 -> '일만 이천삼백사십오원', 50000 -> '오만원'. 십·백·천 앞의 '일'은 읽지 않는다. 0 이하이거나 너무 크면 ''
function koreanMoney(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n <= 0 || n >= 1e16) return '';
  const digit = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const unit = ['', '십', '백', '천'];
  const group = (g) => {   // 1 ~ 9999
    let out = '';
    for (let p = 3; p >= 0; p--) {
      const d = Math.floor(g / 10 ** p) % 10;
      if (d) out += (d === 1 && p > 0 ? '' : digit[d]) + unit[p];
    }
    return out;
  };
  const big = ['', '만', '억', '조'];
  const parts = [];
  for (let b = 3; b >= 0; b--) {
    const g = Math.floor(n / 10000 ** b) % 10000;
    if (g) parts.push(group(g) + big[b]);
  }
  return parts.join(' ') + '원';
}

// 날짜('YYYY-MM-DD')를 '2026년 11월 6일 (금)'으로, 그리고 그 달의 일수(m은 1~12)
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
function dateLabel(v, showYear = true) {
  if (!DATE_RE.test(v || '')) return '';
  const d = parseDate(v);
  return `${showYear ? d.getFullYear() + '년 ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
}
function timeToWheel(v) {
  const [h, m] = v.split(':').map(Number);
  return { ap: h >= 12 ? 1 : 0, h12: h % 12 || 12, m };
}
function wheelToTime(ap, h12, m) {
  return `${pad((h12 % 12) + ap * 12)}:${pad(m)}`;
}

// 내역 검색: 띄어 쓴 낱말이 모두 들어 있는 내역을 최신순으로. 메모·카테고리·결제수단·소비 평가·날짜·금액에서 찾는다.
// 금액은 '12000', '12,000', '12,000원' 어느 쪽으로 써도 찾고, 날짜는 '2026-11'이나 '2026-11-03'처럼 쓴다.
const searchText = (s) => String(s || '').toLowerCase();
function searchItems(list, query) {
  const words = searchText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return list.filter((i) => {
    const hay = searchText([i.memo, i.category, PAY[i.pay], MOODS[i.mood], i.type === 'in' ? '수입' : '지출',
      i.date, i.amount, i.amount.toLocaleString('ko-KR')].join(' '));
    return words.every((w) => hay.includes(w) || hay.includes(w.replace(/[,원]/g, '')));
  }).sort(byNewest);
}
