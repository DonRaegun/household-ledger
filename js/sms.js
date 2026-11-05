// 문자·알림 해석과 중복 판정 (화면 없음)
// ---- 결제 문자 읽기 (붙여넣기 / 공유) ----
// 카드 승인 문자나 앱 알림에서 금액, 가맹점, 결제 시각을 읽어 입력을 돕는다.
// 카드번호와 이름은 읽지도 저장하지도 않는다. 읽은 결과는 확인 창에서 고친 뒤에만 반영된다.
// 문자 한 통이 시작되는 줄: 머리글('[이름] [시각]', '[Web발신]', '●') 또는 카드 이름+끝자리만 있는 줄('KB국민체크1234')
const SMS_START = /^\s*(\[[^\]\n]+\]\s*\[[^\]\n]+\]|\[Web발신\]|●|[가-힣A-Za-z]*(?:체크|카드|신용)[가-힣A-Za-z]*\d{3,4}\s*$)/i;
const SMS_WHEN = /(\d{1,2})[\/.\-](\d{1,2})\s+(\d{1,2}):(\d{2})/;     // '10/10 20:15', '10-10 20:15'
const CAT_GUESS = [
  [/카페|커피|스타벅스|투썸|이디야|메가|빽다방|할리스|매머드|컴포즈|더벤티|파스쿠찌|엔제리너스|폴바셋/, '카페'],
  [/편의점|GS25|CU|세븐일레븐|마트|식당|정육|치킨|피자|분식|김밥|국밥|횟집|고기|배달|맥도날|버거|도시락|반찬/, '식비'],
  [/주유|택시|지하철|버스|티머니|코레일|철도|하이패스|주차/, '교통'],
  [/병원|의원|약국|치과|한의원/, '의료'],
  [/백화점|리테일|올리브영|다이소|쿠팡|11번가|옥션|무신사/, '쇼핑'],
];
const stripInst = (memo) => String(memo || '').replace(/ \d+개월 할부$/, '');

// 붙여넣은 글을 문자 한 통씩 나눈다 (카톡에서 복사한 '[이름] [오후 12:31]' 머리글도 경계로 쓴다)
const ALERT_LINE = /^\s*\[알림 \d{4}-\d{2}-\d{2} \d{2}:\d{2}\]\s*$/;   // 안드로이드 앱이 알림 앞에 붙이는 도착 시각 줄
function splitSms(text) {
  const blocks = [];
  let cur = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const startsAlert = ALERT_LINE.test(line) && cur.some((l) => l.trim());
    if (startsAlert || (SMS_START.test(line) && SMS_WHEN.test(cur.join('\n')))) { blocks.push(cur.join('\n')); cur = []; }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur.join('\n'));
  return blocks.filter((b) => b.trim());
}

// 가맹점이 아닌 줄: 카드·승인 안내, 고객명, 승인시각, 금액, 날짜 같은 라벨
const LABEL_LINE = /^(\[?Web발신\]?|●.*|일시불|\d+\s*개월|고객명.*|.*님$|승인시각.*|.*(승인|취소|결제).*|.*(카드|체크|신용).*|.*(잔액|누적|한도).*)$/;
const textLines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const isMerchantLine = (l) => !/\d[\d,]*\s*원/.test(l) && !SMS_WHEN.test(l) && !LABEL_LINE.test(l);

