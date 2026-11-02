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

let items = load();
let settings = loadSettings();
let cur = new Date(); cur.setDate(1);
let tab = 'list';          // 'list' | 'stats' | 'settings'
let listMode = 'list';     // 'list' | 'cal'
let statsMode = 'month';   // 'month' | 'year'
let selCat = null;         // 도넛에서 선택한 카테고리
let selDay = null;         // 달력에서 선택한 날짜
let editing = null;
let fEditing = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() { localStorage.setItem(KEY, JSON.stringify(items)); }
function normSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    lastPay: PAY[s.lastPay] ? s.lastPay : 'card',
    cardDay: Number(s.cardDay) >= 1 && Number(s.cardDay) <= 31 ? Number(s.cardDay) : null,
    cardStart: Number(s.cardStart) >= 1 && Number(s.cardStart) <= 31 ? Number(s.cardStart) : 1,
    remindDays: [0, 1, 2, 3].includes(Number(s.remindDays)) && s.remindDays !== '' && s.remindDays != null ? Number(s.remindDays) : 1,
    fixed: Array.isArray(s.fixed) ? s.fixed : [],
    applied: s.applied && typeof s.applied === 'object' ? s.applied : {},
  };
}
function loadSettings() {
  try { return normSettings(JSON.parse(localStorage.getItem(SKEY))); } catch { return normSettings(); }
}
function saveSettings() { localStorage.setItem(SKEY, JSON.stringify(settings)); }

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
function dayLabel(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
}
// 해당 월에 없는 날(31일 등)은 말일로 맞춘다
const clampDay = (y, m, day) => Math.min(day, new Date(y, m + 1, 0).getDate());

function itemEl(i) {
  const li = document.createElement('li');
  li.className = 'item';
  li.innerHTML = `<div><div class="cat"><i class="dot"></i><span></span></div><div class="memo"></div></div><div class="amt ${i.type}"></div>`;
  li.querySelector('.dot').style.background = color(i.category);
  li.querySelector('.cat span').textContent = i.category;
  const memo = li.querySelector('.memo');
  const bits = [];
  if (i.type === 'out' && i.time) bits.push(i.time);
  if (i.type === 'out' && PAY[i.pay]) bits.push(PAY[i.pay]);
  if (i.memo) bits.push(i.memo);
  memo.textContent = bits.join(' · ');
  if (i.type === 'out' && MOODS[i.mood]) {
    const chip = document.createElement('span');
    chip.className = `chip mood-${i.mood}`;
    chip.textContent = MOODS[i.mood];
    memo.prepend(chip);
  }
  li.querySelector('.amt').textContent = (i.type === 'out' ? '-' : '+') + won(i.amount);
  li.onclick = () => openDialog(i);
  return li;
}
// 같은 날 안에서는 늦은 시각이 위로 (시각이 없는 내역은 아래로)
const byNewest = (a, b) =>
  b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '') || b.id - a.id;
