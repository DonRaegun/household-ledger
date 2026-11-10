// 화면 그리기: 내역, 달력, 통계
function itemEl(i) {
  const li = document.createElement('li');
  li.className = 'item' + (freshIds.has(i.id) ? ' fresh' : '');   // 방금 들어온 내역은 잠깐 반짝인다
  li.innerHTML = `<span class="ico"></span><div class="body"><div class="cat"><span></span></div><div class="memo"></div></div><div class="amt ${i.type}"></div>`;
  const ico = li.querySelector('.ico');
  ico.innerHTML = catIcon(i.category);
  ico.style.setProperty('--c', color(i.category));
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
  $('month').disabled = tab === 'settings';
  $('prev').style.visibility = $('next').style.visibility = tab === 'settings' ? 'hidden' : 'visible';

  const month = items.filter((i) => i.date.startsWith(ym(cur))).sort(byNewest);
  const period = yearView ? items.filter((i) => i.date.startsWith(y + '-')) : month;

  const sum = (t) => period.filter((i) => i.type === t).reduce((s, i) => s + i.amount, 0);
  const inc = sum('in'), out = sum('out');
  const tot = totalsOf(period);   // 정산으로 돌려받은 돈은 지출에서 빼고, 수입에서도 뺀다
  $('sum-in').textContent = won(tot.netIn);
  $('sum-out').textContent = won(tot.netOut);
  $('sum-bal').textContent = won(tot.bal);
  $('sum-settle').hidden = !tot.settle;
  $('sum-settle').textContent = tot.settle ? `정산으로 돌려받은 ${won(tot.settle)}을 뺀 금액이에요` : '';
  $('summary').hidden = tab !== 'list';   // 통계에서는 도넛 가운데에 총 지출이 있으니 같은 카드를 또 보여 주지 않는다

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
  if ($('hdlg').open) renderHistory();   // 이전 내역 창이 열려 있는 동안 내역을 고치면 같이 갱신한다
  if ($('qdlg').open) renderSearch();   // 검색 창이 열려 있는 동안 내역을 고치면 결과도 같이 갱신한다
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
  up.hidden = tab !== 'list';   // 고정지출 창으로 들어가는 줄: 예정이 있으면 예정을, 없으면 등록된 고정지출을 보여 준다
  if (!up.hidden && !upcoming.length) {
    up.innerHTML = '<span></span><b></b>';
    up.querySelector('span').textContent = settings.fixed.length ? `고정지출 ${settings.fixed.length}개` : '고정지출 추가하기';
    up.querySelector('b').textContent = settings.fixed.length ? `월 ${won(settings.fixed.reduce((s, f) => s + f.amount, 0))}` : '';
  } else if (!up.hidden) {
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

  // 백업 안내: 한 번도 백업하지 않았는데 내역이 쌓였거나, 마지막 백업이 오래됐을 때만.
  // 홈을 차지하지 않도록 설정 탭의 '데이터 관리' 위에서 보여 주고, 홈에서는 설정 탭의 점으로만 알린다
  const tip = $('backup-tip');
  const due = backupDue();
  const why = tab === 'settings' ? due : null;
  document.querySelector('nav [data-tab=settings]').classList.toggle('badge', !!due);
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
  $('info-box').hidden = pt.hidden && nt.hidden;
  $('summary').querySelector('.s-extra').hidden = box.hidden && up.hidden;
  renderFixedList();
  const n = tab === 'list' ? items.filter((i) => i.date.startsWith(ym(cur))).length : 0;
  $('list-count').textContent = n ? `${n}건` : '';
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
  // 그날의 지출(-)과 수입(+)을 둘 다 보여 준다. 수입만 있는 날도 비지 않는다
  const sumOf = (t) => month.reduce((s, i) => (i.date === date && i.type === t ? s + i.amount : s), 0);
  const out = sumOf('out'), inc = sumOf('in');
  if (out || inc) {
    const box = document.createElement('span');
    box.className = 'day-sums';
    if (out) { const e = document.createElement('span'); e.className = 'day-sum'; e.textContent = '-' + won(out); box.appendChild(e); }
    if (inc) { const e = document.createElement('span'); e.className = 'day-sum in'; e.textContent = '+' + won(inc); box.appendChild(e); }
    li.appendChild(box);
  }
  return li;
}

// ---- 내역 목록: 오늘(지난 달을 볼 때는 그 달의 마지막 날) 내역만 펼쳐 두고, 나머지는 '내역 더보기' 창에서 본다 ----
function pinnedDate(month) {
  return ym(cur) === today().slice(0, 7) ? today() : month.length ? month[0].date : '';   // month는 최신순
}
function renderList(month) {
  const list = $('list');
  list.innerHTML = '';
  const pin = pinnedDate(month);
  if (month.length) {
    list.appendChild(dayHead(pin, month));
    const pinned = month.filter((i) => i.date === pin);
    if (pinned.length) pinned.forEach((i) => list.appendChild(itemEl(i)));
    else {
      const li = document.createElement('li');
      li.className = 'none';
      li.textContent = '오늘은 아직 내역이 없어요.';
      list.appendChild(li);
    }
  }
  const btn = $('hist-open');
  btn.hidden = !month.length;   // 그 달에 내역이 있으면 늘 보인다 (오늘 내역만 있어도)
  btn.textContent = '이전 내역 보기';
  $('empty').hidden = month.length > 0;
}

// 이전 내역 창: 보고 있는 그 달의 내역 전체를 날짜별로 보여 준다
let histMode = null;   // null: 이전 내역(그 달 전체), { mood }: 통계에서 연 소비 평가별 지출 목록
function renderHistory() {
  const yearView = !!histMode && tab === 'stats' && statsMode === 'year';
  const col = (label, text, cls = '') => `<div class="${cls}"><small>${label}</small><b>${text}</b></div>`;
  $('h-close').innerHTML = `<i aria-hidden="true">‹</i> ${histMode ? '통계' : '내역'}`;
  const list = $('h-list');
  list.innerHTML = '';
  let shown;
  if (histMode) {   // 통계의 소비 평가 줄을 눌러 연 목록: 그 기간(월별은 그 달, 연별은 그 해)에서 그 평가의 지출만
    const base = items.filter((i) => i.type === 'out' && i.date.startsWith(yearView ? cur.getFullYear() + '-' : ym(cur)))
      .filter((i) => (histMode.mood === 'none' ? !MOODS[i.mood] : i.mood === histMode.mood)).sort(byNewest);
    const label = histMode.mood === 'none' ? '평가하지 않은 지출' : `${MOODS[histMode.mood]} 지출`;
    const sum = base.reduce((s, i) => s + i.amount, 0);
    $('h-title').textContent = yearView ? `${cur.getFullYear()}년` : `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`;
    $('h-sum').innerHTML = base.length
      ? `<span class="hs-n">${label} · ${base.length}건</span><div class="hs-cols">${col('합계', won(sum), histMode.mood === 'regret' ? 'o' : '')}</div>`
      : `${label}이 없어요.`;
    shown = base;
  } else {
    const month = items.filter((i) => i.date.startsWith(ym(cur))).sort(byNewest);
    const tt = totalsOf(month);
    const out = tt.netOut;
    $('h-title').textContent = `${cur.getFullYear()}년 ${cur.getMonth() + 1}월`;
    const inc = tt.netIn;
    // 지출은 늘, 수입이 있는 달에는 수입과 합계도 같이 보여 준다
    $('h-sum').innerHTML = month.length
      ? `<span class="hs-n">${month.length}건</span><div class="hs-cols">${col('지출', won(out), 'o')}${inc ? col('수입', won(inc), 'i') : ''}${tt.inc ? col('합계', won(tt.bal)) : ''}</div>${tt.settle ? `<span class="hs-note">정산 ${won(tt.settle)}을 지출에서 뺐어요</span>` : ''}`
      : '이 달에는 내역이 없어요.';
    shown = month;
  }
  let last = '';
  for (const i of shown) {
    if (i.date !== last) { last = i.date; list.appendChild(dayHead(i.date, shown)); }
    list.appendChild(itemEl(i));   // 눌러서 수정·삭제하면 저장 뒤 render()가 이 목록도 다시 그린다
  }
}
$('hist-open').onclick = () => { histMode = null; renderHistory(); $('hdlg').showModal(); $('h-list').scrollTop = 0; };
$('h-close').onclick = () => $('hdlg').close();
$('hdlg').addEventListener('close', () => { histMode = null; });
// 통계의 소비 평가 줄(필수·선택·후회·미분류)을 누르면 그 평가의 지출 목록이 페이지로 열린다
$('mood-stats').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-key]');
  if (!li) return;
  histMode = { mood: li.dataset.key };
  renderHistory();
  $('hdlg').showModal();
  $('h-list').scrollTop = 0;
});
// 페이지 안에서 달 넘기기: 화살표나 좌우로 밀기 (달이 바뀌면 뒤의 내역 화면도 같은 달이 된다)
const histMove = (step) => { move(step); playIn($('h-list'), step > 0 ? 'from-right' : 'from-left'); };
$('h-prev').onclick = () => histMove(-1);
$('h-next').onclick = () => histMove(1);
{
  let hs = null;
  const hl = $('h-list');
  hl.addEventListener('touchstart', (e) => { const t = e.touches[0]; hs = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
  hl.addEventListener('touchend', (e) => {
    if (!hs) return;
    const t = e.changedTouches[0], dx = t.clientX - hs.x, dy = t.clientY - hs.y;
    hs = null;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) histMove(dx < 0 ? 1 : -1);
  }, { passive: true });
  hl.addEventListener('touchcancel', () => { hs = null; }, { passive: true });
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

let currentPeriodForYear = [];
// 통계 위쪽의 비교 카드: 지난달(연별은 작년)보다 얼마나 더·덜 썼는지
function renderCompare(out, yearView, byCat, prevCat) {
  renderCompareCard(out, yearView, byCat, prevCat);
  syncCmpLoop(cmpState.n, cmpState.reset);
}
const cmpState = { n: 0, reset: false };
function renderCompareCard(out, yearView, byCat, prevCat) {
  const box = $('cmp');
  const { prev, running } = previousSpending(items, cur, yearView);
  const name = (yearView ? '작년' : '지난달') + (running ? ' 같은 기간' : '');
  const word = yearView ? '올해' : '이번 달';
  const showMonth = !!prev && !!out;   // 비교할 지난 기간의 지출이 없으면 그 칸은 보여 주지 않는다
  const showWeek = !yearView;   // 지출이 없는 달도 주별 그래프 카드는 보여 준다
  $('cmp-s1').hidden = !showMonth;
  $('cmp-s2').hidden = !showWeek;
  // 카드 안에서 옆으로 밀어 보는 칸: 그래프(연별은 월별 지출, 월별은 주별 지출)가 먼저, 지난 기간 비교가 다음
  const showBudget = !yearView;   // 월 예산 칸은 월별 보기에서만
  $('cmp-s3').hidden = !showBudget;
  const n = [yearView, showWeek, showMonth, showBudget].filter(Boolean).length;
  box.hidden = n === 0;
  box.classList.toggle('multi', n > 1);
  const dots = $('cmp-dots');
  dots.hidden = n < 2;
  const kind = `${yearView}|${showWeek}|${showMonth}|${showBudget}`;
  cmpState.n = n;
  cmpState.reset = dots.dataset.kind !== kind;   // 보이는 칸이 바뀌면 첫 칸부터 보여 주고 점도 다시 만든다
  if (cmpState.reset) {
    dots.dataset.kind = kind;
    dots.innerHTML = '<i></i>'.repeat(n);
  }
  if (showWeek) renderWeekly();
  if (showBudget) renderBudget();
  if (yearView) renderYearBars(currentPeriodForYear);
  if (!showMonth) return;
  const diff = out - prev;
  const pct = Math.round((Math.abs(diff) / prev) * 100);
  $('cmp-label').textContent = `${name}보다`;
  const el = $('cmp-diff');
  el.className = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
  el.textContent = diff === 0 ? '똑같이 썼어요' : `${diff > 0 ? '▲' : '▼'} ${won(Math.abs(diff))} ${diff > 0 ? '더' : '덜'} 썼어요 (${pct}%)`;
  $('cmp-detail').textContent = `${word} ${won(out)} · ${name} ${won(prev)}`;
  // 무엇이 달라졌는지: 지난 기간과 비교해서 가장 많이 늘어난(늘지 않았다면 줄어든) 카테고리
  const cats = [...new Set([...Object.keys(byCat), ...Object.keys(prevCat)])].map((c) => [c, (byCat[c] || 0) - (prevCat[c] || 0)]);
  const up = cats.filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1])[0];
  const down = cats.filter(([, d]) => d < 0).sort((a, b) => a[1] - b[1])[0];
  const pick = diff >= 0 ? up : down;
  const top = $('cmp-top');
  top.hidden = !pick;
  if (pick) top.textContent = `${diff >= 0 ? '가장 많이 늘어난 곳' : '가장 많이 줄어든 곳'}: ${pick[0]} ${pick[1] > 0 ? '▲' : '▼'} ${won(Math.abs(pick[1]))}`;
}