// 입출금 문자: 입금/출금 단어가 있고 승인 문자가 아닌 것. 금액은 '50,000원'이거나 '입금 50,000'처럼 단어 뒤의 숫자
const BANK_WORD = /입금|출금/;
const BANK_ONLY = (s) => s.replace(/입출금|출금\s*(?:계좌|가능)|입금\s*계좌/g, '');   // '입출금통장'의 '출금'을 방향으로 읽지 않게
const isBank = (block) => BANK_WORD.test(BANK_ONLY(block)) && !/승인/.test(block);
// 잔액·한도처럼 이번 거래 금액이 아닌 숫자는 건너뛰고 첫 금액을 고른다
function bankAmount(block) {
  for (const m of block.matchAll(/(\d[\d,]*)\s*원/g)) {
    const before = block.slice(Math.max(0, m.index - 10), m.index);
    if (/(잔액|잔고|누적|한도|수수료)\s*:?\s*$/.test(before)) continue;
    return { n: Number(m[1].replace(/,/g, '')), at: m.index };
  }
  const m = BANK_ONLY(block).match(/(?:입금|출금)\s*:?\s*(\d[\d,]*)(?![\d,])/);
  return m ? { n: Number(m[1].replace(/,/g, '')), at: block.indexOf(m[0]) } : null;
}
// 입금인/받는 사람: 날짜·금액·계좌번호·은행 이름이 아닌 줄에서 입금/출금 같은 단어를 뺀 첫 글. 없으면 '입금'/'출금'
const BANK_NAME = /(?:은행|뱅크|통장|계좌|증권)$|^(?:KB|NH|SC|IBK|신한|우리|하나|농협|국민|기업|카카오|토스)(?:은행)?$/i;
function bankParty(block, dir) {
  const clean = (s) => s.replace(/\[[^\]]*\]|\([^)]*\)|입출금|입금|출금|이체|님|[|·:]/g, '').trim();
  const usable = (t) => t.length >= 2 && !BANK_NAME.test(t) && !/^(Web발신|안내|알림)$/.test(t);
  for (const raw of textLines(block)) {
    const line = raw.replace(/(?:잔액|잔고|한도).*$/, '').trim();   // 잔액부터는 버린다 (한 줄에 이어 붙은 형식도 있다)
    if (!line) continue;
    if (/\d[\d,]*\s*원/.test(line)) {   // 한 줄에 다 있으면 금액 뒤의 글('입금 1,500,000원 급여'), 없으면 앞의 글('[출금] 네이버페이충전 20,000원 11/03 09:46')
      const after = clean(line.replace(/^.*?\d[\d,]*\s*원/, '').replace(SMS_WHEN, ''));
      if (usable(after) && !/\d{3,}/.test(after)) return after;
      const before = clean(line.replace(/\d[\d,]*\s*원.*$/, '').replace(SMS_WHEN, ''))
        .replace(/^(?:KB국민|국민|신한|우리|하나|NH농협|농협|기업|IBK|SC제일|카카오뱅크|토스뱅크)(?:은행)?\s+/i, '');
      if (usable(before) && !/\d{3,}/.test(before)) return before;
      continue;
    }
    if (/→|->/.test(line)) {   // '보낸 사람 → 내 통장'(입금) / '내 통장 → 받는 사람'(출금): 상대방 쪽을 쓴다
      const [from, to] = line.split(/\s*(?:→|->)\s*/);
      const side = clean(dir === 'in' ? from : to);
      if (usable(side) && !/\d{3,}/.test(side)) return side;
      continue;
    }
    if (SMS_WHEN.test(line) || /\d{3,}/.test(line)) continue;
    const t = clean(line);
    if (usable(t)) return t;
  }
  return dir === 'in' ? '입금' : '출금';
}

