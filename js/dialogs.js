// 공통 이벤트와 내역 입력 창
// ---- 화면 전환 효과 ----
// 바뀐 화면(또는 일부)이 부드럽게 나타나게 한다. cls: fade-in(살짝 올라오며) | from-right | from-left | slide-in(아래에서)
function playIn(el, cls) {
  if (!el) return;
  ['fade-in', 'from-right', 'from-left', 'slide-in'].forEach((c) => el.classList.remove(c));
  void el.offsetWidth;   // 같은 효과를 처음부터 다시 재생하려고
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}
// 지금 보이는 본문 영역 (탭, 목록/달력에 따라 다르다)
const activePane = () => tab === 'list' ? $(listMode === 'cal' ? 'view-cal' : 'list-wrap') : $('view-' + tab);

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

// 목록 <-> 달력: 토글을 눌러 실제로 바뀔 때만 새로 보이는 쪽이 아래에서 살짝 올라오며 나타난다 (월 이동·내역 수정 때는 움직이지 않는다)
document.querySelectorAll('#list-mode button').forEach((b) => (b.onclick = () => {
  const changed = listMode !== b.dataset.lmode;
  listMode = b.dataset.lmode;
  render();
  if (changed) playIn(activePane(), 'slide-in');
}));
document.querySelectorAll('#stats-mode button').forEach((b) => (b.onclick = () => {
  const changed = statsMode !== b.dataset.mode;
  statsMode = b.dataset.mode; selCat = null;
  if (changed) resetStatsAnim();
  render();
  if (changed) playIn($('view-stats'), 'fade-in');
}));
document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => {
  const changed = tab !== b.dataset.tab;
  tab = b.dataset.tab; selCat = null;
  if (changed && tab === 'stats') resetStatsAnim();
  render();
  if (changed) playIn(activePane(), 'fade-in');
}));

function move(step) {
  if (tab === 'stats' && statsMode === 'year') cur = new Date(cur.getFullYear() + step, cur.getMonth(), 1);
  else cur = new Date(cur.getFullYear(), cur.getMonth() + step, 1);
  selCat = null;
  render();
  playIn(activePane(), step > 0 ? 'from-right' : 'from-left');
}
$('prev').onclick = () => move(-1);
$('next').onclick = () => move(1);