// 비교 카드의 월 예산 칸: 예산을 정하면 남은 돈, 쓴 비율 막대, 하루에 쓸 수 있는 돈을 보여 준다 (정산을 뺀 실지출 기준)
function renderBudget() {
  const budget = settings.budget;
  const btn = $('bd-edit');
  btn.textContent = budget ? '예산 바꾸기' : '예산 정하기';
  btn.classList.toggle('primary', !budget);
  const fill = $('bd-fill');
  if (!budget) {
    $('bd-main').textContent = '예산을 정해 보세요';
    $('bd-detail').textContent = '남은 돈과 하루에 쓸 수 있는 돈을 알려 드려요';
    $('bd-day').textContent = '';
    fill.style.width = '0%';
    return;
  }
  const spent = totalsOf(items.filter((i) => i.date.startsWith(ym(cur)))).netOut;
  const b = budgetStatus(spent, budget, cur);
  const pct = Math.round(b.ratio * 100);
  $('bd-main').textContent = b.over ? `${won(-b.left)} 넘게 썼어요` : `남은 돈 ${won(b.left)}`;
  $('bd-detail').textContent = `쓴 돈 ${won(spent)} · 예산 ${won(budget)} (${pct}%)`;
  $('bd-day').textContent = b.daysLeft === 0 ? `예산의 ${pct}%를 썼어요`
    : b.over ? '이번 달 예산을 다 썼어요'
    : `하루 ${won(b.perDay)} 쓸 수 있어요 · ${b.daysLeft}일 남음`;
  fill.style.width = Math.min(100, pct) + '%';
  fill.style.background = b.ratio >= 1 ? 'var(--out)' : b.ratio >= 0.8 ? 'var(--warn)' : '';   // 80%부터 주황, 넘으면 붉은색
}