function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function render() {
  autoApplyFixed();
  $('fab').classList.remove('away');
  const yearView = tab === 'stats' && statsMode === 'year';
  const y = cur.getFullYear();
  $('month').textContent = tab === 'settings' ? '설정'
    : yearView ? `${y}년` : `${y}년 ${cur.getMonth() + 1}월`;
  $('prev').style.visibility = $('next').style.visibility = tab === 'settings' ? 'hidden' : 'visible';

  const month = items.filter((i) => i.date.startsWith(ym(cur))).sort(byNewest);
  const period = yearView ? items.filter((i) => i.date.startsWith(y + '-')) : month;

  const sum = (t) => period.filter((i) => i.type === t).reduce((s, i) => s + i.amount, 0);
  const inc = sum('in'), out = sum('out');
  $('sum-in').textContent = won(inc);
  $('sum-out').textContent = won(out);
  $('sum-bal').textContent = won(inc - out);
  $('summary').hidden = tab === 'settings';

  $('view-list').hidden = tab !== 'list';
  $('view-stats').hidden = tab !== 'stats';
  $('view-settings').hidden = tab !== 'settings';
  $('fab').hidden = tab !== 'list';
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#list-mode button').forEach((b) => b.classList.toggle('active', b.dataset.lmode === listMode));
  document.querySelectorAll('#stats-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === statsMode));

  renderExtras();
  if (tab === 'list') {
    $('list-wrap').hidden = listMode !== 'list';
    $('view-cal').hidden = listMode !== 'cal';
    if (listMode === 'list') renderList(month);
    else renderCal(month);
  } else if (tab === 'stats') {
    renderStats(period, out, yearView);
  } else {
    renderSettings();
  }
}

// 내역 탭 위쪽: 고정지출 확인 배너와 카드 출금 예정
function renderExtras() {
  const banner = $('banner');
  banner.hidden = tab !== 'list' || !fixedNotice;
  if (!banner.hidden) {
    banner.innerHTML = '<div class="msg"></div><div class="row"><button id="fix-ok" class="primary">확인</button></div>';
    banner.querySelector('.msg').textContent = fixedNotice;
  }

  const upcoming = upcomingFixed();
  const up = $('upcoming');
  up.hidden = tab !== 'list' || !upcoming.length;
  if (!up.hidden) {
    const names = upcoming.slice(0, 2).map((u) => `${Number(u.date.slice(8))}일 ${u.f.name}`).join(', ');
    up.innerHTML = '<span></span><b></b>';
    up.querySelector('span').textContent = `예정 고정지출 ${upcoming.length}건 (${names}${upcoming.length > 2 ? ' 외' : ''})`;
    up.querySelector('b').textContent = won(upcoming.reduce((s, u) => s + u.f.amount, 0));
  }

  const info = cardInfo();
  const box = $('card-info');
  box.hidden = tab !== 'list' || !info;
  if (!box.hidden) {
    box.innerHTML = '<span>카드 출금 <em></em><small></small></span><b></b>';
    box.querySelector('em').textContent = `${info.when} (${info.dateText})`;
    box.querySelector('small').textContent = `${info.period} 사용분`;
    box.querySelector('b').textContent = `예정 ${won(info.amount)}`;
  }
  $('info-box').hidden = box.hidden && up.hidden;
}

function renderList(month) {
  const list = $('list');
  list.innerHTML = '';
  let lastDate = '';
  for (const i of month) {
    if (i.date !== lastDate) {
      lastDate = i.date;
      const li = document.createElement('li');
      li.className = 'day';
      li.textContent = dayLabel(i.date);
      list.appendChild(li);
    }
    list.appendChild(itemEl(i));
  }
  $('empty').hidden = month.length > 0;
}

function renderCal(month) {
  const y = cur.getFullYear(), m = cur.getMonth();
  if (!selDay || !selDay.startsWith(ym(cur))) selDay = today().startsWith(ym(cur)) ? today() : null;

  const sums = {};
  for (const i of month) {
    const s = (sums[i.date] ||= { in: 0, out: 0 });
    s[i.type] += i.amount;
  }
  const blanks = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  let html = '<div></div>'.repeat(blanks);
  for (let d = 1; d <= days; d++) {
    const date = `${ym(cur)}-${pad(d)}`;
    const s = sums[date];
    const cls = ['day-cell', date === today() ? 'today' : '', date === selDay ? 'sel' : ''].join(' ');
    html += `<button class="${cls}" data-date="${date}"><b>${d}</b>` +
      `<span class="o">${s && s.out ? short(s.out) : ''}</span>` +
      `<span class="n">${s && s.in ? short(s.in) : ''}</span></button>`;
  }
  $('cal-grid').innerHTML = html;

  const list = $('cal-list');
  list.innerHTML = '';
  const head = document.createElement('li');
  head.className = 'day';
  if (!selDay) {
    head.textContent = '날짜를 눌러 그날의 내역을 확인하세요.';
    list.appendChild(head);
    return;
  }
  head.textContent = dayLabel(selDay);
  list.appendChild(head);
  const dayItems = month.filter((i) => i.date === selDay);
  if (!dayItems.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = '내역이 없어요.';
    list.appendChild(li);
  }
  dayItems.forEach((i) => list.appendChild(itemEl(i)));
}

function renderStats(period, out, yearView) {
  $('year-wrap').hidden = !yearView;
  if (yearView) renderYearBars(period);

  const outs = period.filter((i) => i.type === 'out');
  const byCat = {};
  outs.forEach((i) => (byCat[i.category] = (byCat[i.category] || 0) + i.amount));
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (selCat && !byCat[selCat]) selCat = null;

  const stats = $('stats');
  stats.innerHTML = '';
  if (!rows.length) stats.innerHTML = '<li class="plain">지출 내역이 없어요.</li>';
  for (const [cat, amt] of rows) {
    const li = document.createElement('li');
    li.dataset.cat = cat;
    if (cat === selCat) li.classList.add('sel');
    li.innerHTML = '<div class="top"><span class="name"><i class="dot"></i><em></em></span><b></b></div><div class="bar"><i></i></div>';
    li.querySelector('.dot').style.background = color(cat);
    li.querySelector('em').textContent = `${cat} (${Math.round((amt / out) * 100)}%)`;
    li.querySelector('b').textContent = won(amt);
    const bar = li.querySelector('.bar i');
    bar.style.width = (amt / rows[0][1]) * 100 + '%';
    bar.style.background = color(cat);
    stats.appendChild(li);
  }
  renderDonut(rows, out);

  // 결제수단별 합계 (결제수단이 없는 예전 내역은 '미지정')
  const byPay = { cash: 0, card: 0, transfer: 0, none: 0 };
  outs.forEach((i) => (byPay[PAY[i.pay] ? i.pay : 'none'] += i.amount));
  // 결제수단이 한 종류뿐이면 "카드 100%"가 되어 정보가 없으므로, 두 종류 이상일 때만 보여준다
  $('pay-wrap').hidden = new Set(outs.map((i) => (PAY[i.pay] ? i.pay : 'none'))).size < 2;
  $('pay-stats').innerHTML = [...Object.keys(PAY), 'none']
    .filter((k) => k !== 'none' || byPay.none)
    .map((k) => `<li><span>${PAY[k] || '미지정'}</span><span class="pct">${out ? Math.round((byPay[k] / out) * 100) : 0}%</span><b>${won(byPay[k])}</b></li>`)
    .join('');

  // 소비 성격별 합계 (성격을 한 번도 고르지 않았으면 안내만 보여준다)
  const byMood = { need: 0, want: 0, regret: 0, none: 0 };
  outs.forEach((i) => (byMood[MOODS[i.mood] ? i.mood : 'none'] += i.amount));
  // 소비 성격을 한 번도 쓴 적이 없으면 이 영역 자체를 보이지 않는다
  $('mood-wrap').hidden = !outs.length || !items.some((i) => MOODS[i.mood]);
  $('mood-stats').innerHTML = outs.some((i) => MOODS[i.mood])
    ? [...Object.keys(MOODS), 'none']
      .filter((k) => k !== 'none' || byMood.none)
      .map((k) => `<li class="${k === 'regret' ? 'regret' : ''}"><span>${MOODS[k] || '미분류'}</span><span class="pct">${Math.round((byMood[k] / out) * 100)}%</span><b>${won(byMood[k])}</b></li>`)
      .join('')
    : '<li class="plain">이 기간에는 소비 성격을 고른 지출이 없어요.</li>';
}

function renderYearBars(period) {
  const months = Array(12).fill(0);
  period.filter((i) => i.type === 'out').forEach((i) => (months[Number(i.date.slice(5, 7)) - 1] += i.amount));
  const max = Math.max(...months, 1);
  const nowM = today().slice(0, 4) === String(cur.getFullYear()) ? Number(today().slice(5, 7)) - 1 : -1;
  $('year-bars').innerHTML = months.map((v, k) =>
    `<button data-m="${k}" class="${k === nowM ? 'now' : ''}">` +
    `<small>${v ? short(v) : ''}</small>` +
    `<div class="col"><i style="height:${(v / max) * 100}%"></i></div>` +
    `<em>${k + 1}월</em></button>`).join('');
}

function renderDonut(rows, total) {
  const svg = $('donut');
  const R = 38, C = 2 * Math.PI * R;
  const sel = rows.find(([c]) => c === selCat);
  $('donut-label').textContent = sel ? sel[0] : '총 지출';
  $('donut-total').textContent = won(sel ? sel[1] : total);
  $('donut-pct').textContent = sel ? `${Math.round((sel[1] / total) * 100)}%` : '';
  if (!rows.length) {
    svg.innerHTML = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--line)" stroke-width="16"/>`;
    return;
  }
  let start = 0;
  svg.innerHTML = rows.map(([cat, amt]) => {
    const len = (amt / total) * C;
    const on = cat === selCat;
    const s = `<circle class="slice" data-cat="${cat}" cx="50" cy="50" r="${R}" fill="none" stroke="${color(cat)}"
      stroke-width="${on ? 21 : 16}" opacity="${selCat && !on ? 0.3 : 1}"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-start}" transform="rotate(-90 50 50)"/>`;
    start += len;
    return s;
  }).join('');
}

