// 내보내기·백업
// ---- 내보내기 / 백업 ----
// 안드로이드 앱 안의 웹뷰는 <a download>로 파일을 받지 못해서(눌러도 아무 일도 없다), 공유 창으로 내보낸다.
// 캘린더 파일(.ics)은 공유 창 대신 캘린더 앱으로 바로 연다. 일반 브라우저에서는 아래 기존 방식 그대로다.
const FX = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? window.Capacitor.Plugins.FileExport : null;
function download(name, text, type) {
  if (FX) {
    FX.exportFile({ name, text, mime: type.split(';')[0], view: type.startsWith('text/calendar') })
      .catch(() => notify('파일을 내보내지 못했어요.'));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
$('export-csv').onclick = () => {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [...items].sort((a, b) => a.date.localeCompare(b.date))
    .map((i) => [i.date, i.time || '', i.type === 'out' ? '지출' : '수입', i.category, PAY[i.pay] || '', MOODS[i.mood] || '', i.amount, i.memo].map(esc).join(','));
  download('가계부.csv', '﻿날짜,시각,구분,카테고리,결제수단,소비평가,금액,메모\n' + rows.join('\n'), 'text/csv');
};
$('export-json').onclick = () => {
  settings.lastBackup = today(); settings.backupSnooze = ''; saveSettings();   // 백업 파일에도 이 날짜가 들어간다
  download('가계부-백업.json', JSON.stringify({ version: 2, items, settings }), 'application/json');
  render();
};

// ---- 자동 백업 (안드로이드 앱) ----
// 앱을 열 때 마지막 자동 백업이 7일 넘었고 그 뒤로 내역이 바뀌었으면, 다운로드/가계부백업 폴더에 백업 파일을 조용히 저장한다.
// 앱 데이터를 지워도 남지만, 폰을 잃으면 같이 사라지니 가끔 "백업(JSON)"으로 드라이브 등에 따로 보내 두는 게 안전하다.
const AUTO_BACKUP_DAYS = 7;
// 내역이 바뀌었는지 알아보는 짧은 지문 (djb2)
function itemsSignature() {
  const s = JSON.stringify(items);
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h * 33) ^ s.charCodeAt(k)) >>> 0;
  return `${items.length}:${h.toString(36)}`;
}
async function autoBackup() {
  if (!FX || typeof FX.saveBackup !== 'function' || !settings.autoBackup || !items.length) return;
  const t = today();
  if (settings.lastAutoBackup && Math.round((parseDate(t) - parseDate(settings.lastAutoBackup)) / 86400000) < AUTO_BACKUP_DAYS) return;
  const sig = itemsSignature();
  if (sig === settings.autoBackupSig) return;   // 지난번 이후 바뀐 게 없다
  try {
    const { folder } = await FX.saveBackup({ name: `가계부백업-${t}.json`, text: JSON.stringify({ version: 2, items, settings }) });
    settings.lastAutoBackup = t; settings.autoBackupSig = sig; saveSettings();
    // 다른 토스트(방금 들어온 내역 등)가 떠 있으면 가리지 않는다
    if ($('toast').hidden) showToast('backup', [], { title: () => '백업 파일을 저장했어요', detail: folder || '다운로드/가계부백업' });
    if ($('ab-last')) renderAutoBackup();
  } catch { /* 저장하지 못해도 다음에 앱을 열 때 다시 시도한다 */ }
}
function renderAutoBackup() {
  $('ab-section').hidden = !(FX && typeof FX.saveBackup === 'function');
  if ($('ab-section').hidden) return;
  $('auto-backup').checked = settings.autoBackup;
  const last = settings.lastAutoBackup;
  $('ab-last').textContent = last
    ? `마지막 자동 백업: ${Number(last.slice(5, 7))}월 ${Number(last.slice(8))}일 (다운로드/가계부백업)`
    : '아직 자동 백업을 하지 않았어요. 내역이 있으면 앱을 열 때 저장해요.';
}
$('auto-backup').onchange = (e) => { settings.autoBackup = e.target.checked; saveSettings(); if (settings.autoBackup) autoBackup(); };

$('import-json').onclick = () => $('import-file').click();
$('import-file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const list = Array.isArray(data) ? data : data.items;   // 예전 백업은 배열만 들어 있음
    if (!Array.isArray(list)) throw 0;
    const clean = list.map(cleanItem).filter(Boolean);     // 형식이 맞지 않는 항목은 가져오지 않는다
    const bad = list.length - clean.length;
    if (!clean.length) { notify('불러올 수 있는 내역이 없어요.'); e.target.value = ''; return; }
    const msg = `현재 데이터를 백업 ${clean.length}건으로 교체할까요?${bad ? ` (읽을 수 없는 ${bad}건은 제외돼요)` : ''}`;
    if (!(await ask(msg, { yes: '교체', danger: true }))) { e.target.value = ''; return; }
    items = clean;
    if (!Array.isArray(data)) settings = normSettings(data.settings);
    save(); saveSettings();   // 저장에 실패하면 persist()가 안내를 띄운다
    render();
  } catch { notify('올바른 백업 파일이 아니에요.'); }
  e.target.value = '';
};
