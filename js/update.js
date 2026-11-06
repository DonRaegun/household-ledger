// 앱 안 업데이트 (안드로이드)
// ---- 앱 업데이트 (안드로이드 앱 안에서만) ----
// 앱을 열 때 하루에 한 번 공개 저장소의 최신 릴리스를 확인하고, 새 버전이 있으면 물어본다. 설치는 시스템 설치 화면에서 직접 누른다.
const AU = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? window.Capacitor.Plugins.AppUpdate : null;
const UKEY = 'ledger.updateCheck.v1';
const UPDATE_GAP_MS = 12 * 3600 * 1000;
let updating = false;
let waitingInstall = '';   // '이 출처 허용'을 켜러 설정에 간 동안 기억해 두는 내려받을 주소

// 내려받아서 설치 화면을 연다. 처음 한 번은 설치 허용을 켜야 해서 폰의 설정 화면이 열리는데,
// 그때는 주소를 기억해 두고 허용하고 돌아오면 자동으로 이어간다 (예전에는 돌아와서 확인 버튼을 다시 눌러야 했다)
async function installUpdate(url) {
  updating = true;
  showToast('update', [], { title: () => '새 버전을 내려받는 중이에요', detail: '끝나면 설치 화면이 열려요' });
  try {
    await AU.install({ url });
    hideToast();
  } catch (e) {
    hideToast();
    const msg = String((e && e.message) || e);
    if (msg === 'permission') waitingInstall = url;   // 설정 화면이 열렸다. 켜고 돌아오면 아래 visibilitychange에서 이어서 한다
    else await ask(`업데이트하지 못했어요.\n인터넷 연결을 확인하고 다시 시도해 주세요. (${msg})`, { yes: '확인', no: '' });
  } finally {
    updating = false;
  }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !waitingInstall || updating || !AU) return;
  const url = waitingInstall;
  waitingInstall = '';
  let allowed = false;
  try { allowed = (await AU.canInstall()).allowed; } catch { /* 무시 */ }
  if (allowed) installUpdate(url);
  else await ask('이 앱의 설치 허용을 켜지 않아서 업데이트하지 못했어요.\n다시 업데이트를 누르면 허용 화면이 열려요.', { yes: '확인', no: '' });
});

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
    // 설치 도중 구글 Play 보호가 '앱 검사' 같은 확인 창을 띄울 수 있다. 그걸 닫거나 오래 두면 설치가 실패하므로 미리 알린다
    const ok = await ask(`새 버전이 있어요${notes ? `\n${notes}` : ''}\n지금 업데이트할까요? 내역은 그대로 남아요.\n설치 중에 Play 보호가 검사를 물으면 "검사"나 "확인"을 눌러 주세요.`, { yes: '업데이트', no: '나중에' });
    if (!ok) return;
    if (btn) { btn.disabled = false; btn.textContent = '업데이트 확인'; }   // 설치 화면이 뜨는 동안 버튼이 '확인 중…'으로 남지 않게
    await installUpdate(r.url);
  } catch (e) {
    // 새 버전을 확인하는 단계의 오류 (설치 단계의 오류는 installUpdate가 처리한다). 자동 확인은 조용히 넘어간다
    if (manual) await ask(`업데이트하지 못했어요.\n인터넷 연결을 확인하고 다시 시도해 주세요. (${String((e && e.message) || e)})`, { yes: '확인', no: '' });
  } finally {
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