// ---- 고정지출 ----
// 등록한 달부터 이번 달까지(최대 12개월), 날짜가 지났는데 아직 처리하지 않은 것들
function pendingFixed() {
  const now = new Date();
  const nm = now.getFullYear() * 12 + now.getMonth();
  const t = today();
  const found = [];
  for (const f of settings.fixed) {
    const since = parseDate(f.since + '-01');
    const from = Math.max(since.getFullYear() * 12 + since.getMonth(), nm - 11);
    for (let n = from; n <= nm; n++) {
      const y = Math.floor(n / 12), m = n % 12;
      const key = `${f.id}:${y}-${pad(m + 1)}`;
      const date = `${y}-${pad(m + 1)}-${pad(clampDay(y, m, f.day))}`;
      if (date <= t && !settings.applied[key]) found.push({ f, date, key });
    }
  }
  return found;
}
// 날짜가 지난 고정지출은 물어보지 않고 자동으로 내역에 넣고, 넣었다는 알림만 남긴다
let fixedNotice = null;
function autoApplyFixed() {
  const pending = pendingFixed();
  if (!pending.length) return;
  pending.forEach((p, n) => {
    settings.applied[p.key] = true;
    items.push({
      id: Date.now() + n, type: 'out', amount: p.f.amount, category: p.f.category,
      pay: p.f.pay, mood: p.f.mood, date: p.date, memo: p.f.name, fixedId: p.f.id,
    });
  });
  save(); saveSettings();
  const names = pending.slice(0, 3).map((p) => `${Number(p.date.slice(5, 7))}월 ${p.f.name} ${won(p.f.amount)}`).join(', ');
  fixedNotice = `고정지출 ${pending.length}건이 내역에 추가됐어요 (${names}${pending.length > 3 ? ' 외' : ''})`;
}
// 이번 달 안에 아직 날짜가 오지 않은 고정지출 (통계에는 날짜가 지나야 들어간다)
function upcomingFixed() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), t = today();
  return settings.fixed
    .map((f) => ({ f, date: `${y}-${pad(m + 1)}-${pad(clampDay(y, m, f.day))}` }))
    .filter((u) => u.date > t && !settings.applied[`${u.f.id}:${y}-${pad(m + 1)}`]);
}
$('banner').addEventListener('click', (e) => {
  if (e.target.id === 'fix-ok') { fixedNotice = null; render(); }
});

// ---- 카드 출금 예정 (카드 한 장) ----
// 사용 기간은 '매달 N일부터 다음 달 N-1일까지'(N=1이면 1일~말일)이고,
// 그 기간이 끝난 다음 달의 결제일에 출금된다. 예) N=19: 10/19~11/18 사용분 -> 12월 결제일
const ymd = (d) => `${ym(d)}-${pad(d.getDate())}`;
function cardPeriod(due) {
  const s = settings.cardStart;
  const endMonth = new Date(due.getFullYear(), due.getMonth() - 1, 1);   // 사용 기간이 끝나는 달
  const y = endMonth.getFullYear(), m = endMonth.getMonth();
  if (s === 1) return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
  return {
    from: new Date(y, m - 1, clampDay(y, m - 1, s)),
    to: new Date(y, m, clampDay(y, m, s - 1)),
  };
}
function cardInfo() {
  if (!settings.cardDay) return null;
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueOf = (y, m) => new Date(y, m, clampDay(y, m, settings.cardDay));
  let due = dueOf(t.getFullYear(), t.getMonth());
  if (due < t) due = dueOf(t.getFullYear(), t.getMonth() + 1);
  const { from, to } = cardPeriod(due);
  const [f, e] = [ymd(from), ymd(to)];
  const amount = items
    .filter((i) => i.type === 'out' && i.pay === 'card' && i.date >= f && i.date <= e)
    .reduce((s, i) => s + i.amount, 0);
  const days = Math.round((due - t) / 86400000);
  return {
    amount,
    when: days === 0 ? '오늘' : `D-${days}`,
    dateText: `${due.getMonth() + 1}월 ${due.getDate()}일`,
    period: `${from.getMonth() + 1}/${from.getDate()}~${to.getMonth() + 1}/${to.getDate()}`,
  };
}

