// 설정 탭과 고정지출 창
// ---- 설정 탭 ----
// 카드 결제일·사용 기간 시작일: 드롭다운 대신 버튼으로 보여 주고, 누르면 돌려서 고르는 창이 열린다
const dayLabels = () => Array.from({ length: 31 }, (_, k) => `${k + 1}일`);
const REMIND_LABELS = ['당일 오전 9시', '1일 전 오전 9시', '2일 전 오전 9시', '3일 전 오전 9시'];
$('card-day-btn').onclick = () => openOptionPicker({
  title: '카드 결제일', labels: ['설정 안 함', ...dayLabels()], index: settings.cardDay || 0,
  done: (i) => { settings.cardDay = i || null; saveSettings(); render(); },
});
$('card-start-btn').onclick = () => openOptionPicker({
  title: '사용 기간 시작일', labels: dayLabels(), index: settings.cardStart - 1,
  done: (i) => { settings.cardStart = i + 1; saveSettings(); render(); },
});

// ---- 화면 모드 (자동 / 밝게 / 어둡게) ----
const THEME_COLOR = { light: '#f4f5f0', dark: '#0a0c13' };
const TB = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? window.Capacitor.Plugins.ThemeBars : null;   // 안드로이드: 위·아래 시스템 막대의 아이콘 색을 앱 모드에 맞춘다
const prefersDark = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme(animate) {
  const t = settings.theme;
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-fade');   // 색이 서서히 바뀌게 잠깐만 켜 둔다
    setTimeout(() => root.classList.remove('theme-fade'), 400);
  }
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && prefersDark());
  // 브라우저 위쪽 색(theme-color): 자동일 때는 폰 모드에 따라 고르도록 원래 쌍을 두고, 직접 골랐으면 그 색 하나로 맞춘다
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => {
    m.content = t === 'auto' ? THEME_COLOR[/dark/.test(m.media) ? 'dark' : 'light'] : THEME_COLOR[dark ? 'dark' : 'light'];
  });
  if (TB) TB.setDark({ mode: t }).catch(() => {});
}
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (settings.theme === 'auto') applyTheme(); });
document.querySelectorAll('#theme-mode button').forEach((b) => (b.onclick = () => {
  if (settings.theme === b.dataset.theme) return;
  settings.theme = b.dataset.theme;
  saveSettings();
  applyTheme(true);
  renderSettings();
}));
applyTheme();

function renderSettings() {
  document.querySelectorAll('#theme-mode button').forEach((b) => {
    const on = b.dataset.theme === settings.theme;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
  renderNpLast();
  renderAutoBackup();
  $('auto-apply').checked = settings.autoApply;
  $('remind-days-btn').textContent = REMIND_LABELS[settings.remindDays];
  $('ics-card').disabled = !settings.cardDay;
  $('ics-fixed').disabled = !settings.fixed.length;
  $('card-day-btn').textContent = settings.cardDay ? `매달 ${settings.cardDay}일` : '설정 안 함';
  $('card-start-btn').textContent = `${settings.cardStart}일`;
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

// 창을 열 때의 커서 위치. 브라우저의 showModal()은 아무 지정이 없으면 첫 입력칸을 자동으로 선택해서
// (폰에서는 키보드가 올라와 내용을 가린다), 새로 입력할 때만 지정한 칸(first)에 커서를 두고
// 이미 있는 항목을 볼 때(first가 null)는 창 자체에 포커스를 두어 어느 칸도 선택되지 않게 한다.
function openWithFocus(dlg, first) {
  dlg.toggleAttribute('autofocus', !first);
  dlg.showModal();
  if (first) first.focus();
  else dlg.focus();
}

// 고정지출의 '매달 며칠': 숨은 값(숫자)은 그대로 두고 버튼에는 '매달 6일'로 보여 준다. 누르면 돌려서 고르는 창이 열린다
function setFday(d) {
  $('fday').value = d;
  $('fday-btn').textContent = `매달 ${d}일`;
}
$('fday-btn').onclick = () => openDayPicker(Number($('fday').value), setFday);

function openFixed(f) {
  fEditing = f || null;
  $('fdlg-title').textContent = f ? '고정지출 수정' : '고정지출 추가';
  $('fdel').hidden = !f;
  fillCategories('fcategory', 'out', f && f.category);
  $('fname').value = f ? f.name : '';
  $('famount').value = f ? f.amount.toLocaleString('ko-KR') : '';
  $('famount').refreshRead();
  document.querySelector(`input[name=fpay][value=${f ? f.pay : settings.lastPay}]`).checked = true;
  setFday(f ? f.day : new Date().getDate());
  $('fsub').checked = !!(f && f.sub);
  const fm = f ? f.mood || '' : 'need';   // 새 고정지출은 '필수'가 기본
  document.querySelectorAll('input[name=fmood]').forEach((r) => (r.checked = r.value === fm));
  openWithFocus($('fdlg'), f ? null : $('fname'));
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
$('fdel').onclick = async () => {
  if (fEditing && await ask('이 고정지출을 삭제할까요? 이미 추가된 내역은 그대로 남아요.', { yes: '삭제', danger: true })) {
    settings.fixed = settings.fixed.filter((f) => f !== fEditing);
    saveSettings(); render(); $('fdlg').close();
  }
};
