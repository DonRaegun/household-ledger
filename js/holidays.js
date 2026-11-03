// 공휴일 계산 (양력 고정, 음력, 대체공휴일)
// ---- 공휴일 (달력과 목록의 날짜 표시용) ----
// 양력 고정 공휴일 + 음력 공휴일(설날, 부처님오신날, 추석)을 브라우저의 음력 달력으로 계산하고, 대체공휴일 규칙을 적용한다.
// 정부가 그때그때 정하는 임시공휴일·선거일은 계산할 수 없어서 알려진 것만 아래 표에 적어 둔다.
const EXTRA_HOLIDAYS = {
  '2024-04-10': '국회의원 선거일', '2024-10-01': '임시공휴일', '2025-01-27': '임시공휴일',
  '2025-06-03': '대통령 선거일', '2026-06-03': '지방선거일',
};
const holidayCache = {};
const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function holidaysOf(y) {
  if (holidayCache[y]) return holidayCache[y];
  const map = new Map();
  // [날짜, 이름, 대체공휴일 적용 시작 연도(없으면 null), 연휴 묶음]
  const base = [];
  const fixed = (m, d, name, subFrom) => base.push({ date: new Date(y, m - 1, d), name, subFrom });
  fixed(1, 1, '신정', null); fixed(3, 1, '삼일절', 2021); fixed(5, 5, '어린이날', 2014);
  fixed(6, 6, '현충일', null); fixed(8, 15, '광복절', 2021); fixed(10, 3, '개천절', 2021);
  fixed(10, 9, '한글날', 2021); fixed(12, 25, '성탄절', 2023);
  let lunar = null;
  try { lunar = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' }); } catch { /* 음력 미지원 */ }
  if (lunar) {
    for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
      const p = Object.fromEntries(lunar.formatToParts(d).map((x) => [x.type, x.value]));
      if (!/^\d+$/.test(p.month)) continue;   // 윤달('2bis')은 명절이 아니다
      const mo = Number(p.month), da = Number(p.day);
      const at = (n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
      if (mo === 1 && da === 1) base.push({ date: at(-1), name: '설날 연휴', block: 'seol' }, { date: at(0), name: '설날', block: 'seol' }, { date: at(1), name: '설날 연휴', block: 'seol' });
      else if (mo === 8 && da === 15) base.push({ date: at(-1), name: '추석 연휴', block: 'chu' }, { date: at(0), name: '추석', block: 'chu' }, { date: at(1), name: '추석 연휴', block: 'chu' });
      else if (mo === 4 && da === 8) base.push({ date: at(0), name: '부처님오신날', subFrom: 2023 });
    }
  }
  // 같은 날 겹친 공휴일은 뒤의 것이 대체공휴일 대상이 된다
  const needs = [];   // { after: 이 날 다음부터 찾는다, name }
  const blocksSeen = {};
  for (const h of base) {
    const k = dkey(h.date);
    const clash = map.has(k);
    if (!clash) map.set(k, h.name);
    const weekend = h.date.getDay() === 0 || (h.date.getDay() === 6 && !h.block);   // 설·추석은 일요일만, 나머지는 토·일
    if (h.block) {
      const b = (blocksSeen[h.block] ||= { last: h.date, hit: false });
      if (h.date > b.last) b.last = h.date;
      if (h.date.getDay() === 0 || clash) b.hit = true;
    } else if (h.subFrom && y >= h.subFrom && (weekend || clash)) {
      needs.push({ after: h.date, name: `대체공휴일(${h.name})` });
    }
  }
  for (const [k, b] of Object.entries(blocksSeen)) {
    if (b.hit) needs.push({ after: b.last, name: `대체공휴일(${k === 'seol' ? '설날' : '추석'})` });
  }
  needs.sort((a, b) => a.after - b.after);
  for (const n of needs) {
    const d = new Date(n.after);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6 || map.has(dkey(d)));
    map.set(dkey(d), n.name);
  }
  for (const [k, name] of Object.entries(EXTRA_HOLIDAYS)) if (k.startsWith(`${y}-`) && !map.has(k)) map.set(k, name);
  return (holidayCache[y] = map);
}
const holidayName = (s) => holidaysOf(Number(s.slice(0, 4))).get(s) || '';

function dayLabel(s) {
  const d = parseDate(s);
  const hol = holidayName(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})${hol ? ' · ' + hol : ''}`;
}