// ---- 설정 탭 ----
function dayOptions(first) {
  return (first ? `<option value="">${first}</option>` : '') +
    Array.from({ length: 31 }, (_, k) => `<option value="${k + 1}">${k + 1}일</option>`).join('');
}
$('card-day').innerHTML = dayOptions('설정 안 함');
$('fday').innerHTML = dayOptions().replace(/(\d+)일</g, '$1<');
$('card-start').innerHTML = dayOptions();
$('card-day').onchange = (e) => {
  settings.cardDay = Number(e.target.value) || null;
  saveSettings(); render();
};
$('card-start').onchange = (e) => {
  settings.cardStart = Number(e.target.value) || 1;
  saveSettings(); render();
};

function renderSettings() {
  $('remind-days').value = settings.remindDays;
  $('ics-card').disabled = !settings.cardDay;
  $('ics-fixed').disabled = !settings.fixed.length;
  $('card-day').value = settings.cardDay || '';
  $('card-start').value = settings.cardStart;
  const s = settings.cardStart;
  $('card-hint').textContent = s === 1
    ? '매달 1일~말일에 쓴 금액이 다음 달 결제일에 출금되는 카드예요.'
    : `매달 ${s}일부터 다음 달 ${s - 1}일까지 쓴 금액이 그다음 달 결제일에 출금되는 카드예요. (예: 10/${s}~11/${s - 1} 사용분 → 12월 결제일)`;
  // 구독은 비싼 순으로 따로 모아 월/연 합계를 보여주고, 나머지는 날짜 순으로 보여준다
  const sum = (arr) => arr.reduce((s, f) => s + f.amount, 0);
  const subs = settings.fixed.filter((f) => f.sub).sort((a, b) => b.amount - a.amount);
  const rest = settings.fixed.filter((f) => !f.sub).sort((a, b) => a.day - b.day);
  $('sub-title').hidden = !subs.length;
  $('sub-title').textContent = `구독 ${subs.length}개 · 월 ${won(sum(subs))} (연 ${won(sum(subs) * 12)})`;
  $('fixed-title').hidden = !rest.length && subs.length > 0;
  $('fixed-title').textContent = rest.length
    ? `${subs.length ? '그 외 ' : ''}고정지출 (월 ${won(sum(rest))})` : '고정지출';
  fillFixedList($('sub-list'), subs);
  fillFixedList($('fixed-list'), rest);
}

function fillFixedList(list, rows) {
  list.innerHTML = '';
  for (const f of rows) {
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML = '<div><div class="cat"><i class="dot"></i><span></span></div><div class="memo"></div></div><div class="amt out"></div>';
    li.querySelector('.dot').style.background = color(f.category);
    li.querySelector('.cat span').textContent = f.name;
    li.querySelector('.memo').textContent = [`매달 ${f.day}일`, f.category, PAY[f.pay], MOODS[f.mood]].filter(Boolean).join(' · ');
    li.querySelector('.amt').textContent = won(f.amount);
    li.onclick = () => openFixed(f);
    list.appendChild(li);
  }
}

function openFixed(f) {
  fEditing = f || null;
  $('fdlg-title').textContent = f ? '고정지출 수정' : '고정지출 추가';
  $('fdel').hidden = !f;
  fillCategories('fcategory', 'out', f && f.category);
  $('fname').value = f ? f.name : '';
  $('famount').value = f ? f.amount.toLocaleString('ko-KR') : '';
  document.querySelector(`input[name=fpay][value=${f ? f.pay : settings.lastPay}]`).checked = true;
  $('fday').value = f ? f.day : new Date().getDate();
  $('fsub').checked = !!(f && f.sub);
  const fm = f ? f.mood || '' : 'need';   // 새 고정지출은 '필수'가 기본
  document.querySelectorAll('input[name=fmood]').forEach((r) => (r.checked = r.value === fm));
  $('fdlg').showModal();
  if (!f) $('fname').focus();
}
$('fixed-add').onclick = () => openFixed();
$('fcancel').onclick = () => $('fdlg').close();
$('fform').addEventListener('submit', () => {
  const amount = Number($('famount').value.replace(/\D/g, ''));
  const name = $('fname').value.trim();
  if (!amount || !name) return;
  const data = {
    name, amount, category: $('fcategory').value,
    pay: document.querySelector('input[name=fpay]:checked').value,
    day: Number($('fday').value),
    sub: $('fsub').checked,
    mood: document.querySelector('input[name=fmood]:checked').value || undefined,
  };
  if (fEditing) Object.assign(fEditing, data);
  else settings.fixed.push({ id: 'f' + Date.now(), since: ym(new Date()), ...data });
  saveSettings(); render();
});
$('fdel').onclick = () => {
  if (fEditing && confirm('이 고정지출을 삭제할까요? (이미 추가된 내역은 그대로 남아요)')) {
    settings.fixed = settings.fixed.filter((f) => f !== fEditing);
    saveSettings(); render(); $('fdlg').close();
  }
};