// 맨 위 제목을 누르면 연도와 달을 골라 바로 이동한다. 연별 통계에서는 연도만 고른다. 내역이 있는 달(해)에는 점이 붙는다.
// 달 화면에서 위쪽 연도를 누르면 연도 목록(12개씩)이 나오고, 연도를 고르면 그 해의 달 화면으로 돌아온다. 연도 글자를 다시 누르면 달 화면으로 돌아온다.
let pickYear = 0;         // 달 화면에서 보고 있는 해
let pickingYear = false;  // 연도 목록을 보는 중인지
let yearBase = 0;         // 연도 목록의 첫 해
function renderPicker() {
  const yearMode = tab === 'stats' && statsMode === 'year';   // 연별 통계는 처음부터 연도 목록이 나온다
  const years = yearMode || pickingYear;
  const has = new Set(items.map((i) => i.date.slice(0, years ? 4 : 7)));
  const thisYear = new Date().getFullYear();
  $('mp-prev').hidden = $('mp-next').hidden = yearMode;
  $('mp-prev').setAttribute('aria-label', pickingYear ? '이전 연도들' : '이전 해');
  $('mp-next').setAttribute('aria-label', pickingYear ? '다음 연도들' : '다음 해');
  const title = $('mp-title');
  title.textContent = years ? '연도 선택' : `${pickYear}년`;
  title.disabled = yearMode;                      // 연별 통계에서는 이미 연도 목록이라 누를 게 없다
  title.classList.toggle('tap', !yearMode);       // 누를 수 있다는 표시(▾, 연도 목록을 보는 중에는 ▴)
  title.classList.toggle('open', pickingYear);
  $('mp-hint').textContent = years ? '점이 있는 해는 내역이 있어요.' : '점이 있는 달은 내역이 있어요.';
  const cells = [];
  if (yearMode) {
    const last = Math.max(thisYear + 1, cur.getFullYear());
    for (let y = last - 11; y <= last; y++) cells.push({ label: `${y}`, key: `${y}`, go: new Date(y, cur.getMonth(), 1), on: y === cur.getFullYear() });
  } else if (pickingYear) {
    for (let y = yearBase; y < yearBase + 12; y++) cells.push({ label: `${y}`, key: `${y}`, pick: y, on: y === pickYear });
  } else {
    for (let m = 0; m < 12; m++) {
      const key = `${pickYear}-${String(m + 1).padStart(2, '0')}`;
      cells.push({ label: `${m + 1}월`, key, go: new Date(pickYear, m, 1), on: key === ym(cur) });
    }
  }
  $('mp-grid').innerHTML = cells.map((c, k) =>
    `<button type="button" data-k="${k}" class="${c.on ? 'on' : ''}${has.has(c.key) ? ' has' : ''}">${c.label}</button>`).join('');
  $('mp-grid').cells = cells;
}
$('month').onclick = () => {
  if (tab === 'settings') return;
  pickYear = cur.getFullYear();
  pickingYear = false;
  renderPicker();
  $('mdlg').showModal();
};
$('mp-title').onclick = () => {
  pickingYear = !pickingYear;
  if (pickingYear) yearBase = pickYear - 5;   // 보던 해가 목록 가운데쯤 오게
  renderPicker();
  playIn($('mp-grid'), 'fade-in');
};
// 해를 넘긴다 (연도 목록을 보는 중이면 12개씩). 밀어 넘기는 방향대로 새 화면이 들어온다
function stepPicker(step) {
  if (pickingYear) yearBase += 12 * step; else pickYear += step;
  renderPicker();
  playIn($('mp-grid'), step > 0 ? 'from-right' : 'from-left');
}
$('mp-prev').onclick = () => stepPicker(-1);
$('mp-next').onclick = () => stepPicker(1);
// 창 안에서 좌우로 밀기: 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전 (연별 통계에서는 화살표가 없으니 넘기지 않는다)
let mpSwipe = null;
$('mdlg').addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  mpSwipe = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
$('mdlg').addEventListener('touchend', (e) => {
  if (!mpSwipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - mpSwipe.x, dy = t.clientY - mpSwipe.y;
  mpSwipe = null;
  if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && !$('mp-next').hidden) stepPicker(dx < 0 ? 1 : -1);
}, { passive: true });
$('mdlg').addEventListener('touchcancel', () => { mpSwipe = null; }, { passive: true });
$('mp-grid').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  const c = $('mp-grid').cells[Number(b.dataset.k)];
  if (c.pick !== undefined) {   // 연도 목록에서 연도를 골랐다: 그 해의 달 화면으로 돌아간다 (아직 이동하지 않는다)
    pickYear = c.pick;
    pickingYear = false;
    renderPicker();
    playIn($('mp-grid'), 'fade-in');
    return;
  }
  cur = c.go;
  selCat = null; selDay = null;
  $('mdlg').close();
  render();
  playIn(activePane(), 'fade-in');
});
$('mp-today').onclick = () => { cur = new Date(); cur.setDate(1); selCat = null; selDay = null; $('mdlg').close(); render(); };
$('mp-close').onclick = () => $('mdlg').close();

// 카테고리는 드롭다운 대신 버튼으로 모두 보여 줘서 한 번에 고른다 (값은 숨은 select가 들고 있다). 내역 추가와 고정지출 창이 같이 쓴다
const CHIPS_OF = { category: 'cat-chips', fcategory: 'fcat-chips' };   // select id -> 버튼 묶음 id
function fillCategories(id, type, selected) {
  $(id).innerHTML = CATEGORIES[type].map((c) => `<option>${c}</option>`).join('');
  if (selected) $(id).value = selected;
  renderCatChips(id);
}
function renderCatChips(id = 'category') {
  const cur = $(id).value;
  $(CHIPS_OF[id]).innerHTML = Array.from($(id).options).map((o) =>
    `<button type="button" role="radio" aria-checked="${o.value === cur}" data-cat="${o.value}" class="${o.value === cur ? 'on' : ''}">${o.value}</button>`).join('');
}
Object.entries(CHIPS_OF).forEach(([id, chipsId]) => $(chipsId).addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  $(id).value = b.dataset.cat;
  $(chipsId).querySelectorAll('button').forEach((x) => {   // 다시 만들지 않고 표시만 바꿔서 색이 부드럽게 바뀌게 한다
    const on = x === b;
    x.classList.toggle('on', on);
    x.setAttribute('aria-checked', String(on));
  });
}));

