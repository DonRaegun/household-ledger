// 돌려서 고르는 창 (갤럭시 시계 느낌): 시각, 날짜, 고정지출의 '매달 며칠'을 모두 이 창 하나로 고른다
// 화면 없는 계산(시각·날짜 변환)은 core.js에 있다.
const WHEEL_H = 48;      // 한 칸 높이 (style.css의 .wheel div와 같아야 한다)
const SETTLE_MS = 140;   // 돌리다 멈춘 것으로 보는 시간

const wheelIndex = (el) => Math.max(0, Math.min(el._n - 1, Math.round(el.scrollTop / WHEEL_H)));
function markWheel(el) {
  const i = wheelIndex(el);
  [...el.children].forEach((c, k) => c.classList.toggle('on', k === i));   // 가운데 칸만 크고 진하게
}
function buildWheel(el, labels, index) {
  el._n = labels.length;
  el.innerHTML = labels.map((l) => `<div>${l}</div>`).join('');
  el.scrollTop = index * WHEEL_H;
  markWheel(el);
}

let picker = null;   // 열려 있는 창의 상태 { wheels, onSettle, done }
// cols: [{ name, labels, index, flex, after }]  after: 이 줄 뒤에 붙일 글자(예: ':')
// onSettle(인덱스들, 휠들): 어느 줄이든 멈췄을 때 (날짜에서 달이 바뀌면 일 수를 다시 맞추는 데 쓴다)
// done(인덱스들): 확인을 누르면 인덱스 배열, 지우기를 누르면 null
function openPicker({ title, hint = '', cols, clear = false, onSettle = null, done }) {
  $('p-title').textContent = title;
  $('p-hint').textContent = hint;
  $('p-hint').hidden = !hint;
  $('p-clear').hidden = !clear;
  const box = $('p-wheels');
  box.innerHTML = '<div class="wheel-band" aria-hidden="true"></div>';
  const wheels = cols.map((c) => {
    const el = document.createElement('div');
    el.className = 'wheel';
    el.style.flex = c.flex || 1;
    el.setAttribute('aria-label', c.name || '');
    box.appendChild(el);
    if (c.after) {
      const sep = document.createElement('span');
      sep.className = 'colon';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = c.after;
      box.appendChild(sep);
    }
    let raf = 0, settle = 0;
    el.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => markWheel(el));
      clearTimeout(settle);
      settle = setTimeout(() => { if (picker && picker.onSettle) picker.onSettle(picker.wheels.map(wheelIndex), picker.wheels); }, SETTLE_MS);
    });
    el.addEventListener('click', (e) => {   // 칸을 직접 눌러도 그 칸으로 간다
      const k = [...el.children].indexOf(e.target.closest('div'));
      if (k >= 0) el.scrollTo({ top: k * WHEEL_H, behavior: 'smooth' });
    });
    return el;
  });
  picker = { wheels, onSettle, done };
  $('pdlg').showModal();
  // 창이 열려서 크기가 생긴 뒤에 위치를 맞춘다
  requestAnimationFrame(() => wheels.forEach((el, k) => buildWheel(el, cols[k].labels, cols[k].index)));
}
$('p-ok').onclick = () => { const v = picker.wheels.map(wheelIndex); const d = picker.done; $('pdlg').close(); d(v); };
$('p-clear').onclick = () => { const d = picker.done; $('pdlg').close(); d(null); };
$('p-cancel').onclick = () => $('pdlg').close();

const range = (n, from = 0) => Array.from({ length: n }, (_, k) => k + from);

// 시각: done('HH:MM'), 지우면 ''
function openTimePicker(value, done) {
  const t = timeToWheel(TIME_RE.test(value || '') ? value : nowTime());
  openPicker({
    title: '시각', clear: true,
    cols: [
      { name: '오전 오후', labels: ['오전', '오후'], index: t.ap, flex: 0.85 },
      { name: '시', labels: range(12, 1), index: t.h12 - 1, after: ':' },
      { name: '분', labels: range(60).map(pad), index: t.m },
    ],
    done: (v) => done(v ? wheelToTime(v[0], v[1] + 1, v[2]) : ''),
  });
}

// 날짜: done('YYYY-MM-DD'). 달을 바꾸면 그 달의 일 수에 맞춰 '일' 줄을 다시 만든다
function openDatePicker(value, done) {
  const now = new Date();
  const base = DATE_RE.test(value || '') ? parseDate(value) : now;
  const y0 = Math.min(now.getFullYear() - 10, base.getFullYear());
  const y1 = Math.max(now.getFullYear() + 3, base.getFullYear());
  const dayLabels = (y, m) => range(daysInMonth(y, m), 1).map((d) => `${d}일`);
  openPicker({
    title: '날짜',
    cols: [
      { name: '연', labels: range(y1 - y0 + 1, y0).map((y) => `${y}년`), index: base.getFullYear() - y0, flex: 1.3 },
      { name: '월', labels: range(12, 1).map((m) => `${m}월`), index: base.getMonth() },
      { name: '일', labels: dayLabels(base.getFullYear(), base.getMonth() + 1), index: base.getDate() - 1 },
    ],
    onSettle: ([yi, mi, di], wheels) => {
      const y = y0 + yi, m = mi + 1, n = daysInMonth(y, m);
      if (wheels[2]._n !== n) buildWheel(wheels[2], dayLabels(y, m), Math.min(di, n - 1));
    },
    done: ([yi, mi, di]) => done(`${y0 + yi}-${pad(mi + 1)}-${pad(di + 1)}`),
  });
}

// 고정지출의 '매달 며칠': done(일 숫자)
function openDayPicker(day, done) {
  openPicker({
    title: '매달 며칠',
    hint: '31일처럼 그 달에 없는 날은 말일로 맞춰져요.',
    cols: [{ name: '일', labels: range(31, 1).map((d) => `${d}일`), index: Math.min(31, Math.max(1, day || 1)) - 1 }],
    done: ([i]) => done(i + 1),
  });
}