// ---- 공통 이벤트 ----
function toggleCat(cat) {
  selCat = selCat === cat ? null : cat;
  render();
}
$('donut').addEventListener('click', (e) => {
  const s = e.target.closest('.slice');
  if (s) toggleCat(s.dataset.cat);
  else if (selCat) { selCat = null; render(); }
});
$('stats').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-cat]');
  if (li) toggleCat(li.dataset.cat);
});
$('year-bars').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-m]');
  if (!b) return;
  cur = new Date(cur.getFullYear(), Number(b.dataset.m), 1);
  statsMode = 'month';
  selCat = null;
  render();
});
$('cal-grid').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-date]');
  if (!b) return;
  selDay = b.dataset.date;
  render();
});

document.querySelectorAll('#list-mode button').forEach((b) => (b.onclick = () => { listMode = b.dataset.lmode; render(); }));
document.querySelectorAll('#stats-mode button').forEach((b) => (b.onclick = () => { statsMode = b.dataset.mode; selCat = null; render(); }));
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; selCat = null; render(); }));

function move(step) {
  if (tab === 'stats' && statsMode === 'year') cur = new Date(cur.getFullYear() + step, cur.getMonth(), 1);
  else cur = new Date(cur.getFullYear(), cur.getMonth() + step, 1);
  selCat = null;
  render();
}
$('prev').onclick = () => move(-1);
$('next').onclick = () => move(1);

function fillCategories(id, type, selected) {
  $(id).innerHTML = CATEGORIES[type].map((c) => `<option>${c}</option>`).join('');
  if (selected) $(id).value = selected;
}

function bindMoney(el) {
  el.addEventListener('input', (e) => {
    const n = e.target.value.replace(/\D/g, '');
    e.target.value = n ? Number(n).toLocaleString('ko-KR') : '';
  });
}
bindMoney($('amount'));
bindMoney($('famount'));

function openDialog(item) {
  editing = item || null;
  $('dlg-title').textContent = item ? '내역 수정' : '내역 추가';
  $('del').hidden = !item;
  const type = item ? item.type : 'out';
  document.querySelector(`input[name=type][value=${type}]`).checked = true;
  fillCategories('category', type, item && item.category);
  // 새 내역은 마지막에 쓴 결제수단이 기본값, 결제수단이 없는 예전 내역은 선택 없음으로 둔다
  const pay = item ? item.pay : settings.lastPay;
  document.querySelectorAll('input[name=pay]').forEach((r) => (r.checked = r.value === pay));
  $('pay-seg').hidden = type !== 'out';
  $('mood-seg').hidden = type !== 'out';
  const mood = (item && item.mood) || '';
  document.querySelectorAll('input[name=mood]').forEach((r) => (r.checked = r.value === mood));
  $('amount').value = item ? item.amount.toLocaleString('ko-KR') : '';
  const date = item ? item.date : (listMode === 'cal' && selDay) || today();
  $('date').value = date;
  // 새 내역은 지금 시각을 채워 두고(오늘 날짜일 때만), 예전 내역은 있는 값 그대로 둔다
  $('time').value = item ? item.time || '' : date === today() ? nowTime() : '';
  $('time').dataset.auto = item ? '0' : '1';
  $('time').hidden = type !== 'out';
  $('memo').value = item ? item.memo : '';
  setMore(!!item);          // 새 내역은 접어 두고(기본값으로 저장), 수정할 때는 값이 보이게 펼친다
  updateMoreSum();
  $('dlg').showModal();
  if (!item) $('amount').focus();
}

document.querySelectorAll('input[name=type]').forEach((r) =>
  r.addEventListener('change', () => {
    fillCategories('category', r.value);
    $('pay-seg').hidden = r.value !== 'out';
    $('mood-seg').hidden = r.value !== 'out';
    $('time').hidden = r.value !== 'out';
    updateMoreSum();
  }));

// 시각을 직접 고치기 전까지는 날짜에 맞춰 자동값을 유지한다 (지난 날짜를 입력할 때 지금 시각이 남지 않게)
$('date').addEventListener('change', () => {
  if ($('time').dataset.auto === '1') $('time').value = $('date').value === today() ? nowTime() : '';
});
$('time').addEventListener('input', () => { $('time').dataset.auto = '0'; });

// '더보기': 결제수단, 소비 성격, 날짜, 시각은 접어 두고, 접힌 동안은 저장될 값을 한 줄로 보여준다
function setMore(open) {
  $('more').hidden = !open;
  $('more-btn').setAttribute('aria-expanded', String(open));
  $('more-btn').querySelector('b').textContent = open ? '접기' : '더보기';
  $('more-sum').hidden = open;
}
function updateMoreSum() {
  const out = document.querySelector('input[name=type]:checked').value === 'out';
  const d = $('date').value;
  const bits = [d === today() ? '오늘' : d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : ''];
  if (out && $('time').value) bits.push($('time').value);
  const pay = document.querySelector('input[name=pay]:checked');
  if (out && pay) bits.push(PAY[pay.value]);
  const mood = document.querySelector('input[name=mood]:checked');
  if (out && mood && mood.value) bits.push(MOODS[mood.value]);
  $('more-sum').textContent = bits.filter(Boolean).join(' · ');
}
$('more-btn').onclick = () => setMore($('more').hidden);
$('more').addEventListener('change', updateMoreSum);
$('more').addEventListener('input', updateMoreSum);

