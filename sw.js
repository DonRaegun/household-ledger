const CACHE = 'ledger-v3';
const FILES = ['./', 'index.html', 'style.css', 'manifest.json', 'icon.svg',
  ...['core', 'store', 'holidays', 'sms', 'render', 'toast', 'fixed', 'settings', 'dialogs', 'ics', 'sms-ui', 'native', 'update', 'export', 'modal', 'main']
    .map((n) => `js/${n}.js`)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});
// 네트워크 우선, 실패하면 캐시 (코드 수정이 바로 반영되고 오프라인에서도 동작)
// no-cache: 브라우저 HTTP 캐시를 그대로 쓰지 않고 서버에 확인해서, html/js/css 버전이 섞이지 않게 한다
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      // 문자를 공유해서 열 때는 주소 뒤에 ?text=...가 붙으므로 그 부분은 무시하고 찾는다
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