// 카드 칸 순환: [마지막 복사본][칸1][칸2]...[마지막][첫째 복사본]. 복사본은 눌러지지 않고 화면 읽기에서도 빠진다
function syncCmpLoop(n, reset) {
  const tr = $('cmp-track');
  tr.querySelectorAll('.cmp-clone').forEach((e) => e.remove());
  if (n < 2) { tr.scrollLeft = 0; return; }
  const w = tr.clientWidth || 1;
  const k = reset ? 1 : Math.max(1, Math.round(tr.scrollLeft / w));   // 다시 그릴 때 보던 칸을 그대로 둔다
  const real = [...tr.querySelectorAll('.cmp-slide:not([hidden])')];
  const mk = (el) => {
    const c = el.cloneNode(true);
    c.removeAttribute('id');
    c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    c.classList.add('cmp-clone');
    c.setAttribute('aria-hidden', 'true');
    c.inert = true;
    return c;
  };
  tr.insertBefore(mk(real[real.length - 1]), tr.firstChild);
  tr.appendChild(mk(real[0]));
  jumpCmp(Math.min(k, n));
  syncCmpDots();
}
function jumpCmp(idx) {   // 애니메이션 없이 칸 위치로 옮긴다 (옮기는 동안만 자석 정렬을 끈다)
  const tr = $('cmp-track');
  tr.style.scrollSnapType = 'none';
  tr.scrollLeft = idx * tr.clientWidth;
  requestAnimationFrame(() => { tr.style.scrollSnapType = ''; });
}