$('form').addEventListener('submit', () => {
  const amount = Number($('amount').value.replace(/\D/g, ''));
  if (!amount) return;
  const type = document.querySelector('input[name=type]:checked').value;
  const payEl = document.querySelector('input[name=pay]:checked');
  const data = {
    type,
    amount,
    category: $('category').value,
    pay: type === 'out' && payEl ? payEl.value : undefined,
    mood: type === 'out' ? document.querySelector('input[name=mood]:checked').value || undefined : undefined,
    date: $('date').value || today(),
    time: type === 'out' ? $('time').value || undefined : undefined,
    memo: $('memo').value.trim(),
  };
  if (data.pay) { settings.lastPay = data.pay; saveSettings(); }
  if (editing) Object.assign(editing, data);
  else items.push({ id: Date.now(), ...data });
  save();
  if (data.date.slice(0, 7) !== ym(cur)) {
    const d = parseDate(data.date);
    cur = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  render();
});
$('cancel').onclick = () => $('dlg').close();
$('del').onclick = () => {
  if (editing && confirm('삭제할까요?')) {
    items = items.filter((i) => i !== editing);
    save(); render(); $('dlg').close();
  }
};
$('fab').onclick = () => openDialog();

// ---- 캘린더 알림 (.ics) ----
// 웹앱은 꺼진 상태에서 알림을 띄울 수 없어서, 폰 캘린더가 알려주도록 일정 파일을 만든다.
// 달마다 날짜가 다른 경우(31일 등)를 정확히 맞추려고 반복 규칙 대신 12개월치를 날짜별로 만든다.
const WHEN = ['오늘', '내일', '모레', '3일 뒤'];
const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
// 한 줄은 75바이트까지라서 넘으면 접는다 (한글은 글자 중간에서 자르지 않는다)
function icsFold(line) {
  const enc = new TextEncoder();
  let out = '', cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 73) { out += cur + '\r\n '; cur = ''; bytes = 1; }
    cur += ch; bytes += b;
  }
  return out + cur;
}
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
// 결제일 day의 앞으로 12번과, 각각의 알림 날짜(결제일 - 알림 시점)
function upcomingDues(day) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = [];
  for (let k = 0; out.length < 12 && k < 14; k++) {
    const y = now.getFullYear(), m = now.getMonth() + k;
    const due = new Date(y, m, clampDay(y, m, day));
    const remind = new Date(due.getFullYear(), due.getMonth(), due.getDate() - settings.remindDays);
    if (remind >= t) out.push({ due, remind });
  }
  return out;
}
function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//household-ledger//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const d = icsDate(e.remind);
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`,
      `DTSTART:${d}T090000`, `DTEND:${d}T093000`,
      `SUMMARY:${icsEscape(e.title)}`, `DESCRIPTION:${icsEscape(e.desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, 'TRIGGER:PT0S', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
const dueKey = (due) => `${due.getFullYear()}${pad(due.getMonth() + 1)}`;
const dueText = (due) => `${due.getMonth() + 1}월 ${due.getDate()}일`;
function cardEvents() {
  const when = WHEN[settings.remindDays];
  return upcomingDues(settings.cardDay).map(({ due, remind }) => ({
    uid: `card-${dueKey(due)}@household-ledger`, remind,
    title: `${when} 카드값 출금일 - 계좌 잔액 확인`,
    desc: `${dueText(due)} 카드값 출금일이에요. 가계부 앱에서 출금 예정 금액을 확인하세요.`,
  }));
}
function fixedEvents() {
  const when = WHEN[settings.remindDays];
  return settings.fixed.flatMap((f) => upcomingDues(f.day).map(({ due, remind }) => ({
    uid: `fixed-${f.id}-${dueKey(due)}@household-ledger`, remind,
    title: `${when} ${f.name} ${won(f.amount)} 결제`,
    desc: `${dueText(due)} ${f.name} (${f.category}${PAY[f.pay] ? ', ' + PAY[f.pay] : ''}) - 매달 ${f.day}일`,
  })));
}
$('remind-days').onchange = (e) => {
  settings.remindDays = Number(e.target.value);
  saveSettings();
};
$('ics-card').onclick = () => {
  if (settings.cardDay) download('가계부-카드출금알림.ics', buildIcs(cardEvents()), 'text/calendar;charset=utf-8');
};
$('ics-fixed').onclick = () => {
  if (settings.fixed.length) download('가계부-고정지출알림.ics', buildIcs(fixedEvents()), 'text/calendar;charset=utf-8');
};

// ---- 결제 문자 읽기 (붙여넣기 / 공유) ----
// 카드 승인 문자나 앱 알림에서 금액, 가맹점, 결제 시각을 읽어 입력을 돕는다.
// 카드번호와 이름은 읽지도 저장하지도 않는다. 읽은 결과는 확인 창에서 고친 뒤에만 반영된다.
const SMS_START = /^\s*(\[[^\]\n]+\]\s*\[[^\]\n]+\]|\[Web발신\]|●)/i;   // 문자 한 통이 시작되는 줄
const SMS_WHEN = /(\d{1,2})[\/.](\d{1,2})\s+(\d{1,2}):(\d{2})/;       // '10/10 20:15'
const CAT_GUESS = [
  [/카페|커피|스타벅스|투썸|이디야|메가|빽다방|할리스/, '카페'],
  [/편의점|GS25|CU|세븐일레븐|마트|식당|정육|치킨|피자|분식|김밥|국밥|횟집|고기|배달|맥도날|버거|도시락|반찬/, '식비'],
  [/주유|택시|지하철|버스|티머니|코레일|철도|하이패스|주차/, '교통'],
  [/병원|의원|약국|치과|한의원/, '의료'],
  [/백화점|리테일|올리브영|다이소|쿠팡|11번가|옥션|무신사/, '쇼핑'],
];
const stripInst = (memo) => String(memo || '').replace(/ \d+개월 할부$/, '');

