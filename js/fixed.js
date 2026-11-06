// 고정지출과 카드 출금 예정
// ---- 고정지출 ----
// 등록한 달부터 이번 달까지(최대 12개월), 날짜가 지났는데 아직 처리하지 않은 것들
function pendingFixed() {
  const now = new Date();
  const nm = now.getFullYear() * 12 + now.getMonth();
  const t = today();
  const found = [];
  for (const f of settings.fixed) {
    const since = parseDate(f.since + '-01');
    const from = Math.max(since.getFullYear() * 12 + since.getMonth(), nm - 11);
    for (let n = from; n <= nm; n++) {
      const y = Math.floor(n / 12), m = n % 12;
      const key = `${f.id}:${y}-${pad(m + 1)}`;
      const date = `${y}-${pad(m + 1)}-${pad(clampDay(y, m, f.day))}`;
      if (date <= t && !settings.applied[key]) found.push({ f, date, key });
    }
  }
  return found;
}

// 날짜가 지난 고정지출은 물어보지 않고 자동으로 내역에 넣고, 넣었다는 것을 토스트로 알린다
function autoApplyFixed() {
  const pending = pendingFixed();
  if (!pending.length) return;
  const ids = [];
  const claimed = new Set();
  pending.forEach((p, n) => {
    settings.applied[p.key] = true;
    // 결제 알림으로 이미 들어온 같은 결제(같은 날 같은 금액, 이름이 닮으면 하루 차이까지)가 있으면 새로 넣지 않는다
    const same = items.find((i) => !i.fixedId && i.smsKey && i.type === 'out' && i.amount === p.f.amount && !claimed.has(i) &&
      (i.date === p.date || (dayGap(i.date, p.date) <= 1 && sameName(i.memo, p.f.name))));
    if (same) {   // 알림이 먼저 들어온 경우: 고정지출과 합치고, 알림에서 분류를 못 맞혀 '기타'였다면 고정지출의 분류(고정비·구독)를 따른다
      same.fixedId = p.f.id; claimed.add(same);
      if (same.category === '기타') same.category = p.f.category;
      return;
    }
    const id = Date.now() + n;
    ids.push(id);
    items.push({
      id, type: 'out', amount: p.f.amount, category: p.f.category,
      pay: p.f.pay, mood: p.f.mood, date: p.date, memo: p.f.name, fixedId: p.f.id,
    });
  });
  save(); saveSettings();
  if (ids.length) showToast('fixed', ids, { title: (n) => `고정지출 ${n}건이 추가됐어요` });
}
// 이번 달 안에 아직 날짜가 오지 않은 고정지출 (통계에는 날짜가 지나야 들어간다)
function upcomingFixed() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), t = today();
  return settings.fixed
    .map((f) => ({ f, date: `${y}-${pad(m + 1)}-${pad(clampDay(y, m, f.day))}` }))
    .filter((u) => u.date > t && !settings.applied[`${u.f.id}:${y}-${pad(m + 1)}`]);
}
$('banner').addEventListener('click', (e) => {
  if (e.target.id === 'fix-ok') { fixedNotice = null; render(); }
});

// ---- 카드 출금 예정 (카드 한 장) ----
// 사용 기간은 '매달 N일부터 다음 달 N-1일까지'(N=1이면 1일~말일)이고,
// 그 기간이 끝난 다음 달의 결제일에 출금된다. 예) N=19: 10/19~11/18 사용분 -> 12월 결제일
const ymd = (d) => `${ym(d)}-${pad(d.getDate())}`;
function cardPeriod(due) {
  const s = settings.cardStart;
  const endMonth = new Date(due.getFullYear(), due.getMonth() - 1, 1);   // 사용 기간이 끝나는 달
  const y = endMonth.getFullYear(), m = endMonth.getMonth();
  if (s === 1) return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
  return {
    from: new Date(y, m - 1, clampDay(y, m - 1, s)),
    to: new Date(y, m, clampDay(y, m, s - 1)),
  };
}
function cardInfo() {
  if (!settings.cardDay) return null;
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueOf = (y, m) => new Date(y, m, clampDay(y, m, settings.cardDay));
  let due = dueOf(t.getFullYear(), t.getMonth());
  if (due < t) due = dueOf(t.getFullYear(), t.getMonth() + 1);
  const { from, to } = cardPeriod(due);
  const [f, e] = [ymd(from), ymd(to)];
  const amount = items
    .filter((i) => i.type === 'out' && i.pay === 'card' && i.date >= f && i.date <= e)
    .reduce((s, i) => s + i.amount, 0);
  const days = Math.round((due - t) / 86400000);
  return {
    amount,
    when: days === 0 ? '오늘' : `D-${days}`,
    dateText: `${due.getMonth() + 1}월 ${due.getDate()}일`,
    period: `${from.getMonth() + 1}/${from.getDate()}~${to.getMonth() + 1}/${to.getDate()}`,
  };
}