// 문자 한 통 -> { type, cancel, amount, date, time, merchant, inst, bank, review } (결제·입출금 문자가 아니면 null)
function parseSms(block) {
  // 알림으로 받은 글은 맨 앞에 '[알림 2026-11-02 06:12]'(도착 시각) 줄이 붙어 있다
  let posted = null;
  block = block.replace(/^\s*\[알림 (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})\]\s*$/m, (_, ...g) => {
    posted = g.slice(0, 5).map(Number);
    return '';
  });
  // '테스트카드 | 가맹점(일시불)'처럼 카드 이름이 앞에 붙은 줄은 카드 이름을 떼고 가맹점만 남긴다
  block = block.replace(/^[ \t]*[가-힣A-Za-z]*(?:체크|카드|신용)[가-힣A-Za-z]*[ \t]*\|[ \t]*/gm, '');
  const w = block.match(SMS_WHEN);
  const bank = isBank(block);
  const a = bank ? null : block.match(/(\d[\d,]*)\s*원/);
  const ba = bank ? bankAmount(block) : null;
  if ((!a && !ba) || (!w && !posted)) return null;
  const cancel = /취소/.test(block);
  if (bank) {
    // 입금취소·정정처럼 방향이 헷갈리는 알림은 읽지 않는다 (잘못 넣는 것보다 낫다)
    if (cancel || /정정|오류/.test(block)) return null;
  } else if (!cancel && !/승인|결제/.test(block)) return null;
  let y, mo, da, hh, mi, rest;
  if (w) {
    [mo, da, hh, mi] = [Number(w[1]), Number(w[2]), Number(w[3]), Number(w[4])];
    // 문자에는 연도가 없어서 올해로 보고, 많이 미래면 작년으로 본다 (1월에 12월 문자를 읽는 경우)
    const now = new Date();
    y = now.getFullYear();
    if (new Date(y, mo - 1, da, hh, mi) - now > 36 * 3600 * 1000) y--;
    rest = block.slice(block.indexOf(w[0]) + w[0].length);
  } else {
    // 글 안에 날짜·시각이 없으면 알림이 도착한 시각을 결제 시각으로 본다. 가맹점은 금액 뒤의 글로 짐작한다
    [y, mo, da, hh, mi] = posted;
    rest = a ? block.slice(block.indexOf(a[0]) + a[0].length).replace(/^\s*(일시불|\d+\s*개월)/, '') : block;
  }
  if (bank) {
    const t = BANK_ONLY(block);
    const out = t.search(/출금/), inn = t.search(/입금/);
    const type = inn >= 0 && (out < 0 || inn < out) ? 'in' : 'out';
    return {
      type, bank: true, cancel: false, amount: ba.n,
      date: `${y}-${pad(mo)}-${pad(da)}`, time: `${pad(hh)}:${pad(mi)}`,
      merchant: bankParty(block, type), inst: 0,
      whenFromText: !!w,
      // 카드대금 출금은 카드 사용 내역과 겹치니 자동으로 넣지 않고 확인을 받는다
      review: type === 'out' && /카드|대금|결제/.test(block),
    };
  }
  // 가맹점: 날짜·시각 뒤(우리카드 형식)에서 먼저 찾고, 없으면 글 전체에서 라벨 줄을 뺀 첫 줄(KB국민 형식: 금액 뒤·날짜 앞)을 쓴다
  const merchant = (textLines(rest).find(isMerchantLine) || textLines(block).find(isMerchantLine) || '')
    .replace(/（/g, '(').replace(/）/g, ')').replace(/\s*\((?:일시불|\d+\s*개월)\)$/, '');
  const inst = block.match(/(\d+)\s*개월/);
  return {
    type: 'out', cancel, amount: Number(a[1].replace(/,/g, '')),
    date: `${y}-${pad(mo)}-${pad(da)}`, time: `${pad(hh)}:${pad(mi)}`,
    merchant, inst: inst ? Number(inst[1]) : 0,
    whenFromText: !!w,   // 날짜·시각이 글 안에 있었는지 (알림이 도착한 시각으로 대신한 것이 아닌지)
  };
}