// 붙여넣은 글을 문자 한 통씩 나눈다 (카톡에서 복사한 '[이름] [오후 12:31]' 머리글도 경계로 쓴다)
function splitSms(text) {
  const blocks = [];
  let cur = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (SMS_START.test(line) && SMS_WHEN.test(cur.join('\n'))) { blocks.push(cur.join('\n')); cur = []; }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur.join('\n'));
  return blocks.filter((b) => b.trim());
}

// 문자 한 통 -> { cancel, amount, date, time, merchant, inst } (결제 문자가 아니면 null)
function parseSms(block) {
  const w = block.match(SMS_WHEN);
  const a = block.match(/(\d[\d,]*)\s*원/);
  if (!w || !a) return null;
  const cancel = /취소/.test(block);
  if (!cancel && !/승인|결제/.test(block)) return null;
  const [mo, da, hh, mi] = [Number(w[1]), Number(w[2]), Number(w[3]), Number(w[4])];
  // 문자에는 연도가 없어서 올해로 보고, 많이 미래면 작년으로 본다 (1월에 12월 문자를 읽는 경우)
  const now = new Date();
  let y = now.getFullYear();
  if (new Date(y, mo - 1, da, hh, mi) - now > 36 * 3600 * 1000) y--;
  const rest = block.slice(block.indexOf(w[0]) + w[0].length);
  const merchant = (rest.split('\n').map((s) => s.trim()).find(Boolean) || '')
    .replace(/（/g, '(').replace(/）/g, ')');
  const inst = block.match(/(\d+)\s*개월/);
  return {
    cancel, amount: Number(a[1].replace(/,/g, '')),
    date: `${y}-${pad(mo)}-${pad(da)}`, time: `${pad(hh)}:${pad(mi)}`,
    merchant, inst: inst ? Number(inst[1]) : 0,
  };
}

// 전에 입력한 같은 가맹점의 카테고리를 먼저 따르고, 없으면 이름으로 짐작한다
function guessCategory(merchant) {
  const past = [...items].sort(byNewest).find((i) => i.type === 'out' && stripInst(i.memo) === merchant && merchant);
  if (past) return past.category;
  const hit = CAT_GUESS.find(([re]) => re.test(merchant));
  return hit ? hit[1] : '기타';
}
const smsMemo = (r) => r.merchant + (r.inst ? ` ${r.inst}개월 할부` : '');
const smsKey = (r) => `${r.date} ${r.time} ${r.amount} ${r.merchant}`;
const isDup = (r) => items.some((i) => i.smsKey === smsKey(r) ||
  (i.type === 'out' && i.date === r.date && i.time === r.time && i.amount === r.amount));

let smsRows = [], smsSkipped = 0;
// 읽은 결과를 상태별로 분류한다: new(새 결제) / dup(이미 있음) / offset(승인과 취소가 서로 상쇄)
// / remove(취소 -> 이미 입력한 내역 삭제) / missing(취소인데 원래 결제가 없음)
function analyzeSms(text) {
  const parsed = splitSms(text).map(parseSms);
  smsRows = parsed.filter(Boolean).map((p) => ({ ...p, status: 'new', include: true, category: '' }));
  smsSkipped = parsed.length - smsRows.length;
  const when = (r) => `${r.date} ${r.time}`;
  const used = new Set();
  for (const c of smsRows.filter((r) => r.cancel)) {
    const mate = smsRows.find((r) => !r.cancel && !used.has(r) && r.amount === c.amount &&
      r.merchant === c.merchant && when(r) <= when(c));
    if (mate) { used.add(mate); mate.status = c.status = 'offset'; mate.include = c.include = false; continue; }
    const target = [...items].sort(byNewest).find((i) => i.type === 'out' && i.amount === c.amount &&
      (!c.merchant || stripInst(i.memo) === c.merchant) && i.date <= c.date);
    if (target) { c.status = 'remove'; c.target = target; }
    else { c.status = 'missing'; c.include = false; }
  }
  for (const r of smsRows) {
    if (r.status !== 'new') continue;
    r.category = guessCategory(r.merchant);
    if (isDup(r)) { r.status = 'dup'; r.include = false; }
  }
  smsRows.sort((a, b) => when(a).localeCompare(when(b)));
}

const SMS_TAG = { new: '새 내역', dup: '이미 있어요', offset: '상쇄', remove: '기존 내역 삭제', missing: '원결제 없음' };
function renderSms() {
  const box = $('sms-result');
  box.innerHTML = '';
  const text = $('sms-text').value.trim();
  $('sms-sum').textContent = smsRows.length
    ? `결제 문자 ${smsRows.length}건을 읽었어요.${smsSkipped ? ` (읽지 못한 ${smsSkipped}건)` : ''}`
    : text ? '결제 문자를 찾지 못했어요. 금액(○○원)과 날짜·시각(10/10 20:15)이 들어 있는 승인 문자를 붙여넣어 주세요.' : '';
  smsRows.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'sms-row' + (r.include ? '' : ' off');
    const top = document.createElement('label');
    top.className = 'sms-top';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = r.include; cb.disabled = r.status === 'offset' || r.status === 'missing';
    cb.onchange = () => { r.include = cb.checked; renderSms(); };
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = `${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8))} ${r.time}`;
    const tag = document.createElement('span');
    tag.className = `chip st-${r.status}`;
    tag.textContent = SMS_TAG[r.status];
    const amt = document.createElement('b');
    amt.className = r.cancel ? 'in' : 'out';
    amt.textContent = (r.cancel ? '+' : '-') + won(r.amount);
    top.append(cb, when, tag, amt);
    el.appendChild(top);
    if (r.status === 'new' || r.status === 'dup') {
      const edit = document.createElement('div');
      edit.className = 'sms-edit';
      const name = document.createElement('input');
      name.type = 'text'; name.value = r.merchant; name.placeholder = '가맹점'; name.setAttribute('aria-label', '가맹점');
      name.oninput = () => { r.merchant = name.value.trim(); };
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', '카테고리');
      sel.innerHTML = CATEGORIES.out.map((c) => `<option>${c}</option>`).join('');
      sel.value = r.category;
      sel.onchange = () => { r.category = sel.value; };
      edit.append(name, sel);
      el.appendChild(edit);
    } else {
      const nm = document.createElement('div');
      nm.className = 'sms-name';
      nm.textContent = r.merchant;
      el.appendChild(nm);
    }
    box.appendChild(el);
  });
  const n = smsRows.filter((r) => r.include).length;
  $('sms-add').textContent = n ? `${n}건 반영` : '반영';
  $('sms-add').disabled = !n;
}

