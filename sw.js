const CACHE_NAME = 'stm-cache-v1.68';
const ASSETS = [
  './index.html?v=1.68',
  './app.js?v=1.68',
  './style.css?v=1.68',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // skipWaiting()はここでは呼ばない
  // メインスレッドから「今すぐ更新」ボタンが押された後にSKIP_WAITINGメッセージで切り替える
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 通知クリック時の処理
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// メインスレッドからのメッセージを受信
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ネットワーク優先（失敗時のみキャッシュ）
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // 成功したらキャッシュも更新
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
