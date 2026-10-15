const CACHE_NAME = 'clock-app-v1.0.0';

// 相対パスでリソースを指定し、GitHub Pagesのサブディレクトリ配信に対応
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

// インストール処理：全必須静的アセットをプリキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting(); // 新バージョンを直ちに有効化
    })
  );
});

// アクティベーション処理：古いキャッシュのパージ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // すべての開いているタブを即座に制御下に置く
    })
  );
});

// リクエスト捕捉：Cache-First戦略（オフライン最優先）
self.addEventListener('fetch', (event) => {
  // GETリクエストのみキャッシュハンドリングを行う
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // 有効なレスポンスであれば動的にキャッシュに追加
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // オフラインかつキャッシュにない場合のフォールバック（HTMLを返す）
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});