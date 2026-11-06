// 캘린더 알림 파일(.ics)
// ---- 캘린더 알림 (.ics) ----
// 웹앱은 꺼진 상태에서 알림을 띄울 수 없어서, 폰 캘린더가 알려주도록 일정 파일을 만든다.
// 달마다 날짜가 다른 경우(31일 등)를 정확히 맞추려고 반복 규칙 대신 12개월치를 날짜별로 만든다.
const WHEN = ['오늘', '내일', '모레', '3일 뒤'];
const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
// 한 줄은 75바이트까지라서 넘으면 접는다 (한글은 글자 중간에서 자르지 않는다)
function icsFold(line) {
  const enc = new TextEncoder();
  let out = '', cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 73) { out += cur + '\r\n '; cur = ''; bytes = 1; }
    cur += ch; bytes += b;
  }
  return out + cur;
}
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
// 결제일 day의 앞으로 12번과, 각각의 알림 날짜(결제일 - 알림 시점)
function upcomingDues(day) {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = [];
  for (let k = 0; out.length < 12 && k < 14; k++) {
    const y = now.getFullYear(), m = now.getMonth() + k;
    const due = new Date(y, m, clampDay(y, m, day));
    const remind = new Date(due.getFullYear(), due.getMonth(), due.getDate() - settings.remindDays);
    if (remind >= t) out.push({ due, remind });
  }
  return out;
}
function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//household-ledger//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const d = icsDate(e.remind);
    lines.push(
      'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`,
      `DTSTART:${d}T090000`, `DTEND:${d}T093000`,
      `SUMMARY:${icsEscape(e.title)}`, `DESCRIPTION:${icsEscape(e.desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, 'TRIGGER:PT0S', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
const dueKey = (due) => `${due.getFullYear()}${pad(due.getMonth() + 1)}`;
const dueText = (due) => `${due.getMonth() + 1}월 ${due.getDate()}일`;
function cardEvents() {
  const when = WHEN[settings.remindDays];
  return upcomingDues(settings.cardDay).map(({ due, remind }) => ({
    uid: `card-${dueKey(due)}@household-ledger`, remind,
    title: `${when} 카드값 출금일 - 계좌 잔액 확인`,
    desc: `${dueText(due)} 카드값 출금일이에요. 가계부 앱에서 출금 예정 금액을 확인하세요.`,
  }));
}
function fixedEvents() {
  const when = WHEN[settings.remindDays];
  return settings.fixed.flatMap((f) => upcomingDues(f.day).map(({ due, remind }) => ({
    uid: `fixed-${f.id}-${dueKey(due)}@household-ledger`, remind,
    title: `${when} ${f.name} ${won(f.amount)} 결제`,
    desc: `${dueText(due)} ${f.name} (${f.category}${PAY[f.pay] ? ', ' + PAY[f.pay] : ''}) - 매달 ${f.day}일`,
  })));
}
$('remind-days-btn').onclick = () => openOptionPicker({
  title: '알림 시점', labels: REMIND_LABELS, index: settings.remindDays,
  done: (i) => { settings.remindDays = i; saveSettings(); renderSettings(); },
});
$('ics-card').onclick = () => {
  if (settings.cardDay) download('가계부-카드출금알림.ics', buildIcs(cardEvents()), 'text/calendar;charset=utf-8');
};
$('ics-fixed').onclick = () => {
  if (settings.fixed.length) download('가계부-고정지출알림.ics', buildIcs(fixedEvents()), 'text/calendar;charset=utf-8');
};
