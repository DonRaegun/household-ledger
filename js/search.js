// 내역 검색 창: 전체 기간에서 찾는다 (찾는 규칙은 core.js의 searchItems)
const SEARCH_MAX = 300;   // 한 번에 보여 줄 최대 건수

function searchDay(date) {
  const li = document.createElement('li');
  li.className = 'day';
  const label = document.createElement('span');
  // 올해가 아니면 연도를 붙여서 어느 해의 내역인지 알 수 있게 한다
  label.textContent = (date.slice(0, 4) === String(new Date().getFullYear()) ? '' : `${date.slice(0, 4)}년 `) + dayLabel(date);
  li.appendChild(label);
  return li;
}

function renderSearch() {
  const q = $('q').value;
  const found = searchItems(items, q);
  const sum = (t) => found.filter((i) => i.type === t).reduce((s, i) => s + i.amount, 0);
  const out = sum('out'), inc = sum('in');
  $('q-sum').textContent = !q.trim() ? '가맹점, 카테고리, 금액, 날짜(예: 2026-11)로 전체 기간에서 찾아요.'
    : !found.length ? '찾는 내역이 없어요.'
    : `${found.length}건 · 지출 ${won(out)}${inc ? ` · 수입 ${won(inc)}` : ''}${found.length > SEARCH_MAX ? ` (최근 ${SEARCH_MAX}건만 보여요)` : ''}`;
  const list = $('q-list');
  list.innerHTML = '';
  let last = '';
  for (const i of found.slice(0, SEARCH_MAX)) {
    if (i.date !== last) { last = i.date; list.appendChild(searchDay(i.date)); }
    list.appendChild(itemEl(i));   // 눌러서 수정·삭제하면 저장 뒤 render()가 이 목록도 다시 그린다
  }
}

$('search-open').onclick = () => {
  $('q').value = '';
  renderSearch();
  $('qdlg').showModal();
  setTimeout(() => $('q').focus(), 60);
};
$('q').addEventListener('input', renderSearch);
$('q-close').onclick = () => $('qdlg').close();
