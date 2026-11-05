// 실행: npm test  (node --test tests/)
// 모든 문자·알림 예시는 가짜 값이다. 실제 카드번호, 이름, 가맹점을 넣지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

const app = loadApp();
const parse = (text) => app.ctx.parseSms(text);
const stamp = (t) => `[알림 2026-11-03 ${t}]\n`;   // 안드로이드 앱이 알림 앞에 붙이는 도착 시각 줄

// 한 번 분석해서 상태·가맹점·시각을 한 줄 문자열로
function analyze(text, items = []) {
  app.setItems(items);
  app.ctx.analyzeSms(text);
  // smsRows는 let이라 vm 안에서 읽고, 배열은 vm 바깥 것으로 옮겨 담아야 deepEqual이 맞다
  return Array.from(app.run('smsRows')).map((r) => `${r.status}:${r.merchant}:${r.time}`);
}

test('카드 승인: 우리카드 형식', () => {
  const r = parse(stamp('11:21') + '● 우리카드 이용안내\n우리승인\n12,300원 일시불\n11/03 11:20\n테스트철도공사');
  assert.deepEqual([r.type, r.amount, r.merchant, r.date, r.time, r.cancel, r.bank], ['out', 12300, '테스트철도공사', '2026-11-03', '11:20', false, undefined]);
  assert.equal(r.whenFromText, true);
});

test('카드 승인: 금액이 먼저이고 승인시각이 아래에 있는 형식', () => {
  const r = parse(stamp('06:43') + 'KB국민체크\n승인\n3,000원\n테스트상점B\n승시각 11/03 06:42'.replace('승시각', '승인시각'));
  assert.deepEqual([r.amount, r.merchant, r.time], [3000, '테스트상점B', '06:42']);
});

test('카드 앱 알림: 누적 금액은 금액으로 읽지 않는다', () => {
  const r = parse(stamp('11:21') + '승인내역\n[일시불.승인]11/03 11:20\n12,300원 / 누적:319,974원\n테스트철도공사');
  assert.deepEqual([r.amount, r.merchant, r.time], [12300, '테스트철도공사', '11:20']);
});

test('카드 앱 알림: 제목의 금액 + "카드 | 가맹점(일시불)" 본문 형식', () => {
  const r = parse(stamp('16:32') + '32,420원 결제\n테스트카드 | 테스트몰(테스트페이)(일시불)');
  assert.deepEqual([r.type, r.amount, r.merchant, r.inst, r.time], ['out', 32420, '테스트몰(테스트페이)', 0, '16:32']);
  const t = parse(stamp('16:32') + '8,000원 결제\n테스트카드 | 테스트상점(3개월)');
  assert.deepEqual([t.amount, t.merchant, t.inst], [8000, '테스트상점', 3]);
});

test('입출금: 제목의 금액 + "이름 → 입출금통장" 본문 형식', () => {
  const inn = parse(stamp('09:14') + '입금 30,000원\n테스트인 → 입출금통장(1234)\n잔액 152,327원');
  assert.deepEqual([inn.type, inn.bank, inn.amount, inn.merchant, inn.time], ['in', true, 30000, '테스트인', '09:14']);
  const out = parse(stamp('09:20') + '출금 12,000원\n입출금통장(1234) → 테스트상점\n잔액 140,327원');
  assert.deepEqual([out.type, out.amount, out.merchant], ['out', 12000, '테스트상점']);
});

test('입출금통장이라는 말만 있고 입금·출금 표시가 없으면 읽지 않는다', () => {
  assert.equal(parse(stamp('09:14') + '테스트인 → 입출금통장\n잔액 152,327원'), null);
});

test('카드 취소는 cancel로 읽는다', () => {
  const r = parse(stamp('12:00') + '우리카드 승인취소\n5,000원\n11/03 11:59\n테스트카페');
  assert.equal(r.cancel, true);
  assert.equal(r.amount, 5000);
});

test('입출금: 여러 줄 입금 (계좌번호 줄, 잔액 줄)', () => {
  const r = parse(stamp('09:00') + '[KB]11/03 08:59\n123-**-456789\n김테스트\n입금\n50,000원\n잔액 1,234,567원');
  assert.deepEqual([r.type, r.bank, r.amount, r.merchant, r.time, r.review], ['in', true, 50000, '김테스트', '08:59', false]);
});

test('입출금: 한 줄 출금', () => {
  const r = parse(stamp('09:47') + '[출금] 네이버페이충전 20,000원 11/03 09:46');
  assert.deepEqual([r.type, r.amount, r.merchant, r.time], ['out', 20000, '네이버페이충전', '09:46']);
});

