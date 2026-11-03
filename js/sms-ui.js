// 문자 입력 창
const SMS_TAG = { new: '새 내역', dup: '이미 있어요', again: '같은 알림', offset: '상쇄', remove: '기존 내역 삭제', missing: '원결제 없음' };
function renderSms() {
  const box = $('sms-result');
  box.innerHTML = '';
  const text = $('sms-text').value.trim();
  $('sms-sum').textContent = smsRows.length
    ? `결제·입출금 문자 ${smsRows.length}건을 읽었어요.${smsSkipped ? ` (읽지 못한 ${smsSkipped}건)` : ''}`
    : text ? '결제·입출금 문자를 찾지 못했어요. 금액(○○원)과 날짜·시각(10/10 20:15)이 들어 있는 승인·입금·출금 문자를 붙여넣어 주세요.' : '';
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
    const plus = r.cancel || r.type === 'in';   // 취소와 입금은 돈이 들어오는 쪽
    amt.className = plus ? 'in' : 'out';
    amt.textContent = (plus ? '+' : '-') + won(r.amount);
    top.append(cb, when, tag, amt);
    el.appendChild(top);
    if (r.status === 'new' || r.status === 'dup' || r.status === 'again') {
      const edit = document.createElement('div');
      edit.className = 'sms-edit';
      const name = document.createElement('input');
      name.type = 'text'; name.value = r.merchant; name.placeholder = '가맹점'; name.setAttribute('aria-label', '가맹점');
      name.oninput = () => { r.merchant = name.value.trim(); };
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', '카테고리');
      sel.innerHTML = CATEGORIES[r.type === 'in' ? 'in' : 'out'].map((c) => `<option>${c}</option>`).join('');
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

let smsFromPending = false;   // 안드로이드 앱이 모아 둔 알림을 보고 있는 중이면 true (반영하면 대기 목록을 비운다)
function openSms(text, fromPending = false) {
  smsFromPending = fromPending;
  $('sms-text').value = text || '';
  analyzeSms($('sms-text').value);
  renderSms();
  if (!$('sdlg').open) $('sdlg').showModal();
  // 읽을 글이 이미 있으면(모아 둔 알림, 공유) 입력할 일이 없으니 키보드가 올라와 목록을 가리지 않게 한다
  if ($('sms-text').value.trim()) $('sms-text').blur();
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
    notify('클립보드를 읽을 수 없어요. 위 입력칸을 길게 눌러서 직접 붙여넣어 주세요.');
  }
};
$('sms-add').onclick = () => {
  const addedIds = [];
  let removed = 0, lastDate = '';
  smsRows.forEach((r, n) => {
    if (!r.include) return;
    if (r.status === 'remove') { items = items.filter((i) => i !== r.target); removed++; return; }
    const id = Date.now() + n;
    addedIds.push(id);
    items.push(smsItem(r, id));
    lastDate = r.date;
  });
  save();
  if (lastDate) { const d = parseDate(lastDate); cur = new Date(d.getFullYear(), d.getMonth(), 1); }
  // 추가한 것은 토스트로 알리고(삭제가 없었다면 되돌릴 수 있다), 취소로 지운 것은 문구에만 적는다
  if (addedIds.length) {
    showToast('sms', addedIds, {
      title: (n) => `문자에서 ${n}건을 추가했어요`,
      detail: removed ? `${describeItems(addedIds)} · 취소 ${removed}건 삭제` : '',
      undo: !removed,
    });
  } else if (removed) {
    showToast('sms', [], { title: () => `취소된 ${removed}건을 가계부에서 삭제했어요`, detail: ' ' });
  }
  tab = 'list';
  if (smsFromPending) { pending = []; savePending(); smsFromPending = false; }
  $('sdlg').close();
  render();
};
