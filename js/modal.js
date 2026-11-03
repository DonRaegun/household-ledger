// 창 닫기: 뒤로가기, 바깥 터치
// ---- 창(dialog) 열고 닫기 보조 ----
// 1) 안드로이드 뒤로가기: 창이 열릴 때마다 웹 기록을 하나 쌓아 두고, 뒤로가기가 오면 맨 위 창만 닫는다 (앱이 꺼지지 않는다).
//    창이 닫히면 쌓아 둔 기록을 조용히 되돌린다. 열린 창 수와 쌓은 기록 수를 항상 맞춘다.
// 2) 바깥(어두운 배경) 터치: 창을 닫는다. 입력창(data-guard)은 열린 뒤 값을 바꿨으면 닫지 않는다.
// 3) 창이 열려 있는 동안 뒤의 화면이 스크롤되지 않는 것은 style.css가 맡는다.
(function () {
  const dialogs = Array.from(document.querySelectorAll('dialog'));
  let order = [];       // 열린 순서대로 (맨 뒤가 맨 위 창)
  let pushed = 0;       // 우리가 쌓은 기록 수
  let undoing = false;  // 기록을 되돌리는 중 (브라우저가 끝내기 전에 새 기록을 쌓으면 어긋나서, 끝날 때까지 기다린다)

  // 취소(Esc)와 같은 경로로 닫는다. 확인 창 등은 취소 처리에서 결과를 정리한다
  function closeTop(dlg) {
    const ev = new Event('cancel', { cancelable: true });
    dlg.dispatchEvent(ev);
    if (!ev.defaultPrevented) dlg.close();
  }

  function sync() {
    order = order.filter((d) => d.open).concat(dialogs.filter((d) => d.open && !order.includes(d)));
    if (undoing) return;
    while (pushed < order.length) { history.pushState({ ledgerDialog: true }, ''); pushed++; }
    if (pushed > order.length) {
      const extra = pushed - order.length;
      pushed = order.length;
      undoing = true;
      history.go(-extra);
    }
  }

  window.addEventListener('popstate', () => {
    if (undoing) { undoing = false; sync(); return; }
    if (!pushed) return;
    pushed--;                         // 사용자가 뒤로가기로 기록 하나를 쓴 것
    const top = order[order.length - 1];
    if (top) closeTop(top);
    sync();                           // 닫혔으면 이미 맞고, 안 닫혔으면 기록을 다시 쌓는다
  });

  // 입력창은 열린 뒤 값이 바뀌었는지 보려고 처음 상태를 기억해 둔다
  const snapshots = new Map();
  const valuesOf = (dlg) => Array.from(dlg.querySelectorAll('input, select, textarea'))
    .map((el) => (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)).join('\u0001');

  const watcher = new MutationObserver((records) => {
    for (const r of records) {
      const dlg = r.target;
      if (dlg.open && dlg.hasAttribute('data-guard') && !snapshots.has(dlg)) snapshots.set(dlg, valuesOf(dlg));
      if (!dlg.open) snapshots.delete(dlg);
    }
    sync();
  });

  const outside = (dlg, e) => {
    const b = dlg.getBoundingClientRect();
    return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom;
  };
  dialogs.forEach((dlg) => {
    watcher.observe(dlg, { attributes: true, attributeFilter: ['open'] });
    let downOutside = false;
    dlg.addEventListener('pointerdown', (e) => { downOutside = e.target === dlg && outside(dlg, e); });
    dlg.addEventListener('click', (e) => {
      // 글씨를 끌다가 바깥에서 손을 뗀 경우는 닫지 않는다 (누르기와 떼기가 모두 바깥일 때만)
      if (!(downOutside && e.target === dlg && outside(dlg, e))) return;
      downOutside = false;
      if (dlg.hasAttribute('data-guard') && snapshots.get(dlg) !== valuesOf(dlg)) return;
      closeTop(dlg);
    });
  });
})();
