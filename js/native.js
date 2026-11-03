// 안드로이드 연동: 결제 알림 모으기·자동 반영
// ---- 결제 알림 자동 읽기 (안드로이드 앱 안에서만 동작) ----
// 앱 안에서는 window.Capacitor가 있고 네이티브 플러그인에 접근할 수 있다. 일반 브라우저에서는 null이라 아무 일도 하지 않는다.
const NP = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? window.Capacitor.Plugins.PaymentNotifications : null;
const PKEY = 'ledger.pending.v1';
let npEnabled = null;   // 알림 접근이 켜져 있는지 (아직 모르면 null)
let pending = loadPending();   // 안드로이드가 모아 둔 결제 알림 중 아직 확인하지 않은 것
function loadPending() {
  try {
    const v = JSON.parse(localStorage.getItem(PKEY));
    return Array.isArray(v) ? v.filter((p) => p && typeof p.text === 'string') : [];
  } catch { return []; }
}
function savePending() {
  try { localStorage.setItem(PKEY, JSON.stringify(pending)); } catch { warnStorage(); }
}
const alertStamp = (t) => {
  const d = new Date(Number(t) || Date.now());
  return `${ym(d)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const pendingText = (p) => `[알림 ${alertStamp(p.postTime)}]\n${p.text}`;

// 확실한 결제만 확인 없이 가계부에 넣는다. 조건: 새 결제(중복·취소·승인취소 짝이 아님) + 금액 + 가맹점 +
// 날짜·시각이 글 안에 있음. 하나라도 빠지거나 취소면 지금처럼 대기 목록에 두고 확인을 받는다.
function autoApplyPending() {
  if (!NP || !settings.autoApply || !pending.length || $('sdlg').open) return;   // 확인 창을 보는 중에는 건드리지 않는다
  analyzeSms(pending.map(pendingText).join('\n'));
  const sure = smsRows.filter((r) => r.status === 'new' && !r.cancel && !r.review && (r.whenFromText || r.bank) && r.merchant && r.amount > 0);
  const known = smsRows.filter((r) => r.status === 'dup' || r.status === 'again');   // 이미 가계부에 있거나 같은 결제가 한 번 더 온 알림
  if (!sure.length && !known.length) return;
  // 고정지출이 먼저 넣은 내역과 합쳐지는 경우: 실제 결제 날짜·시각으로 맞추고 알림 표시를 달아, 이후 같은 결제 알림도 걸러지게 한다
  for (const r of known) {
    const d = r.dupOf;
    if (d && d.fixedId && !d.smsKey) { d.date = r.date; d.time = d.time || r.time; d.smsKey = smsKey(r); }
  }
  const added = sure.map((r, n) => ({ ...smsItem(r, Date.now() + n), auto: true }));
  items.push(...added);
  // 넣은 것, 이미 있던 것, 같은 알림이 반복된 것만 대기 목록에서 지운다 (나머지는 확인 대기)
  const done = new Set([...sure, ...known].map(smsKey));
  pending = pending.filter((p) => { const e = parseSms(pendingText(p)); return !e || !done.has(smsKey(e)); });
  save(); savePending();
  if (added.length) {
    // 토스트가 떠 있는 동안 이어서 들어온 것은 합쳐서 보여 주고, 되돌리기도 한꺼번에 지운다
    showToast('auto', added.map((i) => i.id), { title: (n) => `내역 ${n}건이 자동으로 추가됐어요`, undo: true, merge: true });
    const d = parseDate(added[added.length - 1].date);
    cur = new Date(d.getFullYear(), d.getMonth(), 1);
  }
}

// 안드로이드 쪽 대기열에서 알림을 꺼내 온다. 꺼낸 즉시 이 앱의 저장소에 보관해서 잃어버리지 않게 한다.
async function pullPending() {
  if (!NP) return;
  try {
    const { items: got } = await NP.drain();
    if (got && got.length) {
      const ok = got.filter((p) => p && typeof p.text === 'string');
      pending = pending.concat(ok).slice(-200);
      savePending();
      noteAlerts(ok);
    }
  } catch { /* 플러그인을 쓸 수 없는 상황이면 건너뛴다 */ }
  autoApplyPending();
  render();
}

// 받은 알림 현황을 기록한다 (마지막으로 받은 시각, 이번 달 건수)
function noteAlerts(list) {
  if (!list.length) return;
  const st = settings.npStat;
  const month = ym(new Date());
  if (st.month !== month) { st.month = month; st.n = 0; }
  st.n += list.length;
  const times = list.map((p) => Number(p.postTime)).filter((t) => t > 0);
  st.last = Math.max(st.last, ...(times.length ? times : [Date.now()]));   // 알림에 시각이 없으면 지금으로
  saveSettings();
}
const NP_QUIET_DAYS = 14;   // 알림 접근이 켜져 있는데 이만큼 안 왔으면 확인해 보라고 알린다
// 설정 화면: 마지막으로 받은 결제 알림과 이번 달 건수
function renderNpLast() {
  const el = $('np-last');
  if (!NP) { el.hidden = true; return; }
  const st = settings.npStat;
  el.hidden = false;
  if (!st.last) { el.textContent = '아직 받은 결제 알림이 없어요.'; return; }
  const d = new Date(st.last);
  const n = st.month === ym(new Date()) ? st.n : 0;
  let text = `마지막으로 받은 결제 알림: ${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())} · 이번 달 ${n}건`;
  if (npEnabled && Date.now() - st.last > NP_QUIET_DAYS * 24 * 3600 * 1000) {
    text += `\n${NP_QUIET_DAYS}일 넘게 새 알림이 없어요. 결제가 있었다면 배터리 절전 설정을 확인해 보세요.`;
  }
  el.textContent = text;
}
async function refreshNp() {
  $('np-section').hidden = !NP;
  if (!NP) return;
  try {
    npEnabled = (await NP.isEnabled()).enabled;
    $('np-state').textContent = npEnabled ? '켜져 있어요' : '꺼져 있어요';
    $('np-state').className = npEnabled ? 'on' : 'off';
    $('np-open').textContent = npEnabled ? '설정 열기' : '알림 접근 켜기';
  } catch { /* 무시 */ }
  render();
}
$('np-open').onclick = () => { if (NP) NP.openSettings(); };
