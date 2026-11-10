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
const THEME_COLOR = { light: '#e9edf2', dark: '#0a0c13' };
const TB = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? window.Capacitor.Plugins.ThemeBars : null;   // 안드로이드: 위·아래 시스템 막대의 아이콘 색을 앱 모드에 맞춘다
const prefersDark = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme(animate) {
  const t = settings.theme;
  const root = document.documentElement;
  // 요소마다 색이 따로 바뀌면 그라데이션처럼 전환되지 않는 부분이 번뜩이므로, 화면을 통째로 크로스페이드한다 (지원하지 않으면 바로 바뀐다)
  const swap = () => { if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t; };
  if (animate && document.startViewTransition && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) document.startViewTransition(swap);
  else swap();
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
  const pre = readPreRestore();   // 백업을 불러온 적이 있으면 불러오기 전 상태로 되돌리는 버튼을 보여 준다
  $('undo-import').hidden = !pre;
  if (pre) $('undo-import').textContent = `백업 불러오기 되돌리기 (${Number(pre.at.slice(5, 7))}월 ${Number(pre.at.slice(8))}일 교체 전)`;
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
}

// 고정지출: 구독은 비싼 순으로 따로 모아 월/연 합계를 보여주고, 나머지는 날짜 순으로 보여준다 (내역 탭의 고정지출 창)
function fixedSummary() {
  const sum = (arr) => arr.reduce((s, f) => s + f.amount, 0);
  const subs = settings.fixed.filter((f) => f.sub).sort((a, b) => b.amount - a.amount);
  const rest = settings.fixed.filter((f) => !f.sub).sort((a, b) => a.day - b.day);
  return { subs, rest, sum, total: sum(settings.fixed) };
}
function renderFixedList() {
  const { subs, rest, sum, total } = fixedSummary();
  $('x-sum').textContent = settings.fixed.length ? `${settings.fixed.length}개 · 월 ${won(total)}` : '월세, 구독료처럼 매달 나가는 돈을 추가해 두세요.';
  $('sub-title').hidden = !subs.length;
  $('sub-title').textContent = `구독 ${subs.length}개 · 월 ${won(sum(subs))} (연 ${won(sum(subs) * 12)})`;
  $('fixed-title').hidden = !rest.length || !subs.length;   // 구독이 없으면 소제목 없이 목록만
  $('fixed-title').textContent = `그 외 고정지출 (월 ${won(sum(rest))})`;
  fillFixedList($('sub-list'), subs);
  fillFixedList($('fixed-list'), rest);
}
$('x-close').onclick = () => $('xdlg').close();
function openFixedList() { renderFixedList(); $('xdlg').showModal(); $('x-list').scrollTop = 0; }
$('upcoming').onclick = openFixedList;

function fillFixedList(list, rows) {
  list.innerHTML = '';
  for (const f of rows) {
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML = '<span class="ico"></span><div class="body"><div class="cat"><span></span></div><div class="memo"></div></div><div class="amt out"></div>';
    li.querySelector('.ico').innerHTML = catIcon(f.category);
    li.querySelector('.ico').style.setProperty('--c', color(f.category));
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

// 고정지출은 '고정비'(월세·통신·보험 등)와 '구독'(넷플릭스 등) 둘 중 하나로 고른다. 구독은 구독, 고정비는 고정비 카테고리로 들어간다
const FKIND = {
  fixed: { category: '고정비', hint: '월세, 통신비, 보험료처럼 꼭 내야 하는 돈이에요. 고정비로 들어가요.' },
  sub: { category: '구독', hint: '넷플릭스, 유튜브처럼 해지할 수 있는 서비스예요. 구독으로 들어가고 구독 목록에 모여요.' },
};
let fKindOf = 'fixed', fFromCategory = null;   // 열었을 때의 종류와 카테고리 (종류를 안 바꾸면 원래 카테고리를 그대로 둔다)
const fKind = () => document.querySelector('input[name=fkind]:checked').value;
function showFkindHint() { $('fkind-hint').textContent = FKIND[fKind()].hint; }
document.querySelectorAll('input[name=fkind]').forEach((r) => r.addEventListener('change', showFkindHint));

function openFixed(f) {
  fEditing = f || null;
  $('fdlg-title').textContent = f ? '고정지출 수정' : '고정지출 추가';
  $('fdel').hidden = !f;
  fKindOf = f && f.sub ? 'sub' : 'fixed';
  fFromCategory = f ? f.category : null;
  document.querySelectorAll('input[name=fkind]').forEach((r) => (r.checked = r.value === fKindOf));
  showFkindHint();
  $('fname').value = f ? f.name : '';
  $('famount').value = f ? f.amount.toLocaleString('ko-KR') : '';
  $('famount').refreshRead();
  document.querySelector(`input[name=fpay][value=${f ? f.pay : settings.lastPay}]`).checked = true;
  setFday(f ? f.day : new Date().getDate());
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
    name, amount, category: fKind() === fKindOf && fFromCategory ? fFromCategory : FKIND[fKind()].category,
    pay: document.querySelector('input[name=fpay]:checked').value,
    day: Number($('fday').value),
    sub: fKind() === 'sub',
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

// 접이식 칸(details.fold, details.more): 열고 닫을 때 높이가 부드럽게 변한다.
// 안쪽 내용을 감싸서 높이를 0fr <-> 1fr로 바꾸고, 닫을 때는 애니메이션이 끝난 뒤에 open 속성을 뗀다.
// '애니메이션 줄이기'를 켰으면 원래 동작(바로 열고 닫기)을 그대로 쓴다.
document.querySelectorAll('details.fold, details.more').forEach((d) => {
  const sum = d.querySelector('summary');
  const body = document.createElement('div');
  body.className = 'fold-body';
  const inner = document.createElement('div');
  inner.className = 'fold-inner';
  [...d.childNodes].filter((n) => n !== sum).forEach((n) => inner.appendChild(n));
  body.appendChild(inner);
  d.appendChild(body);
  d.classList.toggle('show', d.open);
  sum.addEventListener('click', (e) => {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { d.classList.toggle('show', !d.open); return; }
    e.preventDefault();
    if (d.open && d.classList.contains('show')) {   // 닫기
      d.classList.remove('show');
      const done = () => { if (!d.classList.contains('show')) d.removeAttribute('open'); };
      body.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 350);   // 전환이 안 일어나는 경우를 대비한 안전장치
    } else {   // 열기: 먼저 열어서 내용을 보이게 한 뒤 다음 프레임에 높이를 늘린다
      d.setAttribute('open', '');
      requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('show')));
    }
  });
});

// ---- 월 예산 입력 ----
function openBudget() {
  $('bamount').value = settings.budget ? settings.budget.toLocaleString('ko-KR') : '';
  $('bamount').refreshRead();
  $('bdel').hidden = !settings.budget;
  openWithFocus($('bdlg'), $('bamount'));
}
$('bd-edit').onclick = openBudget;
$('bcancel').onclick = () => $('bdlg').close();
$('bform').addEventListener('submit', () => {
  settings.budget = Number($('bamount').value.replace(/\D/g, '')) || 0;
  saveSettings(); render();
});
$('bdel').onclick = async () => {
  if (await ask('월 예산을 없앨까요? 남은 돈 표시가 사라져요.', { yes: '없애기', danger: true })) {
    settings.budget = 0; saveSettings(); render(); $('bdlg').close();
  }
};