// 금액 입력: 쉼표를 붙여 주고, 입력칸 아래에 한글로 읽은 금액을 작게 보여 준다 (값을 코드로 바꿔 넣었을 때는 el.refreshRead()를 부른다)
function bindMoney(el) {
  const read = $(el.id + '-read');
  el.refreshRead = () => { read.textContent = koreanMoney(Number(el.value.replace(/\D/g, ''))); };
  el.addEventListener('input', (e) => {
    const n = e.target.value.replace(/\D/g, '');
    e.target.value = n ? Number(n).toLocaleString('ko-KR') : '';
    el.refreshRead();
  });
}
bindMoney($('amount'));
bindMoney($('famount'));

function openDialog(item) {
  editing = item || null;
  $('dlg-title').textContent = item ? '내역 수정' : '내역 추가';
  $('del').hidden = !item;
  $('sms-open').hidden = !!item;
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
  $('amount').refreshRead();
  const date = item ? item.date : (listMode === 'cal' && selDay) || today();
  setDateValue(date);
  // 새 내역은 지금 시각을 채워 두고(오늘 날짜일 때만), 예전 내역은 있는 값 그대로 둔다
  setTimeValue(item ? item.time || '' : date === today() ? nowTime() : '');
  $('time').dataset.auto = item ? '0' : '1';
  $('time-btn').hidden = type !== 'out';
  $('memo').value = item ? item.memo : '';
  setMore(!!item);          // 새 내역은 접어 두고(기본값으로 저장), 수정할 때는 값이 보이게 펼친다
  updateMoreSum();
  openWithFocus($('dlg'), item ? null : $('amount'));
}

document.querySelectorAll('input[name=type]').forEach((r) =>
  r.addEventListener('change', () => {
    fillCategories('category', r.value);
    playIn($('cat-chips'), 'fade-in');
    $('pay-seg').hidden = r.value !== 'out';
    $('mood-seg').hidden = r.value !== 'out';
    $('time-btn').hidden = r.value !== 'out';
    updateMoreSum();
  }));

// 시각을 직접 고치기 전까지는 날짜에 맞춰 자동값을 유지한다 (지난 날짜를 입력할 때 지금 시각이 남지 않게)
function setDateValue(v) {
  $('date').value = v || '';
  const b = $('date-btn');
  // 올해 날짜는 연도를 빼서 짧게 (좁은 칸에서 두 줄로 접히지 않게)
  b.textContent = dateLabel(v, !v || v.slice(0, 4) !== String(new Date().getFullYear())) || '날짜 선택';
  b.classList.toggle('empty', !v);
}
$('date-btn').onclick = () => openDatePicker($('date').value || today(), (v) => {
  setDateValue(v);
  if ($('time').dataset.auto === '1') setTimeValue(v === today() ? nowTime() : '');
  updateMoreSum();
});
// 시각 칸: 숨은 값(HH:MM)은 그대로 두고, 눈에 보이는 버튼에는 '오후 3:05'처럼 보여 준다. 누르면 돌려서 고르는 창이 열린다
function setTimeValue(v) {
  $('time').value = v || '';
  const b = $('time-btn');
  b.textContent = timeLabel(v) || '시각 선택';
  b.classList.toggle('empty', !v);
}
$('time-btn').onclick = () => openTimePicker($('time').value, (v) => {
  $('time').dataset.auto = '0';   // 직접 골랐으니 날짜를 바꿔도 자동으로 덮어쓰지 않는다
  setTimeValue(v);
  updateMoreSum();
});

// '더보기': 결제수단, 소비 평가, 날짜, 시각은 접어 두고, 접힌 동안은 저장될 값을 한 줄로 보여준다
function setMore(open) {
  $('more-wrap').classList.toggle('open', open);   // 높이는 CSS 전환으로 부드럽게 변한다
  $('more').inert = !open;                         // 접힌 동안은 키보드·화면 읽기에서도 빠진다
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
$('more-btn').onclick = () => setMore(!$('more-wrap').classList.contains('open'));
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
  if (editing) Object.assign(editing, data, { auto: undefined });   // 직접 확인하고 저장했으니 '자동' 표시는 뺀다
  else items.push({ id: Date.now(), ...data });
  save();
  if (data.date.slice(0, 7) !== ym(cur)) {
    const d = parseDate(data.date);
    cur = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  render();
});
$('cancel').onclick = () => $('dlg').close();
$('del').onclick = async () => {
  if (editing && await ask('이 내역을 삭제할까요?', { yes: '삭제', danger: true })) {
    items = items.filter((i) => i !== editing);
    save(); render(); $('dlg').close();
  }
};
$('fab').onclick = () => openDialog();