// 전에 입력한 같은 가맹점의 카테고리를 먼저 따르고, 없으면 이름으로 짐작한다
function guessCategory(merchant, type = 'out') {
  const past = [...items].sort(byNewest).find((i) => i.type === type && stripInst(i.memo) === merchant && merchant);
  if (past) return past.category;
  if (type === 'in') return /급여|월급|상여/.test(merchant) ? '급여' : '기타';
  const hit = CAT_GUESS.find(([re]) => re.test(merchant));
  return hit ? hit[1] : '기타';
}
const smsMemo = (r) => r.merchant + (r.inst ? ` ${r.inst}개월 할부` : '');
const smsKey = (r) => `${r.type === 'in' ? '+' : ''}${r.date} ${r.time} ${r.amount} ${r.merchant}`;
// 같은 결제로 볼 시각 차이(분). 문자와 카드 앱 알림이 같은 결제를 1~2분 다르게 적는 경우가 있다.
// 대신 같은 금액을 2분 안에 두 번 결제하면 한 건으로 합쳐진다.
const SAME_MINUTES = 2;
const minuteOf = (date, time) => Math.round(parseDate(date).getTime() / 60000) + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const nearMoment = (a, b) => !!(a.time && b.time) && Math.abs(minuteOf(a.date, a.time) - minuteOf(b.date, b.time)) <= SAME_MINUTES;
const normName = (s) => String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const sameName = (a, b) => { a = normName(a); b = normName(b); return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)); };
const dayGap = (a, b) => Math.abs(Math.round((parseDate(a) - parseDate(b)) / 86400000));
// 고정지출이 넣은 내역(시각과 알림 표시가 없다)이 이 알림과 같은 결제인지. 같은 날 같은 금액이면 같은 결제로 보고,
// 하루 차이는 이름이 닮았을 때만 인정한다 (구독료와 우연히 같은 금액의 다른 결제를 합치지 않으려고)
const fixedLike = (i, r) => !!i.fixedId && !i.smsKey && i.type === (r.type || 'out') && i.amount === r.amount &&
  (i.date === r.date || (dayGap(i.date, r.date) <= 1 && sameName(i.memo, r.merchant)));
// 이미 가계부에 있는 같은 결제 (없으면 null)
const dupOf = (r) => items.find((i) => i.smsKey === smsKey(r) ||
  (i.type === (r.type || 'out') && i.amount === r.amount && nearMoment(i, r))) || items.find((i) => fixedLike(i, r)) || null;
const isDup = (r) => !!dupOf(r);
// 알림에서 만든 내역의 모양: 입출금은 계좌이체(수입이면 수입), 카드 결제는 카드 지출
const smsItem = (r, id) => ({
  id, type: r.type || 'out', amount: r.amount, category: r.category, pay: r.bank ? 'transfer' : 'card',
  date: r.date, time: r.time, memo: smsMemo(r), smsKey: smsKey(r),
});

let smsRows = [], smsSkipped = 0;
// 읽은 결과를 상태별로 분류한다: new(새 결제) / dup(이미 있음) / offset(승인과 취소가 서로 상쇄)
// / remove(취소 -> 이미 입력한 내역 삭제) / missing(취소인데 원래 결제가 없음)
function analyzeSms(text) {
  const parsed = splitSms(text).map(parseSms);
  smsRows = parsed.filter(Boolean).map((p) => ({ ...p, status: 'new', include: true, category: '' }));
  smsSkipped = parsed.length - smsRows.length;
  const when = (r) => `${r.date} ${r.time}`;
  const used = new Set();
  for (const c of smsRows.filter((r) => r.cancel)) {
    // 이미 가계부에 들어간 결제가 다시 온 알림(isDup)은 짝으로 삼지 않는다. 그래야 취소가 가계부의 그 결제를 지운다
    const mate = smsRows.find((r) => !r.cancel && !r.bank && !used.has(r) && r.amount === c.amount &&
      r.merchant === c.merchant && when(r) <= when(c) && !isDup(r));
    if (mate) { used.add(mate); mate.status = c.status = 'offset'; mate.include = c.include = false; continue; }
    const target = [...items].sort(byNewest).find((i) => i.type === 'out' && i.amount === c.amount &&
      (!c.merchant || stripInst(i.memo) === c.merchant) && i.date <= c.date);
    if (target) { c.status = 'remove'; c.target = target; }
    else { c.status = 'missing'; c.include = false; }
  }
  const seen = [];   // 같은 알림이 두 번 온 경우(갱신, 문자+카드 앱 알림)를 한 건만 반영하려고
  for (const r of smsRows) {
    if (r.status !== 'new') continue;
    r.category = guessCategory(r.merchant, r.type);
    const dup = dupOf(r);
    if (dup) { r.status = 'dup'; r.include = false; r.dupOf = dup; }
    else if (seen.some((s) => s.type === r.type && s.amount === r.amount && (smsKey(s) === smsKey(r) || nearMoment(s, r)))) {
      r.status = 'again'; r.include = false;
    }
    seen.push(r);
  }
  smsRows.sort((a, b) => when(a).localeCompare(when(b)));
}