test('입출금: 잔액이 같은 줄에 붙어 있어도 가맹점을 읽는다', () => {
  const r = parse(stamp('09:47') + '[출금] 신한 테스트카페 4,500원 11/03 09:46 잔액 100,000원');
  assert.deepEqual([r.amount, r.merchant], [4500, '테스트카페']);
});

test('입출금: 금액 뒤의 글(급여)을 상대방으로 쓴다', () => {
  const r = parse(stamp('10:01') + '[Web발신]\nKB국민은행 11/03 10:00 입금 1,500,000원 급여\n잔액 2,000,000원');
  assert.deepEqual([r.type, r.amount, r.merchant], ['in', 1500000, '급여']);
});

test('입출금: 잔액 숫자를 금액으로 읽지 않는다', () => {
  const r = parse(stamp('09:10') + '입금 50,000원\n잔액 9,999,999원\n홍테스트');
  assert.equal(r.amount, 50000);
});

test('입출금: 상대방이 없으면 입금/출금으로 적는다', () => {
  const r = parse(stamp('09:10') + '[출금] 20,000원 11/03 09:09');
  assert.equal(r.merchant, '출금');
});

test('입출금: "입출금통장"의 출금을 방향으로 읽지 않는다', () => {
  const r = parse(stamp('09:10') + '입출금통장 입금 300,000원\n홍테스트');
  assert.equal(r.type, 'in');
});

test('입출금: 카드대금 출금은 확인 대상(review)이다', () => {
  const r = parse(stamp('09:10') + '카드대금 출금 450,000원\n잔액 300,000원');
  assert.equal(r.review, true);
});

test('입출금: 입금취소·정정·오류는 읽지 않는다', () => {
  assert.equal(parse(stamp('09:10') + '입금취소 50,000원'), null);
  assert.equal(parse(stamp('09:10') + '출금 정정 50,000원 잔액 1,000원'), null);
});

test('결제와 무관한 글은 읽지 않는다', () => {
  assert.equal(parse(stamp('09:10') + '(광고) 쿠폰이 도착했어요 10,000원 할인'), null);
});

test('연도 추정: 아직 오지 않은 날짜는 작년으로 본다', () => {
  const r = parse('[Web발신]\n우리승인\n1,000원 일시불\n12/20 10:00\n테스트상점');
  assert.equal(r.date, '2025-12-20');
});

// ---- 중복 판정 ----
const have = (extra) => ({ id: 1, type: 'out', amount: 12300, category: '교통', pay: 'card', date: '2026-11-03', time: '11:20', memo: '테스트철도공사', smsKey: 'k', ...extra });
const card = (t, amt = '12,300원') => stamp(t) + `승인내역\n[일시불.승인]11/03 ${t}\n${amt} / 누적:1원\n테스트철도공사`;

test('중복: 이미 있는 같은 시각의 결제', () => {
  assert.deepEqual(analyze(card('11:20'), [have()]), ['dup:테스트철도공사:11:20']);
});
test('중복: 1분·2분 차이는 같은 결제, 3분은 별개', () => {
  assert.equal(analyze(card('11:21'), [have()])[0].split(':')[0], 'dup');
  assert.equal(analyze(card('11:22'), [have()])[0].split(':')[0], 'dup');
  assert.equal(analyze(card('11:23'), [have()])[0].split(':')[0], 'new');
});
test('중복: 금액이 다르면 별개', () => {
  assert.equal(analyze(card('11:20', '3,000원'), [have()])[0].split(':')[0], 'new');
});
test('중복: 수입과 지출은 서로 중복이 아니다', () => {
  const t = stamp('11:20') + '[입금] 테스트철도공사 12,300원 11/03 11:20';
  assert.equal(analyze(t, [have()])[0].split(':')[0], 'new');
});
test('중복: 한꺼번에 쌓인 문자+앱 알림(1분 차이)은 한 건만', () => {
  const sms = stamp('11:20') + '[Web발신] ● 우리카드 이용안내\n우리승인\n12,300원 일시불\n11/03 11:20\n테스트철도공사';
  const out = analyze(sms + '\n' + card('11:21'));
  assert.deepEqual(out.map((s) => s.split(':')[0]), ['new', 'again']);
});
test('중복: 다른 금액을 같은 분에 결제하면 둘 다 새 내역', () => {
  const t = stamp('11:20') + '우리승인\n12,300원 일시불\n11/03 11:20\n테스트철도공사\n' + stamp('11:20') + '우리승인\n3,000원 일시불\n11/03 11:20\n테스트편의점';
  assert.deepEqual(analyze(t).map((s) => s.split(':')[0]), ['new', 'new']);
});

