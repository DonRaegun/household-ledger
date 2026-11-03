// 공통 이벤트와 내역 입력 창
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
  if (id === 'category') renderCatChips();
}
// 내역 입력 창의 카테고리는 드롭다운 대신 버튼으로 모두 보여 줘서 한 번에 고른다 (값은 숨은 select가 들고 있다)
function renderCatChips() {
  const cur = $('category').value;
  $('cat-chips').innerHTML = Array.from($('category').options).map((o) =>
    `<button type="button" role="radio" aria-checked="${o.value === cur}" data-cat="${o.value}" class="${o.value === cur ? 'on' : ''}">${o.value}</button>`).join('');
}
$('cat-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cat]');
  if (!b) return;
  $('category').value = b.dataset.cat;
  renderCatChips();
});

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
  const date = item ? item.date : (listMode === 'cal' && selDay) || today();
  $('date').value = date;
  // 새 내역은 지금 시각을 채워 두고(오늘 날짜일 때만), 예전 내역은 있는 값 그대로 둔다
  $('time').value = item ? item.time || '' : date === today() ? nowTime() : '';
  $('time').dataset.auto = item ? '0' : '1';
  $('time').hidden = type !== 'out';
  $('memo').value = item ? item.memo : '';
  setMore(!!item);          // 새 내역은 접어 두고(기본값으로 저장), 수정할 때는 값이 보이게 펼친다
  updateMoreSum();
  openWithFocus($('dlg'), item ? null : $('amount'));
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
