/* IPU Lah! service worker: offline shell + background air-quality / rain alerts */
const SHELL_CACHE = 'ipulah-shell-v1';
const CFG_CACHE = 'ipulah-config';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL_CACHE && k !== CFG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API calls go straight to network
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(SHELL_CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

/* config from the page */
async function getCfg() { const c = await caches.open(CFG_CACHE); const r = await c.match('/__cfg'); return r ? r.json() : null; }
async function setCfg(cfg) { const c = await caches.open(CFG_CACHE); await c.put('/__cfg', new Response(JSON.stringify(cfg), { headers: { 'content-type': 'application/json' } })); }
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'config') e.waitUntil(getCfg().then(old => setCfg(Object.assign({}, old || {}, e.data.cfg))));
});

/* same IPU estimate as the page */
const BP = {
  pm25: [[0,0],[15,50],[35,100],[150,200],[250,300],[500,500]],
  pm10: [[0,0],[50,50],[100,100],[350,200],[420,300],[600,500]],
  o3: [[0,0],[100,50],[180,100],[400,200],[800,300],[1200,500]],
  co: [[0,0],[5,50],[10,100],[17,200],[34,300],[46,500]],
  no2: [[0,0],[140,50],[280,100],[1130,200],[2260,300],[3750,500]],
  so2: [[0,0],[125,50],[250,100],[800,200],[1600,300],[2620,500]]
};
function sub(k, c) {
  if (c == null || !isFinite(c)) return null; const b = BP[k];
  for (let i = 1; i < b.length; i++) if (c <= b[i][0]) { const [c0,i0] = b[i-1], [c1,i1] = b[i]; return Math.round(i0 + (c-c0)*(i1-i0)/(c1-c0)); }
  return 500;
}
function mean(a, end, n) { let s = 0, k = 0; for (let i = Math.max(0, end-n+1); i <= end; i++) if (a[i] != null) { s += a[i]; k++; } return k ? s/k : null; }
const CATS = [[50,'Baik'],[100,'Sederhana'],[200,'Tidak Sihat'],[300,'Sangat Tidak Sihat'],[Infinity,'Berbahaya']];
const catOf = v => CATS.findIndex(c => v <= c[0]);

async function check() {
  const cfg = await getCfg(); if (!cfg || !cfg.on || cfg.lat == null) return;
  const q = `latitude=${cfg.lat}&longitude=${cfg.lon}&timezone=auto`;
  const [aq, wx] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&current=pm2_5&past_days=1&forecast_days=1`).then(r => r.json()),
    fetch(`https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m&hourly=precipitation_probability&forecast_days=1`).then(r => r.json())
  ]);
  const h = aq.hourly, key = aq.current.time.slice(0,13) + ':00'; let i = h.time.indexOf(key); if (i < 0) i = h.time.length - 25;
  const co = mean(h.carbon_monoxide, i, 8);
  const subs = [sub('pm25', mean(h.pm2_5,i,24)), sub('pm10', mean(h.pm10,i,24)), sub('o3', h.ozone[i]), sub('co', co == null ? null : co/1000), sub('no2', h.nitrogen_dioxide[i]), sub('so2', h.sulphur_dioxide[i])];
  const ipu = Math.max(0, ...subs.filter(x => x != null)); const lvl = catOf(ipu);
  const opt = { icon: 'icon-192.png', badge: 'icon-192.png', renotify: true };
  const last = cfg.lastCat == null ? -1 : cfg.lastCat;
  if (ipu >= cfg.thr && last !== lvl) {
    await self.registration.showNotification(`IPU ${ipu}: ${CATS[lvl][1]}`, { ...opt, tag: 'ipu-alert', body: `${cfg.name || 'Lokasi you'}. Udara dah tak best, boss. Pakai mask kalau keluar.` });
    cfg.lastCat = lvl;
  } else if (ipu < cfg.thr && last >= 0) {
    await self.registration.showNotification(`Udara dah okay balik (IPU ${ipu})`, { ...opt, tag: 'ipu-alert', body: `${cfg.name || 'Lokasi you'}. Fuh, lega.` });
    cfg.lastCat = -1;
  }
  if (cfg.rain) {
    const wk = wx.current.time.slice(0,13) + ':00'; const wi = Math.max(0, wx.hourly.time.indexOf(wk));
    const p = Math.max(...wx.hourly.precipitation_probability.slice(wi, wi+3).map(x => x || 0));
    if (p >= 70 && Date.now() - (cfg.lastRain || 0) > 3*3600e3) {
      await self.registration.showNotification(`Hujan ${p}% dalam 2 jam`, { ...opt, tag: 'ipu-rain', body: `${cfg.name || 'Lokasi you'}. Bawak payung, angkat kain kat ampaian!` });
      cfg.lastRain = Date.now();
    }
  }
  await setCfg(cfg);
}
self.addEventListener('periodicsync', e => { if (e.tag === 'ipu-check') e.waitUntil(check().catch(() => {})); });

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