// ---- 취소 ----
test('취소: 가계부에 있는 결제를 지우도록 표시한다', () => {
  const t = stamp('12:00') + '우리카드 승인취소\n12,300원\n11/03 11:59\n테스트철도공사';
  assert.equal(analyze(t, [have({ time: '11:20' })])[0].split(':')[0], 'remove');
});
test('취소: 같은 묶음 안의 승인과 취소는 서로 상쇄한다', () => {
  const ok = stamp('11:20') + '우리승인\n12,300원 일시불\n11/03 11:20\n테스트철도공사';
  const cancel = stamp('11:30') + '우리카드 승인취소\n12,300원\n11/03 11:29\n테스트철도공사';
  assert.deepEqual(analyze(ok + '\n' + cancel).map((s) => s.split(':')[0]).sort(), ['offset', 'offset']);
});
test('취소: 원결제가 없으면 missing', () => {
  const t = stamp('12:00') + '우리카드 승인취소\n99,000원\n11/03 11:59\n테스트상점';
  assert.equal(analyze(t)[0].split(':')[0], 'missing');
});

// ---- 고정지출과의 중복 ----
const fixedItem = (extra) => ({ id: 2, type: 'out', amount: 4900, category: '문화/여가', pay: 'card', date: '2026-11-01', memo: '넷플릭스', fixedId: 'f1', ...extra });
const bank = (day, merchant) => `[알림 2026-11-0${day} 09:10]\n[출금] ${merchant} 4,900원 11/0${day} 09:10`;
test('고정지출: 같은 날 같은 금액이면 이름이 달라도 같은 결제', () => {
  assert.equal(analyze(bank(1, 'NETFLIX.COM'), [fixedItem()])[0].split(':')[0], 'dup');
});
test('고정지출: 하루 차이는 이름이 닮을 때만', () => {
  assert.equal(analyze(bank(2, 'NETFLIX.COM'), [fixedItem()])[0].split(':')[0], 'new');
  assert.equal(analyze(bank(2, '넷플릭스코리아'), [fixedItem()])[0].split(':')[0], 'dup');
});
test('고정지출: 이미 알림과 합쳐진 내역(smsKey 있음)은 고정지출로 다시 합치지 않는다', () => {
  const linked = fixedItem({ smsKey: 'x', time: '09:10' });
  const other = '[알림 2026-11-01 15:00]\n[출금] 다른가게 4,900원 11/01 15:00';   // 같은 금액이지만 다른 시각의 별개 결제
  assert.equal(analyze(other, [linked])[0].split(':')[0], 'new');
  assert.equal(analyze(bank(1, '넷플릭스'), [linked])[0].split(':')[0], 'dup');     // 같은 시각이면 시각 기준으로 중복
});

// ---- 공휴일 ----
const holiday = (d) => app.run(`holidayName('${d}')`);
test('공휴일: 고정 날짜', () => {
  assert.equal(holiday('2026-01-01'), '신정');
  assert.equal(holiday('2026-06-06'), '현충일');
  assert.equal(holiday('2026-12-25'), '성탄절');
});
test('공휴일: 음력 (설날·추석·부처님오신날)', () => {
  assert.equal(holiday('2026-02-17'), '설날');
  assert.equal(holiday('2026-09-25'), '추석');
  assert.equal(holiday('2026-05-24'), '부처님오신날');
  assert.equal(holiday('2025-01-29'), '설날');
  assert.equal(holiday('2024-09-17'), '추석');
});
test('공휴일: 대체공휴일 (주말과 겹칠 때)', () => {
  assert.equal(holiday('2026-03-02'), '대체공휴일(삼일절)');
  assert.equal(holiday('2026-05-25'), '대체공휴일(부처님오신날)');
  assert.equal(holiday('2026-08-17'), '대체공휴일(광복절)');
  assert.equal(holiday('2026-10-05'), '대체공휴일(개천절)');
  assert.equal(holiday('2025-03-03'), '대체공휴일(삼일절)');
  assert.equal(holiday('2024-02-12'), '대체공휴일(설날)');
  assert.equal(holiday('2024-05-06'), '대체공휴일(어린이날)');
});
test('공휴일: 어린이날과 부처님오신날이 겹치면 다음 평일이 대체', () => {
  assert.equal(holiday('2025-05-05'), '어린이날');
  assert.equal(holiday('2025-05-06'), '대체공휴일(부처님오신날)');
});
test('공휴일: 추석 연휴의 일요일 겹침', () => {
  assert.equal(holiday('2025-10-08'), '대체공휴일(추석)');
});
test('공휴일: 임시공휴일·선거일 표', () => {
  assert.equal(holiday('2025-01-27'), '임시공휴일');
  assert.equal(holiday('2026-06-03'), '지방선거일');
});
test('공휴일: 평범한 날은 비어 있다', () => {
  assert.equal(holiday('2026-11-03'), '');
  assert.equal(holiday('2026-03-03'), '');
});
test('공휴일: 2026년에는 대체공휴일 포함 정확히 이 날들이다', () => {
  const days = app.run('[...holidaysOf(2026).keys()].sort().join(" ")');
  assert.equal(days, [
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25',
    '2026-06-03', '2026-06-06', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05',
    '2026-10-09', '2026-12-25',
  ].join(' '));
});

