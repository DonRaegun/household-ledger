// 앱 안 업데이트 (안드로이드)
// ---- 앱 업데이트 (안드로이드 앱 안에서만) ----
// 앱을 열 때 하루에 한 번 공개 저장소의 최신 릴리스를 확인하고, 새 버전이 있으면 물어본다. 설치는 시스템 설치 화면에서 직접 누른다.
const AU = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? window.Capacitor.Plugins.AppUpdate : null;
const UKEY = 'ledger.updateCheck.v1';
const UPDATE_GAP_MS = 12 * 3600 * 1000;
let updating = false;
async function checkUpdate({ manual = false } = {}) {
  if (!AU || updating) return;
  if (!manual) {
    let last = 0;
    try { last = Number(localStorage.getItem(UKEY)) || 0; } catch { /* 무시 */ }
    if (Date.now() - last < UPDATE_GAP_MS) return;
  }
  const btn = $('update-check');
  if (manual) { btn.disabled = true; btn.textContent = '확인 중…'; }
  try {
    const r = await AU.check();
    try { localStorage.setItem(UKEY, String(Date.now())); } catch { /* 무시 */ }
    if (!r.available) { if (manual) showToast('update', [], { title: () => '최신 버전이에요', detail: ' ' }); return; }
    const notes = (r.notes || '').trim().split('\n')[0].slice(0, 80);
    const ok = await ask(`새 버전이 있어요${notes ? `\n${notes}` : ''}\n지금 업데이트할까요? 내역은 그대로 남아요.`, { yes: '업데이트', no: '나중에' });
    if (!ok) return;
    updating = true;
    showToast('update', [], { title: () => '새 버전을 내려받는 중이에요', detail: '끝나면 설치 화면이 열려요' });
    await AU.install({ url: r.url });
    hideToast();
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (msg === 'permission') {
      await ask('설치 권한이 필요해요. 열린 설정에서 "이 출처 허용"을 켜고 돌아와서 다시 눌러 주세요.', { yes: '확인', no: '' });
    } else if (manual || updating) {
      await ask(`업데이트하지 못했어요.\n인터넷 연결을 확인하고 다시 시도해 주세요. (${msg})`, { yes: '확인', no: '' });
    }
  } finally {
    updating = false;
    if (manual) { btn.disabled = false; btn.textContent = '업데이트 확인'; }
  }
}
$('au-section').hidden = !AU;
$('update-check').onclick = () => checkUpdate({ manual: true });
$('auto-apply').onchange = (e) => {
  settings.autoApply = e.target.checked;
  saveSettings();
  if (settings.autoApply) autoApplyPending();   // 켜는 순간, 기다리던 확실한 결제를 바로 넣는다
  render();
};
$('pending-tip').addEventListener('click', async (e) => {
  if (e.target.id === 'pending-open') {
    openSms(pending.map(pendingText).join('\n'), true);
  } else if (e.target.id === 'pending-clear') {
    if (await ask(`모아 둔 결제 알림 ${pending.length}건을 지울까요?`, { yes: '지우기', danger: true })) {
      pending = []; savePending(); render();
    }
  }
});
$('np-tip').addEventListener('click', (e) => {
  if (e.target.id === 'np-tip-on' && NP) NP.openSettings();
  else if (e.target.id === 'np-tip-later') { settings.npDismissed = true; saveSettings(); render(); }
});
