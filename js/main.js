// 시작: 스와이프, 버튼, 첫 화면
// ---- 좌우 스와이프로 월(연별 보기에서는 연도) 이동 ----
const EDGE = 24;      // 화면 가장자리는 브라우저의 '뒤로 가기' 제스처와 겹쳐서 제외
const MIN_DX = 60;    // 이만큼 이상 가로로 움직여야 스와이프로 인정
let swipe = null;
document.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  const ok = e.touches.length === 1 && tab !== 'settings' && !$('dlg').open && !$('fdlg').open &&
    t.clientX > EDGE && t.clientX < window.innerWidth - EDGE;
  swipe = ok ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  if (!swipe) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  swipe = null;
  // 세로 스크롤과 구분: 가로 이동이 충분히 크고 세로보다 확실히 클 때만
  if (Math.abs(dx) >= MIN_DX && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });

// 목록을 아래로 내리는 동안에는 + 버튼을 숨겨 금액을 가리지 않고, 위로 올리면 다시 보여준다
let lastY = window.scrollY;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y > lastY + 6 && y > 80) $('fab').classList.add('away');
  else if (y < lastY - 6 || y <= 80) $('fab').classList.remove('away');
  lastY = y;
}, { passive: true });

// 앱을 켜 둔 채 날짜가 바뀌었거나 백그라운드에서 돌아왔을 때도 고정지출을 반영
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  render();
  refreshNp();      // 설정 화면에서 알림 접근을 켜고 돌아왔을 수 있다
  pullPending().then(autoBackup);    // 앱이 꺼져 있는 동안 받은 결제 알림을 가져온 뒤, 필요하면 백업 파일을 저장한다
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
refreshNp();
pullPending().then(autoBackup);
checkUpdate();
if (NP) NP.addListener('queued', () => pullPending());   // 앱이 열려 있을 때 새 결제 알림이 오면 바로 반영

// 저장된 데이터를 읽지 못했다면 첫 화면에서 알린다
if (storageWarning) { fixedNotice = storageWarning; render(); }
// 브라우저가 저장 공간이 부족할 때 이 앱의 데이터를 임의로 지우지 않도록 요청한다 (거절될 수 있다)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// 문자 앱에서 '공유'로 열었을 때 (?text=...) 바로 읽기 창을 띄운다
{
  const q = new URLSearchParams(location.search);
  const shared = q.get('text') || q.get('title');
  if (shared) { history.replaceState(null, '', location.pathname); openSms(shared); }
}
