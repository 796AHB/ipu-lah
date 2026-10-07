# Widget Android (KWGT)

Pengekodan web **tak boleh** buat home screen widget sendiri — KWGT (Kustom HQ) yang
tunjuk data ni. App ni cuma menyediakan satu fail JSON yang KWGT tarik.

## 1. Fail data

`https://796ahb.github.io/ipu-lah/ipu.json`

Flat JSON, top-level key je, supaya KWGT boleh baca dengan JSONPath:

```json
{
  "name": "Kuala Lumpur", "lat": 3.139, "lon": 101.6869,
  "ipu": 186, "cat": "Tidak Sihat", "cat_idx": 2, "cat_color": "#f2c200",
  "dom": "PM2.5", "pm25": 133.5, "pm10": 139, "o3": 0,
  "temp": 24.3, "feels": 30.1, "humidity": 98, "rain_3h": 0,
  "updated": "2026-10-07T22:07:13.241Z", "updated_ms": 1791410833241
}
```

Fail ini auto dikemas kini dua kali sejam oleh GitHub Actions (`.github/workflows/ipu-feed.yml`).
Untuk tukar lokasi, edit `data/location.json` dan push — Workflow tu akan regenerate.

## 2. Setup KWGT

1. Install **KWGT** (Kustom HQ) dari Play Store.
2. Buka KWGT → tab **Widgets** (atau Preset) → letak satu Text layer.
3. Dalam property **Bitmap**, tukar ke **Formula**, lalu tampal:

```
$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .ipu)$
```

> URL mesti dalam **quotation marks**. Kalau tak, KWGT tunjuk `err: unknown`.

Formula lain:

||display | formula |
|---|---|
| IPU | `$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .ipu)$` |
| Kategori (BM) | `$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .cat)$` |
| Warna kategori | `$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .cat_color)$` |
| Suhu | `$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .temp)$` |
| Lembapan | `$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .humidity)$` |
| Nama tempat | `$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .name)$` |
| Punca utama | `$wg("https://796ahb.github.io/ipu-lah/ipu.json", json, .dom)$` |

Untuk warna, guna `.cat_color` terus dalam property **Color** (bukan Text), KWGT akan
isi warna kategori automatik — hijau kalau baik, kuning/oren/red ikut tahap jerebu.

## 3. Tips

- `$wg` cache response. Kalau nilai tak berubah, Cuba **Refresh** dalam KWGT, atau
  tambah `?t=` pada URL dengan `$df(yyyyMMddHHmm)$`:
  `$wg("https://796ahb.github.io/ipu-lah/ipu.json?t="+$df(yyyyMMddHHmm)$, json, .ipu)$`
- Live preview dalam KWGT reload automatik bila widget di-kemaskini pada Android.
- Widget **kena** repository public. Kalau tukar repo jadi private, `ipu.json` tak
  boleh ditarik lagi dan widget mati.

## Generate feed manually

```bash
node tools/gen-ipu.mjs          # tulis ipu.json untuk lokasi dalam data/location.json
node tools/gen-ipu.mjs my.json  # tulis ke fail lain
```