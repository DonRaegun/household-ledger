// 토스트 알림
// ---- 토스트: 화면 위쪽에 잠깐 떠서 방금 무엇이 들어갔는지 보여 주고 저절로 사라진다 ----
const TOAST_MS = 8000;
const toast = { kind: '', ids: [], timer: 0 };
const freshIds = new Set();   // 방금 들어온 내역 (목록에서 잠깐 반짝인다)
function describeItems(ids) {
  const found = ids.map((id) => items.find((i) => i.id === id)).filter(Boolean);
  const names = found.slice(0, 2).map((i) => `${stripInst(i.memo) || i.category} ${won(i.amount)}`);
  return names.join(' · ') + (found.length > 2 ? ` 외 ${found.length - 2}건` : '');
}
function hideToast() {
  clearTimeout(toast.timer);
  $('toast').hidden = true;
  $('toast').style.transform = $('toast').style.opacity = '';   // 밀어서 치운 뒤 다음 토스트가 제자리에서 뜨게
  toast.ids = [];
}
// 같은 종류(kind)가 아직 떠 있고 merge면 이어서 들어온 것을 합친다. undo면 '되돌리기'가 이 내역들을 한꺼번에 지운다.
function showToast(kind, ids, { title, detail = '', undo = false, merge = false } = {}) {
  const el = $('toast');
  const keep = merge && !el.hidden && toast.kind === kind;
  toast.ids = keep ? [...toast.ids, ...ids] : [...ids];
  toast.kind = kind;
  toast.ids.forEach((id) => freshIds.add(id));
  $('toast-title').textContent = title(toast.ids.length);
  $('toast-detail').textContent = detail || describeItems(toast.ids);
  $('toast-detail').hidden = !$('toast-detail').textContent;
  $('toast-undo').hidden = !(undo && toast.ids.length);
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');   // 나타나는 동작을 처음부터 다시 재생
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideToast, TOAST_MS);
  setTimeout(() => ids.forEach((id) => freshIds.delete(id)), 4500);
}
let toastSwiped = false;   // 밀다 만 뒤에 따라오는 클릭으로 토스트가 닫히지 않게
$('toast').addEventListener('click', (e) => {
  if (toastSwiped) { toastSwiped = false; return; }
  if (e.target.id !== 'toast-undo') hideToast();
});
// 옆(좌우)으로 밀어서 치우기. 위아래로는 움직이지 않는다
(() => {
  const el = $('toast');
  let sx = 0, dx = 0, down = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.id === 'toast-undo') return;
    down = true; toastSwiped = false; sx = e.clientX; dx = 0;
    el.classList.remove('show');   // 나타나는 동작이 끝 위치를 붙잡고 있으면 끌어도 안 움직인다
  });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    dx = e.clientX - sx;
    if (!toastSwiped && Math.abs(dx) < 6) return;
    if (!toastSwiped) { toastSwiped = true; el.setPointerCapture(e.pointerId); }
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 220));
  });
  const end = () => {
    if (!down) return;
    down = false;
    if (toastSwiped && Math.abs(dx) > 60) hideToast();
    else el.style.transform = el.style.opacity = '';   // 덜 밀었으면 제자리로
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
})();
$('toast-undo').onclick = () => {
  const gone = new Set(toast.ids);
  items = items.filter((i) => !gone.has(i.id));
  save(); hideToast(); render();
};
