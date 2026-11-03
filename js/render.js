// 화면 그리기: 내역, 달력, 통계
function itemEl(i) {
  const li = document.createElement('li');
  li.className = 'item' + (freshIds.has(i.id) ? ' fresh' : '');   // 방금 들어온 내역은 잠깐 반짝인다
  li.innerHTML = `<div><div class="cat"><i class="dot"></i><span></span></div><div class="memo"></div></div><div class="amt ${i.type}"></div>`;
  li.querySelector('.dot').style.background = color(i.category);
  // 제목은 가맹점·메모(없으면 카테고리). 알림으로 들어온 내역은 카테고리가 대부분 '기타'라서 메모가 더 알아보기 쉽다
  li.querySelector('.cat span').textContent = i.memo || i.category;
  const memo = li.querySelector('.memo');
  const bits = [];
  if (i.memo) bits.push(i.category);
  if (i.type === 'out' && i.time) bits.push(i.time);
  if (i.type === 'out' && PAY[i.pay]) bits.push(PAY[i.pay]);
  memo.textContent = bits.join(' · ');
  if (i.type === 'out' && MOODS[i.mood]) {
    const chip = document.createElement('span');
    chip.className = `chip mood-${i.mood}`;
    chip.textContent = MOODS[i.mood];
    memo.prepend(chip);
  }
  if (i.auto) {   // 결제 알림에서 확인 없이 자동으로 들어온 내역 (눌러서 고치면 표시가 사라진다)
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = '자동';
    memo.prepend(chip);
  }
  li.querySelector('.amt').textContent = (i.type === 'out' ? '-' : '+') + won(i.amount);
  li.onclick = () => openDialog(i);
  return li;
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
  box.hidden = tab !== 'list' || !info || !info.amount;   // 낼 금액이 없으면 홈을 차지하지 않는다
  if (!box.hidden) {
    box.innerHTML = '<span>카드 출금 <em></em><small></small></span><b></b>';
    box.querySelector('em').textContent = `${info.when} (${info.dateText})`;
    box.querySelector('small').textContent = `${info.period} 사용분`;
    box.querySelector('b').textContent = `예정 ${won(info.amount)}`;
  }

  // 백업 안내: 한 번도 백업하지 않았는데 내역이 쌓였거나, 마지막 백업이 오래됐을 때만
  const tip = $('backup-tip');
  const why = tab === 'list' ? backupDue() : null;
  tip.hidden = !why;
  if (why) {
    tip.innerHTML = '<span></span><div><button id="tip-snooze">나중에</button><button id="tip-backup" class="primary">백업</button></div>';
    tip.querySelector('span').textContent = why;
  }

  // 안드로이드 앱: 모아 둔 결제 알림이 있으면 알리고, 알림 접근이 꺼져 있으면 켜도록 안내한다
  const pt = $('pending-tip');
  pt.hidden = tab !== 'list' || !pending.length;
  if (!pt.hidden) {
    pt.innerHTML = '<span></span><div><button id="pending-clear">지우기</button><button id="pending-open" class="primary">확인</button></div>';
    pt.querySelector('span').textContent = settings.autoApply
      ? `확인이 필요한 결제 알림 ${pending.length}건이 있어요.` : `결제 알림 ${pending.length}건이 있어요.`;
  }
  const nt = $('np-tip');
  nt.hidden = tab !== 'list' || !NP || npEnabled !== false || settings.npDismissed;
  if (!nt.hidden) {
    nt.innerHTML = '<span>결제 알림 자동 읽기가 꺼져 있어요.</span><div><button id="np-tip-later">나중에</button><button id="np-tip-on" class="primary">켜기</button></div>';
  }
  $('info-box').hidden = box.hidden && up.hidden && tip.hidden && pt.hidden && nt.hidden;
}
function backupDue() {
  if (!items.length || (settings.backupSnooze && settings.backupSnooze > today())) return null;
  if (!settings.lastBackup) return items.length >= 10 ? '아직 백업한 적이 없어요. 폰을 바꾸거나 앱을 지우면 내역이 사라져요.' : null;
  const days = Math.round((parseDate(today()) - parseDate(settings.lastBackup)) / 86400000);
  return days >= 30 ? `마지막 백업이 ${days}일 전이에요.` : null;
}
$('backup-tip').addEventListener('click', (e) => {
  if (e.target.id === 'tip-backup') $('export-json').click();
  else if (e.target.id === 'tip-snooze') {
    const d = new Date(); d.setDate(d.getDate() + 7);
    settings.backupSnooze = ymd(d); saveSettings(); render();
  }
});

// 날짜 머리글: 왼쪽에 날짜(공휴일 이름), 오른쪽에 그날 지출 합계
function dayHead(date, month) {
  const li = document.createElement('li');
  li.className = 'day';
  const label = document.createElement('span');
  label.textContent = dayLabel(date);
  li.appendChild(label);
  const out = month.reduce((s, i) => (i.date === date && i.type === 'out' ? s + i.amount : s), 0);
  if (out) {
    const sum = document.createElement('span');
    sum.className = 'day-sum';
    sum.textContent = '-' + won(out);
    li.appendChild(sum);
  }
  return li;
}

function renderList(month) {
  const list = $('list');
  list.innerHTML = '';
  let lastDate = '';
  for (const i of month) {
    if (i.date !== lastDate) {
      lastDate = i.date;
      list.appendChild(dayHead(i.date, month));
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
    const wd = new Date(y, m, d).getDay();
    const hol = holidayName(date);
    const cls = ['day-cell', date === today() ? 'today' : '', date === selDay ? 'sel' : '',
      wd === 6 ? 'sat' : '', wd === 0 || hol ? 'off' : ''].join(' ');   // 토요일은 파랑, 일요일·공휴일은 빨강
    html += `<button class="${cls}" data-date="${date}"${hol ? ` title="${hol}"` : ''}><b>${d}</b>` +
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
  list.appendChild(dayHead(selDay, month));
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