// 비교 카드의 두 번째 칸: 주별(7일 단위) 지출 꺾은선 그래프. 월간 그래프와 같은 모양이고, 점을 누르면 그 주의 금액이 뜬다
function renderWeekly() {
  const weeks = weeklySpending(items, cur, statsHasSettle && statsNet);
  const t = today();
  const now = ym(cur) === t.slice(0, 7) ? weeks.find((w) => Number(t.slice(8)) >= w.from && Number(t.slice(8)) <= w.to) : null;
  const top = now || weeks.reduce((a, w) => (w.sum > a.sum ? w : a), weeks[0]);
  $('wk-label').textContent = '주별 지출 (7일 단위)';
  const last = now ? now.n - 1 : weeks.length - 1;   // 이번 달이면 이번 주까지만 이어 그린다
  const box = $('wk-chart');
  const W = Math.max(200, $('cmp').clientWidth - 36), H = 72, padT = 20, padB = 6;
  const key = `${ym(cur)}|${W}|${weeks.map((w) => w.sum).join(',')}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.dataset.sel = '';
  const max = Math.max(...weeks.map((w) => w.sum), 1);
  const col = W / weeks.length, f = (n) => n.toFixed(1);
  const pts = weeks.slice(0, last + 1).map((w, k) => [(k + 0.5) * col, padT + (1 - w.sum / max) * (H - padT - padB)]);
  const line = pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  const grid = [0.5, 1].map((g) => { const y = padT + g * (H - padT - padB); return `<line class="yc-grid" x1="0" x2="${W}" y1="${f(y)}" y2="${f(y)}"/>`; }).join('');
  const hi = top.n - 1;
  const dots = pts.map(([x, y], k) => `<circle class="yc-dot${k === hi ? ' now' : ''}" cx="${f(x)}" cy="${f(y)}" r="${k === hi ? 5 : 3.5}" style="animation-delay:${350 + k * 60}ms"/>`).join('');
  const vals = pts.map(([x, y], k) => (k === hi && weeks[k].sum)
    ? `<text class="yc-val" data-k="${k}" x="${f(x)}" y="${f(y - 10)}" text-anchor="${x < 30 ? 'start' : x > W - 30 ? 'end' : 'middle'}">${won(weeks[k].sum)}</text>` : '').join('');
  box.innerHTML =
    `<svg class="yc-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">` +
    '<defs><linearGradient id="yw-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".30"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>' +
    grid +
    `<polygon class="yc-area" points="${f(pts[0][0])},${H} ${line} ${f(pts[pts.length - 1][0])},${H}" fill="url(#yw-fill)"/>` +
    `<polyline class="yc-line" points="${line}" pathLength="1" fill="none"/>` +
    dots + vals + '<text class="yc-sel" hidden></text></svg>' +
    '<div class="yc-cols">' + weeks.map((w, k) =>
      `<button type="button" data-m="${k}" data-v="${w.sum}" class="${k === hi ? 'now' : ''}${k > last ? ' off' : ''}" aria-label="${w.n}주차"><em>${w.n}주</em></button>`).join('') + '</div>';
  box._pts = pts;
}

function renderStats(period, out, yearView) {
  $('year-wrap').hidden = !yearView;
  currentPeriodForYear = period;

  const outs = period.filter((i) => i.type === 'out');
  const byCat = {};
  outs.forEach((i) => (byCat[i.category] = (byCat[i.category] || 0) + i.amount));
  const prevCat = previousByCategory(items, cur, yearView);
  const hasPrev = Object.keys(prevCat).length > 0;   // 비교할 지난 기간의 지출이 없으면 증감을 보여 주지 않는다
  // 정산(더치페이로 돌려받은 돈) 여부와 실지출 보기 여부는 위쪽 카드의 그래프도 따르므로 먼저 정한다
  const settleItems = period.filter((i) => i.type === 'in' && i.category === '정산');
  const settleTotal = settleItems.reduce((s, i) => s + i.amount, 0);
  statsHasSettle = settleTotal > 0;
  const showNet = statsHasSettle && statsNet;
  renderCompare(out, yearView, byCat, prevCat);
  // 정산(더치페이로 돌려받은 돈): 어떤 지출인지 정한 것은 그 카테고리에서 빼서 실지출로 보여 주고, 못 뺀 나머지는 목록 아래 한 줄로 알린다.
  // 도넛 가운데를 누르면 총 지출(정산 전)로 바꿔 볼 수 있다
  let leftover = 0;
  const ratioByCat = {};   // 카테고리별 (정산을 뺀 지출 / 원래 지출). 결제수단·소비 평가 막대도 이 비율로 줄인다
  if (showNet) {
    const grossByCat = { ...byCat };
    const toCat = {};
    settleItems.forEach((i) => { if (i.forCat) toCat[i.forCat] = (toCat[i.forCat] || 0) + i.amount; });
    let deducted = 0;
    for (const [c, a] of Object.entries(toCat)) {
      const d = Math.min(a, byCat[c] || 0);
      if (d) { byCat[c] -= d; deducted += d; if (byCat[c] === 0) delete byCat[c]; }
    }
    leftover = settleTotal - deducted;
    for (const c of Object.keys(grossByCat)) ratioByCat[c] = grossByCat[c] ? (byCat[c] || 0) / grossByCat[c] : 1;
  }
  const shownTotal = showNet ? Math.max(0, out - settleTotal) : out;   // 도넛 가운데에 보이는 값 (내역 요약의 지출과 같다)
  // 통계는 큰 카테고리(묶음)로 보여 주고, 고른 묶음 아래에 작은 카테고리를 펼친다
  const byGroup = {}, prevGroup = {};
  for (const [c, a] of Object.entries(byCat)) byGroup[groupOf(c)] = (byGroup[groupOf(c)] || 0) + a;
  for (const [c, a] of Object.entries(prevCat)) prevGroup[groupOf(c)] = (prevGroup[groupOf(c)] || 0) + a;
  const rows = Object.entries(byGroup).sort((a, b) => b[1] - a[1]);
  const den = rows.reduce((s, [, a]) => s + a, 0) || 1;   // 비율의 바탕: 목록에 보이는 카테고리 합
  if (selCat && !byGroup[selCat]) selCat = null;
  // 지난 기간 대비 증감 (같은 날짜 기준으로 맞춘 값)
  const setDelta = (dl, amt, prev) => {
    const diff = amt - (prev || 0);
    dl.hidden = !hasPrev || diff === 0;
    if (!dl.hidden) {
      dl.className = 'delta ' + (prev === undefined ? 'new' : diff > 0 ? 'up' : 'down');
      dl.textContent = prev === undefined ? '새로 생겼어요' : `${diff > 0 ? '▲' : '▼'} ${won(Math.abs(diff))}`;
    }
  };

  const stats = $('stats');
  stats.innerHTML = '';
  if (!rows.length) stats.innerHTML = '<li class="plain">지출 내역이 없어요.</li>';
  // 도넛에서 고른 묶음은 선택된 동안만 목록 맨 위로 올려서, 아래로 스크롤하지 않아도 바로 보이게 한다
  const ordered = selCat ? [rows.find(([c]) => c === selCat), ...rows.filter(([c]) => c !== selCat)] : rows;
  for (const [cat, amt] of ordered) {
    const li = document.createElement('li');
    li.dataset.cat = cat;
    if (cat === selCat) li.classList.add('sel');
    li.innerHTML = '<div class="top"><span class="name"><i class="dot"></i><em></em></span><span class="r"><b></b><small class="delta"></small></span></div><div class="bar"><i></i></div>';
    li.querySelector('.dot').style.background = groupColor(cat);
    li.querySelector('em').textContent = `${cat} (${Math.round((amt / den) * 100)}%)`;
    li.querySelector('b').textContent = won(amt);
    setDelta(li.querySelector('.delta'), amt, prevGroup[cat]);
    const bar = li.querySelector('.bar i');
    bar.style.width = (amt / rows[0][1]) * 100 + '%';
    bar.style.background = groupColor(cat);
    const subs = Object.entries(byCat).filter(([c]) => groupOf(c) === cat).sort((a, b) => b[1] - a[1]);
    if (cat === selCat && subs.length) {   // 고른 묶음의 작은 카테고리를 보여 준다 (하나뿐이어도, 묶음과 이름이 같아도 보여 준다)
      const ul = document.createElement('ul');
      ul.className = 'subs';
      for (const [c, a] of subs) {
        const s = document.createElement('li');
        s.innerHTML = '<span class="ico"></span><em></em><span class="r"><b></b><small class="delta"></small></span>';
        s.querySelector('.ico').innerHTML = catIcon(c);
        s.querySelector('.ico').style.setProperty('--c', groupColor(cat));
        s.querySelector('em').textContent = `${c} (${Math.round((a / amt) * 100)}%)`;
        s.querySelector('b').textContent = won(a);
        setDelta(s.querySelector('.delta'), a, prevCat[c]);
        ul.appendChild(s);
      }
      li.appendChild(ul);
      playIn(ul, 'fade-in');
    }
    stats.appendChild(li);
  }
  const note = showNet ? leftover : (statsHasSettle ? settleTotal : 0);   // 실지출 보기에서는 못 뺀 정산만, 총 지출 보기에서는 정산 전체를 참고로 보여 준다
  if (note) {
    const sl = document.createElement('li');
    sl.className = 'settle';
    sl.innerHTML = '<span></span><b></b>';
    sl.querySelector('span').textContent = showNet ? '정산 (지출 카테고리를 정하지 않은 것)' : '정산으로 돌려받음';
    sl.querySelector('b').textContent = '-' + won(note);
    stats.appendChild(sl);
  }
  renderDonut(rows, den, shownTotal);

  // 결제수단별 합계 (결제수단이 없는 예전 내역은 '미지정')
  const byPay = { cash: 0, card: 0, transfer: 0, none: 0 };
  const splitNote = showNet && settleTotal ? (leftover ? `정산 ${won(settleTotal - leftover)}을 뺀 금액이에요 (카테고리를 정하지 않은 정산은 빼지 않았어요)` : `정산 ${won(settleTotal)}을 뺀 금액이에요`) : '';
  const wgt = (i) => (showNet && ratioByCat[i.category] !== undefined ? ratioByCat[i.category] : 1);   // 실지출 보기: 정산을 뺀 만큼 줄인 몫
  outs.forEach((i) => (byPay[PAY[i.pay] ? i.pay : 'none'] += i.amount * wgt(i)));
  Object.keys(byPay).forEach((k) => { byPay[k] = Math.round(byPay[k]); });
  // 결제수단이 한 종류뿐이면 "카드 100%"가 되어 정보가 없으므로, 두 종류 이상일 때만 보여준다
  $('pay-wrap').hidden = new Set(outs.map((i) => (PAY[i.pay] ? i.pay : 'none'))).size < 2;
  $('pay-stats').innerHTML = splitBar([...Object.keys(PAY), 'none'].map((k) => ({ label: PAY[k] || '미지정', amt: byPay[k], color: PAY_COLORS[k] })), Object.values(byPay).reduce((s, v) => s + v, 0), splitNote);

  // 소비 평가별 합계 (평가를 한 번도 고르지 않았으면 이 영역 자체를 보이지 않는다)
  const byMood = { need: 0, want: 0, regret: 0, none: 0 };
  outs.forEach((i) => (byMood[MOODS[i.mood] ? i.mood : 'none'] += i.amount * wgt(i)));
  Object.keys(byMood).forEach((k) => { byMood[k] = Math.round(byMood[k]); });
  $('mood-wrap').hidden = !outs.length || !items.some((i) => MOODS[i.mood]);
  $('mood-stats').innerHTML = outs.some((i) => MOODS[i.mood])
    ? splitBar([...Object.keys(MOODS), 'none'].map((k) => ({ label: MOODS[k] || '미분류', amt: byMood[k], color: MOOD_COLORS[k], warn: k === 'regret', key: k })), Object.values(byMood).reduce((s, v) => s + v, 0), splitNote)
    : '<li class="plain">이 기간에는 소비 평가를 고른 지출이 없어요.</li>';
}

// 비율을 한 줄 막대로: 위에는 100% 막대, 아래에는 이름·비율·금액 (금액이 0인 칸은 보이지 않는다)
const PAY_COLORS = { card: '#8f93ee', cash: '#a6cc66', transfer: '#5b9bf0', none: '#8e99ad' };
const MOOD_COLORS = { need: '#4cc38a', want: '#f2a65a', regret: '#ee7b78', none: '#8e99ad' };
function splitBar(parts, total, note = '') {
  const shown = parts.filter((p) => p.amt > 0);
  if (!shown.length || !total) return '';
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return '<li class="split"><div class="sbar">' +
    shown.map((p) => `<i style="flex:${p.amt};background:${p.color}" title="${esc(p.label)}"></i>`).join('') + '</div><ul class="slegend">' +
    shown.map((p) => `<li${p.warn || p.key ? ` class="${[p.warn ? 'warn' : '', p.key ? 'link' : ''].join(' ').trim()}"` : ''}${p.key ? ` data-key="${p.key}"` : ''}><i style="background:${p.color}"></i><span>${esc(p.label)}</span><em>${Math.round((p.amt / total) * 100)}%</em><b>${won(p.amt)}</b></li>`).join('') +
    '</ul>' + (note ? `<p class="split-note">${esc(note)}</p>` : '') + '</li>';
}

// 연별 보기의 월별 지출: 꺾은선 그래프. 선은 왼쪽에서 오른쪽으로 그려지고, 아래 달 이름을 누르면 그 달로 이동한다
function resetStatsAnim() {   // 통계에 다시 들어오면 그래프 효과를 처음부터 보여 준다
  $('year-bars').dataset.key = '';
  $('donut-total').dataset.v = 0;
  resetDonut();
}
function renderYearBars(period) {
  const box = $('year-bars');
  const months = Array(12).fill(0);
  const net = statsHasSettle && statsNet;   // 실지출 보기: 그 달에 돌려받은 정산을 뺀다
  period.filter((i) => i.type === 'out').forEach((i) => (months[Number(i.date.slice(5, 7)) - 1] += i.amount));
  if (net) {
    period.filter((i) => i.type === 'in' && i.category === '정산').forEach((i) => (months[Number(i.date.slice(5, 7)) - 1] -= i.amount));
    months.forEach((v, k) => { months[k] = Math.max(0, v); });
  }
  const thisYear = today().slice(0, 4) === String(cur.getFullYear());
  const nowM = thisYear ? Number(today().slice(5, 7)) - 1 : -1;
  const last = thisYear ? nowM : 11;   // 올해는 이번 달까지만 이어 그린다 (앞으로 올 달이 0원으로 떨어져 보이지 않게)
  const W = box.clientWidth || 340, H = 72, padT = 20, padB = 6;
  const key = `${cur.getFullYear()}|${W}|${months.join(',')}`;
  if (box.dataset.key === key) return;   // 그대로면 다시 그리지 않는다 (카테고리를 눌러도 선이 매번 다시 그려지지 않게)
  box.dataset.key = key;
  box.dataset.sel = '';
  const max = Math.max(...months, 1);
  const col = W / 12;
  const pts = months.slice(0, last + 1).map((v, k) => [(k + 0.5) * col, padT + (1 - v / max) * (H - padT - padB)]);
  const f = (n) => n.toFixed(1);
  const line = pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  const area = `${f(pts[0][0])},${H} ${line} ${f(pts[pts.length - 1][0])},${H}`;
  const topK = max > 1 ? months.indexOf(max) : -1;   // 가장 많이 쓴 달
  const grid = [0.33, 0.66, 1].map((g) => { const y = padT + g * (H - padT - padB); return `<line class="yc-grid" x1="0" x2="${W}" y1="${f(y)}" y2="${f(y)}"/>`; }).join('');
  const dots = pts.map(([x, y], k) => `<circle class="yc-dot${k === nowM ? ' now' : ''}" cx="${f(x)}" cy="${f(y)}" r="${k === nowM ? 5 : 3.5}" style="animation-delay:${350 + k * 45}ms"/>`).join('');
  const vals = pts.map(([x, y], k) => (months[k] && (k === nowM || k === topK))
    ? `<text class="yc-val" data-k="${k}" x="${f(x)}" y="${f(y - 10)}" text-anchor="${x < 30 ? 'start' : x > W - 30 ? 'end' : 'middle'}">${won(months[k])}</text>` : '').join('');
  const sel = '<text class="yc-sel" hidden></text>';
  box.innerHTML =
    `<svg class="yc-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">` +
    '<defs><linearGradient id="yc-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".30"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>' +
    grid +
    `<polygon class="yc-area" points="${area}" fill="url(#yc-fill)"/>` +
    `<polyline class="yc-line" points="${line}" pathLength="1" fill="none"/>` +
    dots + vals + sel + '</svg>' +
    '<div class="yc-cols">' + months.map((v, k) =>
      `<button type="button" data-m="${k}" data-v="${v}" class="${k === nowM ? 'now' : ''}${k > last ? ' off' : ''}" aria-label="${k + 1}월"><em>${k + 1}월</em></button>`).join('') + '</div>';
  box._pts = pts;
}

// 그래프의 점(또는 그 달 칸)을 누르면 그 달의 금액만 점 위에 표시된다. 같은 달을 다시 누르면 표시가 사라진다
function pickYearMonth(k) { pickPoint($('year-bars'), k); }
function pickPoint(box, k) {
  const pts = box._pts;
  if (!pts || !pts[k]) return;
  const again = box.dataset.sel === String(k);
  box.dataset.sel = again ? '' : String(k);
  box.querySelector('.yc-sel').setAttribute('hidden', '');
  box.querySelectorAll('.yc-val').forEach((e) => (e.style.opacity = ''));
  box.querySelectorAll('.yc-dot').forEach((e) => e.classList.remove('sel'));
  box.querySelectorAll('.yc-cols button').forEach((e) => e.classList.remove('sel'));
  if (again || box.querySelector(`.yc-val[data-k="${k}"]`)) { box.dataset.sel = ''; return; }   // 이미 금액이 떠 있는 달(주)은 누르면 다른 선택만 지운다
  const W = box.clientWidth || 340;
  const [x, y] = pts[k];
  const t = box.querySelector('.yc-sel');
  const v = Number(box.querySelector(`button[data-m="${k}"]`).dataset.v);
  t.textContent = won(v);
  t.removeAttribute("hidden");
  t.setAttribute('x', Math.min(W - 6, Math.max(6, x)).toFixed(1));
  t.setAttribute('y', Math.max(12, y - 12).toFixed(1));
  const w = t.getComputedTextLength ? t.getComputedTextLength() : 0;   // 가장자리에서는 글자가 잘리지 않게 정렬을 바꾼다
  t.setAttribute('text-anchor', x - w / 2 < 4 ? 'start' : x + w / 2 > W - 4 ? 'end' : 'middle');
  box.querySelectorAll('.yc-val').forEach((e) => (e.style.opacity = e.dataset.k === String(k) ? 0 : ''));
  box.querySelectorAll('.yc-dot').forEach((e, i) => e.classList.toggle('sel', i === k));
  box.querySelectorAll('.yc-cols button').forEach((e) => e.classList.toggle('sel', e.dataset.m === String(k)));
}

// 숫자가 이전 값에서 새 값으로 올라가거나 내려가며 바뀐다 (폰의 '애니메이션 줄이기'를 켰으면 바로 바뀐다)
function countTo(el, to, fmt) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  cancelAnimationFrame(el._raf);
  if (from === to || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 600;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

// 원 그래프: 조각을 이전 모양에서 새 모양으로 이어서 늘이고 줄인다. 처음에는 위에서부터 감겨 펼쳐지듯 나타나고,
// 달을 바꾸면 지우고 다시 그리지 않고 조각이 부드럽게 옮겨 가며, 고른 조각은 커지면서 빛난다. 가운데 숫자는 올라가듯 바뀐다.
const DONUT_R = 38, DONUT_C = 2 * Math.PI * DONUT_R, DONUT_GAP = 1.4;
const donutEls = new Map();   // 카테고리 -> 그려진 circle (조각을 유지해서 모양이 이어서 변하게 한다)
let donutRaf = 0;
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
function resetDonut() {   // 통계에 다시 들어오면 처음부터 펼쳐지게 비운다
  cancelAnimationFrame(donutRaf);
  donutEls.clear();
  $('donut').innerHTML = '';
}
function drawArc(el, start, len) {
  el._s = start; el._l = len;   // 지금 그려진 값 (움직이는 도중에 다시 그려도 여기서 이어간다)
  const dash = Math.max(0.01, len - (len > DONUT_GAP * 2 ? DONUT_GAP : 0));   // 조각 사이의 작은 틈
  el.setAttribute('stroke-dasharray', `${dash} ${DONUT_C}`);
  el.setAttribute('stroke-dashoffset', -start);
}
function renderDonut(rows, total, shown = total) {
  const svg = $('donut');
  const sel = rows.find(([c]) => c === selCat);
  $('donut-label').textContent = sel ? sel[0] : statsHasSettle && statsNet ? '실지출' : '총 지출';
  countTo($('donut-total'), sel ? sel[1] : shown, won);
  // 정산이 있는 기간에는 가운데를 눌러 총 지출과 실지출을 바꿔 볼 수 있다고 작게 알린다
  $('donut-pct').textContent = sel ? `${Math.round((sel[1] / total) * 100)}%` : statsHasSettle ? (statsNet ? '눌러서 총 지출 보기' : '눌러서 실지출 보기') : '';
  if (!rows.length) {
    resetDonut();
    svg.innerHTML = `<circle cx="50" cy="50" r="${DONUT_R}" fill="none" stroke="var(--line)" stroke-width="16"/>`;
    return;
  }
  if (!donutEls.size) svg.innerHTML = '';   // 비어 있을 때 보이던 회색 원을 치운다
  let start = 0;
  const target = rows.map(([cat, amt]) => {
    const a = { cat, start, len: (amt / total) * DONUT_C, color: groupColor(cat) };
    start += a.len;
    return a;
  });
  for (const a of target) {   // 새 카테고리는 길이 0에서 시작하는 조각을 만든다
    let el = donutEls.get(a.cat);
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('class', 'slice');
      el.setAttribute('cx', 50); el.setAttribute('cy', 50); el.setAttribute('r', DONUT_R);
      el.setAttribute('fill', 'none'); el.setAttribute('transform', 'rotate(-90 50 50)');
      el.setAttribute('stroke', a.color);
      el.dataset.cat = a.cat;
      drawArc(el, 0, 0);
      svg.appendChild(el);
      donutEls.set(a.cat, el);
    }
    const on = a.cat === selCat;
    el.setAttribute('stroke-width', on ? 21 : 16);   // 굵기·투명도는 CSS 전환으로 부드럽게 바뀐다
    el.setAttribute('opacity', selCat && !on ? 0.3 : 1);
    el.classList.toggle('sel', on);
    el.style.setProperty('--col', a.color);
  }
  // 지금 그려진 모양 -> 새 모양. 사라지는 카테고리는 길이 0으로 줄어든 뒤 치운다
  const items = target.map((a) => { const el = donutEls.get(a.cat); return { el, s0: el._s || 0, l0: el._l || 0, s1: a.start, l1: a.len }; });
  const gone = [...donutEls].filter(([cat]) => !target.some((t) => t.cat === cat))
    .map(([cat, el]) => ({ el, cat, s0: el._s, l0: el._l, s1: el._s, l1: 0 }));
  const all = items.concat(gone);
  const finish = () => {
    all.forEach((i) => drawArc(i.el, i.s1, i.l1));
    gone.forEach((g) => { g.el.remove(); donutEls.delete(g.cat); });
  };
  cancelAnimationFrame(donutRaf);
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || all.every((i) => i.s0 === i.s1 && i.l0 === i.l1)) { finish(); return; }
  const t0 = performance.now(), dur = 850;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), e = easeInOut(p);
    all.forEach((i) => drawArc(i.el, i.s0 + (i.s1 - i.s0) * e, i.l0 + (i.l1 - i.l0) * e));
    if (p < 1) donutRaf = requestAnimationFrame(step); else finish();
  };
  donutRaf = requestAnimationFrame(step);
}
