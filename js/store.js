// 저장소: 읽기·쓰기·값 검사, 화면 상태
// 저장된 데이터를 읽는다. 읽지 못하면(손상 등) 원본을 다른 이름으로 보관한 뒤 빈 상태로 시작한다.
// 그냥 빈 상태로 두면 다음 저장 때 원본이 덮어써져 조용히 사라지기 때문이다.
function readJson(key, isValid) {
  let raw;
  try { raw = localStorage.getItem(key); }
  catch {
    storageWarning = '이 브라우저에서는 저장 공간을 쓸 수 없어요. 입력한 내용이 저장되지 않을 수 있어요.';
    storageReadOnly = true;
    return null;
  }
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw);
    if (isValid(v)) return v;
  } catch { /* 아래에서 원본을 보관한다 */ }
  if (!keepBroken(key, raw)) storageReadOnly = true;
  storageWarning = '저장된 데이터를 읽지 못했어요. 원본은 따로 보관해 두었어요. 지우지 말고 알려 주세요.';
  return null;
}
function keepBroken(key, raw) {
  try {
    let slot = `${key}.broken`;
    const old = localStorage.getItem(slot);
    if (old !== null && old !== raw) slot += `.${Date.now()}`;   // 같은 원본은 한 번만 보관한다
    localStorage.setItem(slot, raw);
    return true;
  } catch { return false; }
}
function warnStorage() {
  if (Date.now() - lastStorageAlert < 5000) return;
  lastStorageAlert = Date.now();
  notify('저장하지 못했어요. 저장 공간이 부족하거나 이 브라우저에서 막혀 있어요. 설정 탭에서 백업을 받아 두세요.');
}

// 브라우저 기본 confirm()/alert()는 내장 브라우저나 설정에 따라 아예 뜨지 않고 '취소'로 처리되기도 한다.
// 삭제처럼 중요한 동작이 조용히 무시되지 않도록 앱 안의 창을 쓴다.
function ask(message, { yes = '확인', no = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = $('cdlg');
    $('cdlg-msg').textContent = message;
    $('cdlg-yes').textContent = yes;
    $('cdlg-yes').classList.toggle('warn', danger);
    $('cdlg-no').textContent = no || '';
    $('cdlg-no').hidden = !no;
    const done = (v) => { dlg.close(); resolve(v); };
    $('cdlg-yes').onclick = () => done(true);
    $('cdlg-no').onclick = () => done(false);
    dlg.oncancel = (e) => { e.preventDefault(); done(false); };   // Esc 키
    dlg.showModal();
  });
}
const notify = (message) => ask(message, { no: null });
function persist(key, value) {
  if (storageReadOnly) { warnStorage(); return false; }
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { warnStorage(); return false; }
}
function load() {
  const list = readJson(KEY, Array.isArray) || [];
  let moved = false;
  for (const i of list) {   // 합친 카테고리 이름으로 옮긴다 (한 번 옮기면 저장해서 다음부터는 필요 없다)
    if (i && i.type === 'out' && CAT_RENAME[i.category]) { i.category = CAT_RENAME[i.category]; moved = true; }
  }
  if (moved) persist(KEY, list);
  return list;
}
function save() { return persist(KEY, items); }

// 백업 파일이나 설정에서 온 값은 형식을 확인하고, 맞지 않으면 버리거나 안전한 값으로 바꾼다
function cleanItem(i, n) {
  if (!i || typeof i !== 'object') return null;
  const amount = Number(i.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !DATE_RE.test(i.date) || !['in', 'out'].includes(i.type)) return null;
  const out = {
    id: Number.isFinite(Number(i.id)) ? Number(i.id) : Date.now() + n,
    type: i.type, amount: Math.round(amount), date: i.date,
    category: CATEGORIES[i.type].includes(i.type === 'out' ? catName(i.category) : i.category) ? (i.type === 'out' ? catName(i.category) : i.category) : '기타',
    memo: typeof i.memo === 'string' ? i.memo.slice(0, 200) : '',
  };
  if (PAY[i.pay]) out.pay = i.pay;
  if (MOODS[i.mood]) out.mood = i.mood;
  if (typeof i.time === 'string' && TIME_RE.test(i.time)) out.time = i.time;
  if (typeof i.fixedId === 'string') out.fixedId = i.fixedId.slice(0, 40);
  if (typeof i.smsKey === 'string') out.smsKey = i.smsKey.slice(0, 200);
  if (i.auto === true) out.auto = true;
  return out;
}
function cleanFixed(f) {
  if (!f || typeof f !== 'object' || typeof f.id !== 'string' || typeof f.name !== 'string') return null;
  const amount = Number(f.amount), day = Number(f.day);
  if (!Number.isFinite(amount) || amount <= 0 || !(day >= 1 && day <= 31) || !MONTH_RE.test(f.since)) return null;
  const out = {
    id: f.id.slice(0, 40), name: f.name.slice(0, 60), amount: Math.round(amount), day, since: f.since,
    category: f.sub ? '구독' : CATEGORIES.out.includes(catName(f.category)) ? catName(f.category) : '기타', pay: PAY[f.pay] ? f.pay : 'card', sub: !!f.sub,
  };
  if (MOODS[f.mood]) out.mood = f.mood;
  return out;
}

function normSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    npDismissed: s.npDismissed === true,   // '결제 알림 자동 읽기를 켜세요' 안내를 닫았는지
    theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',   // 화면 모드: 폰 설정을 따라감 / 밝게 / 어둡게
    autoApply: s.autoApply !== false,      // 확실한 결제 알림을 확인 없이 가계부에 넣을지 (기본: 켬)
    lastBackup: typeof s.lastBackup === 'string' && DATE_RE.test(s.lastBackup) ? s.lastBackup : '',
    backupSnooze: typeof s.backupSnooze === 'string' && DATE_RE.test(s.backupSnooze) ? s.backupSnooze : '',
    lastPay: PAY[s.lastPay] ? s.lastPay : 'card',
    cardDay: Number(s.cardDay) >= 1 && Number(s.cardDay) <= 31 ? Number(s.cardDay) : null,
    cardStart: Number(s.cardStart) >= 1 && Number(s.cardStart) <= 31 ? Number(s.cardStart) : 1,
    remindDays: [0, 1, 2, 3].includes(Number(s.remindDays)) && s.remindDays !== '' && s.remindDays != null ? Number(s.remindDays) : 1,
    fixed: Array.isArray(s.fixed) ? s.fixed.map(cleanFixed).filter(Boolean) : [],
    applied: s.applied && typeof s.applied === 'object' ? s.applied : {},
    npStat: normNpStat(s.npStat),
    autoBackup: s.autoBackup !== false,    // 일주일마다 다운로드 폴더에 백업 파일을 저장할지 (안드로이드 앱, 기본: 켬)
    lastAutoBackup: typeof s.lastAutoBackup === 'string' && DATE_RE.test(s.lastAutoBackup) ? s.lastAutoBackup : '',
    catV: Number(s.catV) || 0,             // 카테고리 정리 버전 (3: 구독 고정지출의 내역을 '구독'으로 옮김)
    autoBackupSig: typeof s.autoBackupSig === 'string' ? s.autoBackupSig.slice(0, 24) : '',   // 마지막 자동 백업 때의 내역 지문
  };
}
// 받은 결제 알림 현황: 마지막으로 받은 시각(밀리초)과 그 달에 받은 건수. 수집이 멈췄는지 알아보는 용도
function normNpStat(v) {
  v = v && typeof v === 'object' ? v : {};
  return {
    last: Number.isFinite(v.last) && v.last > 0 ? v.last : 0,
    month: typeof v.month === 'string' && MONTH_RE.test(v.month) ? v.month : '',
    n: Number.isInteger(v.n) && v.n > 0 ? v.n : 0,
  };
}
function loadSettings() {
  return normSettings(readJson(SKEY, (v) => v && typeof v === 'object' && !Array.isArray(v)));
}
function saveSettings() { return persist(SKEY, settings); }

let items = load();
let settings = loadSettings();
// 구독 카테고리가 생기기 전에 만든 구독 고정지출의 내역도 '구독'으로 옮긴다 (한 번만)
if (settings.catV < 3) {
  const subIds = new Set(settings.fixed.filter((f) => f.sub).map((f) => f.id));
  for (const i of items) if (i.type === 'out' && i.fixedId && subIds.has(i.fixedId)) i.category = '구독';
  settings.catV = 3;
  persist(KEY, items); persist(SKEY, settings);
}
let cur = new Date(); cur.setDate(1);
let tab = 'list';          // 'list' | 'stats' | 'settings'
let listMode = 'list';     // 'list' | 'cal'
let statsMode = 'month';   // 'month' | 'year'
let selCat = null;         // 도넛에서 선택한 카테고리
let selDay = null;         // 달력에서 선택한 날짜
let editing = null;
let fEditing = null;

// 화면 위쪽 배너: 저장소를 못 읽는 것처럼 직접 확인해야 하는 중요한 경고에만 쓴다
let fixedNotice = null;
