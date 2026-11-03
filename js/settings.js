// 설정 탭과 고정지출 창
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
  renderNpLast();
  renderAutoBackup();
  $('auto-apply').checked = settings.autoApply;
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

// 창을 열 때의 커서 위치. 브라우저의 showModal()은 아무 지정이 없으면 첫 입력칸을 자동으로 선택해서
// (폰에서는 키보드가 올라와 내용을 가린다), 새로 입력할 때만 지정한 칸(first)에 커서를 두고
// 이미 있는 항목을 볼 때(first가 null)는 창 자체에 포커스를 두어 어느 칸도 선택되지 않게 한다.
function openWithFocus(dlg, first) {
  dlg.toggleAttribute('autofocus', !first);
  dlg.showModal();
  if (first) first.focus();
  else dlg.focus();
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
