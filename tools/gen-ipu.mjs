#!/usr/bin/env node
/* IPU Lah! widget feed generator.
 *
 * Reads data/location.json, queries Open-Meteo (CAMS air quality + forecast),
 * applies the same Malaysian Air Quality Index breakpoints as index.html/sw.js,
 * and writes a flat ipu.json that widget engines can parse with a JSONPath.
 *
 * Usage: node tools/gen-ipu.mjs [outfile]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, process.argv[2] || 'ipu.json');

const BP = {
  pm25: [[0, 0], [15, 50], [35, 100], [150, 200], [250, 300], [500, 500]],
  pm10: [[0, 0], [50, 50], [100, 100], [350, 200], [420, 300], [600, 500]],
  o3: [[0, 0], [100, 50], [180, 100], [400, 200], [800, 300], [1200, 500]],
  co: [[0, 0], [5, 50], [10, 100], [17, 200], [34, 300], [46, 500]],
  no2: [[0, 0], [140, 50], [280, 100], [1130, 200], [2260, 300], [3750, 500]],
  so2: [[0, 0], [125, 50], [250, 100], [800, 200], [1600, 300], [2620, 500]]
};

const CATS = [
  { max: 50, ms: 'Baik', en: 'Good', hex: '#2f6fde' },
  { max: 100, ms: 'Sederhana', en: 'Moderate', hex: '#22a45d' },
  { max: 200, ms: 'Tidak Sihat', en: 'Unhealthy', hex: '#f2c200' },
  { max: 300, ms: 'Sangat Tidak Sihat', en: 'Very unhealthy', hex: '#f08a1c' },
  { max: Infinity, ms: 'Berbahaya', en: 'Hazardous', hex: '#d7263d' }
];

const POL = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  o3: 'Ozon',
  co: 'CO',
  no2: 'NO2',
  so2: 'SO2'
};

function sub(key, c) {
  if (c == null || !Number.isFinite(c)) return null;
  const b = BP[key];
  for (let i = 1; i < b.length; i++) {
    if (c <= b[i][0]) {
      const [c0, i0] = b[i - 1];
      const [c1, i1] = b[i];
      return Math.round(i0 + ((c - c0) * (i1 - i0)) / (c1 - c0));
    }
  }
  const [c0, i0] = b[b.length - 2];
  const [c1, i1] = b[b.length - 1];
  return Math.round(i1 + ((c - c1) * (i1 - i0)) / (c1 - c0));
}

function mean(arr, end, n) {
  let s = 0;
  let k = 0;
  for (let i = Math.max(0, end - n + 1); i <= end; i++) {
    const v = arr?.[i];
    if (v != null) { s += v; k++; }
  }
  return k ? s / k : null;
}

const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'ipu-lah-feed (github pages)' } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.json();
}

const loc = JSON.parse(await readFile(resolve(ROOT, 'data/location.json'), 'utf8'));
if (loc.lat == null || loc.lon == null) throw new Error('data/location.json needs lat and lon');

const q = `latitude=${loc.lat}&longitude=${loc.lon}&timezone=auto`;

const [aq, wx] = await Promise.all([
  get(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&past_days=1&forecast_days=1`),
  get(`https://api.open-meteo.com/v1/forecast?${q}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code&hourly=precipitation_probability&forecast_days=2`)
]);

const h = aq.hourly;
const hour = aq.current?.time?.slice(0, 13) + ':00';
let i = h.time.indexOf(hour);
if (i < 0) i = h.time.length - 25;

const co = mean(h.carbon_monoxide, i, 8);
const conc = {
  pm25: mean(h.pm2_5, i, 24),
  pm10: mean(h.pm10, i, 24),
  o3: h.ozone?.[i],
  co: co == null ? null : co / 1000,
  no2: h.nitrogen_dioxide?.[i],
  so2: h.sulphur_dioxide?.[i]
};

const subs = {};
let dom = 'pm25';
let max = -1;
for (const k of Object.keys(conc)) {
  subs[k] = sub(k, conc[k]);
  if (subs[k] != null && subs[k] > max) { max = subs[k]; dom = k; }
}
const ipu = Math.max(0, max);
const catIdx = CATS.findIndex((c) => ipu <= c.max);
const cat = CATS[catIdx];

const wcur = wx.current || {};
const wxh = wx.hourly || {};
const wi = Math.max(0, (wxh.time || []).indexOf((wcur.time || '').slice(0, 13) + ':00'));
const rainNext3 = Math.max(0, ...(wxh.precipitation_probability || []).slice(wi, wi + 3).map((x) => x || 0));

const now = new Date();
const feed = {
  name: loc.name,
  lat: loc.lat,
  lon: loc.lon,
  ipu,
  cat: cat.ms,
  cat_en: cat.en,
  cat_idx: catIdx,
  cat_color: cat.hex,
  cat_hex: cat.hex.replace('#', ''),
  dom: POL[dom],
  dom_key: dom,
  pm25: round(conc.pm25),
  pm10: round(conc.pm10),
  o3: round(conc.o3),
  co: round(conc.co, 2),
  no2: round(conc.no2),
  so2: round(conc.so2),
  sub_pm25: subs.pm25,
  sub_pm10: subs.pm10,
  sub_o3: subs.o3,
  sub_co: subs.co,
  sub_no2: subs.no2,
  sub_so2: subs.so2,
  temp: round(wcur.temperature_2m),
  feels: round(wcur.apparent_temperature),
  humidity: round(wcur.relative_humidity_2m, 0),
  rain_now: round(wcur.precipitation),
  rain_3h: rainNext3,
  weather_code: wcur.weather_code ?? null,
  updated: now.toISOString(),
  updated_ms: now.getTime(),
  tz: aq.timezone || wx.timezone || 'auto',
  source: 'Open-Meteo / Copernicus CAMS'
};

await writeFile(OUT, JSON.stringify(feed, null, 2) + '\n', 'utf8');
console.log(`${OUT}: IPU ${ipu} (${cat.ms}) for ${loc.name} at ${feed.updated}`);