function openSms(text) {
  $('sms-text').value = text || '';
  analyzeSms($('sms-text').value);
  renderSms();
  if (!$('sdlg').open) $('sdlg').showModal();
}
$('sms-open').onclick = () => openSms('');
$('sms-close').onclick = () => $('sdlg').close();
$('sms-clear').onclick = () => openSms('');
$('sms-text').addEventListener('input', () => { analyzeSms($('sms-text').value); renderSms(); });
$('sms-paste').onclick = async () => {
  try {
    $('sms-text').value = await navigator.clipboard.readText();
    analyzeSms($('sms-text').value); renderSms();
  } catch {
    alert('클립보드를 읽을 수 없어요. 위 입력칸을 길게 눌러서 직접 붙여넣어 주세요.');
  }
};
$('sms-add').onclick = () => {
  let added = 0, removed = 0, lastDate = '';
  smsRows.forEach((r, n) => {
    if (!r.include) return;
    if (r.status === 'remove') { items = items.filter((i) => i !== r.target); removed++; return; }
    items.push({
      id: Date.now() + n, type: 'out', amount: r.amount, category: r.category, pay: 'card',
      date: r.date, time: r.time, memo: smsMemo(r), smsKey: smsKey(r),
    });
    added++; lastDate = r.date;
  });
  save();
  if (lastDate) { const d = parseDate(lastDate); cur = new Date(d.getFullYear(), d.getMonth(), 1); }
  // 알림 배너를 같이 쓴다
  fixedNotice = [added && `문자에서 ${added}건을 추가했어요.`, removed && `취소된 ${removed}건은 삭제했어요.`].filter(Boolean).join(' ');
  tab = 'list';
  $('sdlg').close();
  render();
};

// ---- 내보내기 / 백업 ----
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('export-csv').onclick = () => {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [...items].sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => [i.date, i.time || '', i.type === 'out' ? '지출' : '수입', i.category, PAY[i.pay] || '', MOODS[i.mood] || '', i.amount, i.memo].map(esc).join(','));
  download('가계부.csv', '﻿날짜,시각,구분,카테고리,결제수단,소비성격,금액,메모\n' + rows.join('\n'), 'text/csv');
};
$('export-json').onclick = () =>
  download('가계부-백업.json', JSON.stringify({ version: 2, items, settings }), 'application/json');
$('import-json').onclick = () => $('import-file').click();
$('import-file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data) ? data : data.items;   // 예전 백업은 배열만 들어 있음
    if (!Array.isArray(list)) throw 0;
    if (!confirm(`현재 데이터를 백업 ${list.length}건으로 교체할까요?`)) return;
    items = list; save();
    if (!Array.isArray(data)) { settings = normSettings(data.settings); saveSettings(); }
    render();
  } catch { alert('올바른 백업 파일이 아니에요.'); }
  e.target.value = '';
};

// ---- 좌우 스와이프로 월(연별 보기에서는 연도) 이동 ----
const EDGE = 24;      // 화면 가장자리는 브라우저의 '뒤로 가기' 제스처와 겹쳐서 제외
const MIN_DX = 60;    // 이만큼 이상 가로로 움직여야 스와이프로 인정
let swipe = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  const ok = e.touches.length === 1 && tab !== 'settings' && !$('dlg').open && !$('fdlg').open &&
    t.clientX > EDGE && t.clientX < window.innerWidth - EDGE;
  swipe = ok ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  swipe = null;
  // 세로 스크롤과 구분: 가로 이동이 충분히 크고 세로보다 확실히 클 때만
  if (Math.abs(dx) >= MIN_DX && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });

// 목록을 아래로 내리는 동안에는 + 버튼을 숨겨 금액을 가리지 않고, 위로 올리면 다시 보여준다
let lastY = window.scrollY;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y > lastY + 6 && y > 80) $('fab').classList.add('away');
  else if (y < lastY - 6 || y <= 80) $('fab').classList.remove('away');
  lastY = y;
}, { passive: true });

// 앱을 켜 둔 채 날짜가 바뀌었거나 백그라운드에서 돌아왔을 때도 고정지출을 반영
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();

// 문자 앱에서 '공유'로 열었을 때 (?text=...) 바로 읽기 창을 띄운다
{
  const q = new URLSearchParams(location.search);
  const shared = q.get('text') || q.get('title');
  if (shared) { history.replaceState(null, '', location.pathname); openSms(shared); }
}