test('통계 비교: 지난 달 전체와 비교 (이미 끝난 달)', () => {
  const list = [
    { type: 'out', amount: 100, date: '2020-02-03' }, { type: 'out', amount: 50, date: '2020-02-28' },
    { type: 'in', amount: 999, date: '2020-02-10' },      // 수입은 더하지 않는다
    { type: 'out', amount: 7, date: '2020-01-30' },        // 다른 달
  ];
  const r = app.ctx.previousSpending(list, new Date(2020, 2, 1), false);
  assert.deepEqual([r.prev, r.running], [150, false]);
});

test('통계 비교: 진행 중인 달은 지난달의 같은 날짜까지만 더한다', () => {
  // 시계가 2026-11-03으로 고정되어 있다: 10월은 3일까지만
  const list = [
    { type: 'out', amount: 100, date: '2026-10-02' }, { type: 'out', amount: 40, date: '2026-10-03' },
    { type: 'out', amount: 500, date: '2026-10-20' },
  ];
  const r = app.ctx.previousSpending(list, new Date(2026, 10, 1), false);
  assert.deepEqual([r.prev, r.running], [140, true]);
});

test('통계 비교: 연별은 작년과 비교하고, 진행 중인 해는 같은 날짜까지만', () => {
  const list = [
    { type: 'out', amount: 10, date: '2025-01-05' }, { type: 'out', amount: 20, date: '2025-11-03' },
    { type: 'out', amount: 300, date: '2025-11-04' }, { type: 'out', amount: 400, date: '2024-03-01' },
  ];
  const now = app.ctx.previousSpending(list, new Date(2026, 5, 1), true);
  assert.deepEqual([now.prev, now.running], [30, true]);
  const past = app.ctx.previousSpending(list, new Date(2025, 5, 1), true);
  assert.deepEqual([past.prev, past.running], [400, false]);
});

test('통계 비교: 카테고리별 지난 기간 합계', () => {
  const list = [
    { type: 'out', amount: 100, category: '식비', date: '2020-02-03' }, { type: 'out', amount: 50, category: '식비', date: '2020-02-20' },
    { type: 'out', amount: 70, category: '카페', date: '2020-02-10' }, { type: 'in', amount: 999, category: '급여', date: '2020-02-10' },
    { type: 'out', amount: 5, category: '식비', date: '2020-01-30' },
  ];
  assert.deepEqual({ ...app.ctx.previousByCategory(list, new Date(2020, 2, 1), false) }, { 식비: 150, 카페: 70 });
});

test('내역 검색: 낱말이 모두 들어 있는 내역만, 최신순', () => {
  const list = [
    { id: 1, type: 'out', amount: 4500, category: '카페', memo: '테스트카페', pay: 'card', date: '2026-11-02' },
    { id: 2, type: 'out', amount: 12000, category: '식비', memo: '테스트식당', pay: 'cash', date: '2026-11-03' },
    { id: 3, type: 'out', amount: 4500, category: '카페', memo: '테스트카페', pay: 'card', date: '2025-05-10' },
    { id: 4, type: 'in', amount: 100000, category: '용돈', memo: '용돈', date: '2026-11-01' },
  ];
  const ids = (q) => Array.from(app.ctx.searchItems(list, q), (i) => i.id);   // vm 안의 배열은 바깥 배열과 구조가 같아도 달라서 옮겨 담는다
  assert.deepEqual(ids('테스트카페'), [1, 3]);                 // 최신순
  assert.deepEqual(ids('카페 2025'), [3]);                    // 낱말은 모두 맞아야 한다
  assert.deepEqual(ids('4,500원'), [1, 3]);                   // 금액은 쉼표·원을 붙여도 찾는다
  assert.deepEqual(ids('12000'), [2]);
  assert.deepEqual(ids('2026-11-0'), [2, 1, 4]);              // 날짜 일부로도 찾는다
  assert.deepEqual(ids('수입'), [4]);
  assert.deepEqual(ids('현금'), [2]);                         // 결제수단
  assert.deepEqual(ids('   '), []);                           // 빈 검색어는 아무것도 보여 주지 않는다
  assert.deepEqual(ids('없는말'), []);
});
