# SSTV Lab — Fotoğrafı Sese Dönüştür

[![Deploy to GitHub Pages](https://github.com/altunsumerve/sstv-lab/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/altunsumerve/sstv-lab/actions/workflows/deploy-pages.yml)
[![Tests](https://github.com/altunsumerve/sstv-lab/actions/workflows/test.yml/badge.svg)](https://github.com/altunsumerve/sstv-lab/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
![i18n](https://img.shields.io/badge/i18n-7%20dil-c7fb67)
![Offline](https://img.shields.io/badge/PWA-çevrimdışı--hazır-c7fb67)

**Demo adresi (Pages dağıtımından sonra): [SSTV Lab'i aç](https://altunsumerve.github.io/sstv-lab/)**

*[English README](README.md)*

Bu proje, radyo ya da elektronik bilgisi gerektirmeden herkesin SSTV'yi en basit hâlâ deneyebilmesi
için oluşturuldu. Bir telefon, bir bilgisayar ve bunların dahili hoparlör ile mikrofonu yeterlidir.
Fotoğraf, ses dalgaları hâlinde havadan gönderilir; karşı cihaz mikrofonuyla dinleyip görüntüyü
satır satır yeniden kurar. Tarayıcıda çalışan bir **Robot36 SSTV** kodlayıcısı ve akustik
çözücüdür. v2 ile birlikte aktarım artık yalnızca sesle sınırlı değil: QR kod akışı, Bluetooth LE
bağlantısı ve NFC dokunuşu da tamamen çevrimdışı çalışır.

Uygulama kurulumu veya hesap gerekmez. Sayfayı iki cihazda açın, dahili renk kartıyla başlayın.
PWA olarak yüklerseniz yedi dil dahil her şey **internetsiz** çalışır.

> **Gizlilik:** fotoğraflar ve mikrofon sesi cihazdan asla çıkmaz — kodlama ve çözme tamamen
> tarayıcıda olur. Resmî demoda ayrıca ziyaretçi ve deneme sayaçları güncellenir; ayrıntı için
> **Canlı sayaçlar** bölümüne bakın.

---

## v2.0'da neler yeni

| Alan | Eklenenler |
|---|---|
| **Çok dilli arayüz** | Tam gettext i18n: **Türkçe, İngilizce, Almanca, İspanyolca, Fransızca, Arapça (sağdan sola), Basitleştirilmiş Çince**. Standart `.po` kaynak + derlenmiş `.mo` kataloglar, sıfır bağımlılıklı çalışma zamanı (`i18n.js`), başlıkta dil seçici, `?lang=` parametresi, ziyaretçi bazlı kalıcılık. |
| **Çevrimdışı çalışma** | Kurulabilir PWA (`manifest.webmanifest` + `sw.js`): ilk açılışta uygulamanın tamamı, tüm dillerin katalogları ve satıcı kodu önbelleğe alınır. Sonrasında ağ tamamen kapalıyken çalışır. Başlıkta çevrimiçi/çevrimdışı göstergesi. |
| **QR kod kanalı** | Fotoğraf, **dahili saf-JS QR kodlayıcıyla** (`features/qr.js`, jsQR ile gidiş-dönüş testli) ardışık QR kodlarına bölünür. Karşı cihaz kamerasıyla dahili **jsQR** üzerinden okur. Sessiz, mikrofonsuz, tamamen çevrimdışı. |
| **Bluetooth kanalı** | İki Web Bluetooth cihazı arasında **Bluetooth LE (Nordic UART)** ile fotoğraf aktarımı; ayrıca **ses çıkışı seçimi** (`selectAudioOutput` / `setSinkId`) ile akustik aktarımı Bluetooth hoparlöre yönlendirme. |
| **NFC kanalı** | **Web NFC eşleştirme**: etiket yazın ya da iki telefonu değdirin — karşı telefon uygulaması doğru rolle (alıcı/gönderici) açılır. |
| **Ses testi** | Gerçek aktarımdan önce hoparlör yolunu doğrulamak için tek dokunuşla 1500 → 1900 → 2300 Hz kalibrasyon tonları. |
| **Masaüstü ve tablet** | Mobil öncelikli duyarlı tasarım; gerçek tablet (≥720 px) ve masaüstü (≥1080 px) kırılımları, hover durumları, klavye kısayolları (`1`/`2`/`3` sekmeler, `L` dinle, `Boşluk` gönder), fotoğraf için sürükle-bırak ve panodan yapıştırma, kamera ile çekim (`capture="environment"`). |
| **Modern arayüz** | Yenilenen koyu tema: degrade başlık, segment sekmeler, kanal kartları, animasyonlu tarama çizgisi, tabular rakamlar, RTL desteği, `prefers-reduced-motion` uyumu, belirgin odak halkaları. |
| **Araç zinciri** | `tools/msgfmt.mjs` — gettext kurmadan çalışan saf-Node `.po` → `.mo` derleyicisi. `tools/pocheck.mjs` — çevirmenler için anahtar tutarlılık denetimi. Yeni testler: QR gidiş-dönüş, msgfmt gidiş-dönüş, i18n bütünlüğü. |

---

## Gerçekte ne yapar

| | |
|---|---|
| **Mod** | Robot36 (sabit — diğer modlar otomatik algılanmaz) |
| **Çözünürlük** | 320 × 240, renkli |
| **Aktarım süresi** | Görüntü başına ~37 sn (akustik yol) |
| **Ses bandı** | VIS 1100–1300 Hz; görüntü 1500–2300 Hz; senk 1200 Hz |
| **Çözücü örnekleme hızı** | 16 kHz üzeri cihaz hızları 16 kHz'e yeniden örneklenir |
| **Diller** | tr · en · de · es · fr · ar (RTL) · zh-CN |
| **Aktarım kanalları** | Ses (akustik) · QR kod akışı · Bluetooth LE (NUS) · NFC eşleştirme |
| **Bağımlılıklar** | Çalışma zamanında yok. Derleme adımı, CDN, çalıştırmada npm paketi yok |

### Kanal destek tablosu

| Kanal | Gönderen gerekli | Alan gerekli | Çevrimdışı |
|---|---|---|---|
| Ses | Ses çıkarabilen her tarayıcı | Mikrofonlu + güvenli bağlam her tarayıcı | ✔ |
| QR kod | Herhangi bir tarayıcı (dahili kodlayıcı) | Kamera + jsQR (güncel her tarayıcı) | ✔ |
| Bluetooth | Chrome / Edge (masaüstü veya Android) | Nordic UART cihazıyla Chrome / Edge | ✔ |
| NFC | Android'de Chrome | Android'de Chrome (veya NDEF okuyabilen telefon) | ✔ |

---

## Kullanım

İki cihaz gerekir — biri çalar, biri dinler. Bu arayüz aynı anda tek rol çalıştırır; akustik
deney için ikinci cihazı kullanın.

1. **Telefonda:** canlı demoyu aç → *01 Fotoğraf al* → **Mikrofonla dinlemeyi başlat**,
   mikrofon iznine izin ver.
2. **Bilgisayarda:** aynı sayfayı aç → *02 Fotoğraf gönder* → **Fotoğraf seç** (ya da fotoğraf
   seçmek istemiyorsanız renk kartı düğmesine basın). Dilerseniz fotoğrafı sürükleyip bırakabilir
   veya panodan yapıştırabilirsiniz.
3. **Sesi çal** düğmesine basın. Telefonu bilgisayar hoparlörüne yaklaştırın.
4. Görüntünün ~37 saniyede oluşmasını izleyin. **PNG kaydet** ile saklayın.

**İkinci cihaz yok mu?** *03 Kanallar* → **QR kod ile aktarım**: renk kartı (veya seçtiğiniz
fotoğraf) QR kodları olarak akıtılır; başka bir kamerayla okutun — ya da alıcıyı aynı tablette
bölünmüş pencerede çalıştırın.

**Çevrimdışı kullanım için yükleme:** Chrome/Edge'te (masaüstü veya Android) sayfayı açın →
başlıktaki **Uygulamayı yükle** düğmesi ya da tarayıcı menüsü → *Ana ekrana ekle*. Artık uygulama
Wi-Fi/mobil veri tamamen kapalıyken açılır ve çalışır.

**Gerçekten işe yarayan ipuçları:**

- İki sekmeyi de ön planda tutun — tarayıcılar arka plan sekmelerinde sesi askıya alır.
- Orta ses seviyesi. Bozulma FM sapmasını bozar, renkleri mahveder.
- *Akustik* yol için Bluetooth kulaklıkları çıkarın; kodekleri tonları bozar. (*Çalmayı* Bluetooth
  hoparlöre yönlendirmek için bunun yerine *03 Kanallar*'daki çıkış seçimini kullanın.)
- Sessiz oda. 1–2,5 kHz bandındaki konuşma ve müzik, sinyalin tam üstüne düşer.
- QR akışı: 20–40 cm mesafe, sabit el, kare başına varsayılan ~400 ms (ayarlanabilir).

---

## Diller ve çeviriler (`.po` / `.mo`)

Arayüz standart GNU gettext katalogları olarak gelir:

```
dist/locales/
  tr/LC_MESSAGES/messages.po   ← kaynak dizgiler (referans küme)
  tr/LC_MESSAGES/messages.mo   ← derlenmiş, tarayıcının yüklediği
  en/… de/… es/… fr/… ar/… zh-CN/…
```

- Dizgiler `.po` dosyalarında; tarayıcı derlenmiş `.mo` dosyasını yükler.
- Düzenledikten sonra yeniden derleyin (gettext kurulumu gerekmez):

  ```bash
  npm run build:i18n     # node tools/msgfmt.mjs — tüm diller için .po → .mo
  npm run check:i18n     # node tools/pocheck.mjs — anahtar tutarlılık denetimi
  ```

- **Dil eklemek için:** `dist/locales/en/LC_MESSAGES/messages.po` dosyasını
  `dist/locales/<kod>/LC_MESSAGES/messages.po` olarak kopyalayın, `msgstr` değerlerini çevirin ve
  `npm run build:i18n` çalıştırın. Ardından kodu `dist/i18n.js` içindeki `SUPPORTED_LANGUAGES`
  listesine, `dist/index.html` içindeki `<select>` alanına ve önbelleğe alınması için
  `dist/sw.js` içindeki `LANGUAGES` dizisine ekleyin. Sağdan sola diller için yalnızca
  `i18n.js` içindeki `RTL_LANGUAGES` listesine eklemek yeterli.
- Dil seçim sırası: `?lang=` URL parametresi → ziyaretçinin önceki seçimi → tarayıcı dilleri →
  İngilizce yedek. `<html lang>` / `dir` öznitelikleri otomatik güncellenir.

---

## Çevrimdışı çalışır (PWA)

- `manifest.webmanifest`; simgeleri (maskable dahil), tema renklerini ve Al/Gönder kısayollarını tanımlar.
- `sw.js` ilk ziyarette uygulamanın tamamını önbelleğe alır: sayfalar, stiller, DSP kodu, QR
  kodlayıcı, jsQR, simgeler ve **yedi dilin derlenmiş katalogları**.
- Strateji: aynı kaynaklı GET'ler için arka planda tazelemeli cache-first; gezinmeler önbellekteki
  `index.html`e düşer; harici sayaç API'si aynen geçer ve çevrimdışında sessizce susar.
- HTTPS üzerinden sunun (GitHub Pages idealdir). Yerel geliştirme için `http://127.0.0.1` de çalışır.

---

## HTTPS neden önemli

`getUserMedia()` (mikrofon erişimi) yalnızca **güvenli bağlamda** çalışır:

- `https://…` — çalışır (bu yüzden GitHub Pages doğru barındırıcıdır)
- `http://127.0.0.1:5188` — çalışır (localhost güvenli sayılır)
- `http://192.168.x.x:5188` — **mikrofon engellenir**

Yani yerel ağda sayfayı önizleyebilir ve düz HTTP ile *ses gönderebilirsiniz*, ancak telefon
yalnızca gerçek HTTPS ile *alım* yapabilir. Telefon testleri için dağıtılmış Pages adresini kullanın.

---

## Canlı sayaçlar

Başlıktaki iki sayı yalnızca resmî demoda [countapi](https://countapi.mileshilliard.com) tarafından
tutulur. Yaklaşık tarayıcı sayısı ve alım denemesidir; benzersiz kişi sayısı değildir. Çevrimdışında
sessizce gizlenir ve yerel önizlemelerde ya da fork'larda asla artmaz.

---

## Geliştirme

```bash
npm run dev            # http://127.0.0.1:5188 üzerinde statik sunucu
npm test               # DSP gidiş-dönüş + kare testleri + QR gidiş-dönüş + msgfmt
                       # gidiş-dönüş + i18n bütünlüğü + pocheck + sayaç testleri
npm run test:acoustic  # kodla → WAV → akustik çözme benzetimi
npm run test:browser   # Playwright uçtan uca (önce `npx playwright install`)
```

Proje düzeni:

```
dist/                     ← uygulamanın tamamı (Pages'e olduğu gibi dağıtılır)
  app.js                  ← arayüz bağlantıları, alıcı/gönderici durum makineleri
  i18n.js                 ← sıfır bağımlılıklı gettext çalışma zamanı (.mo ayrıştırıcı)
  encoder.js              ← Robot36 kodlayıcı + WAV yazıcı
  receiver.js / resampler.js / capture-worklet.js / decode-worker.js
  vendor/                 ← fm-demodulator, sync-detector, jsQR
  features/               ← qr.js (QR kodlayıcı), qr-transfer.js,
                            bluetooth.js, nfc.js, audioio.js
  locales/                ← tr, en, de, es, fr, ar, zh-CN için .po + .mo
  manifest.webmanifest, sw.js, icons/
tools/                    ← testler + msgfmt.mjs + pocheck.mjs
docs/                     ← GITHUB_ISSUE.md, CHANGELOG.md
```

### Test öne çıkanları

- `tools/test-qr.mjs`, üretilen her QR matrisini piksellendirip satıcı jsQR ile geri çözer —
  kodlayıcı bağımsız bir çözücüye karşı doğrulanır; kapasite tabloları (`v1-L = 17 B …
  v40-L = 2953 B`) ve parçalı `SQ` çerçevelemesi dahil.
- `tools/test-msgfmt.mjs`, yedi katalog için `.po → .mo → ayrıştırma` gidiş-dönüşü yapar.
- `tools/test-i18n.mjs`, 152 uygulama anahtarı × 7 dili, her yerde aynı `{rows}`, `{percent}` …
  yer tutucularıyla doğrular.
- `tools/test-browser.cjs`, sahte mikrofon olarak kayıtlı bir WAV ile gerçek Chromium'u akustik
  hattın başından sonuna kadar sürer; dilleri değiştirir, QR kareleri akıtır ve sıfır sayfa hatası
  doğrular.

---

## Güvenlik ve gizlilik notları

- Fotoğraflar ve mikrofon PCM'i asla yüklenmez; yukarıda açıklanan isteğe bağlı sayaç istekleri
  dışında analitik yoktur.
- Service worker yalnızca aynı kaynaklı yanıtları önbelleğe alır.
- Web Bluetooth istekleri Nordic UART servisi yayınlayan cihazlarla sınırlıdır; Web NFC yalnızca
  bu uygulamanın kendi davet kayıtlarını yazar/okur.
- `test-output/` (bk. sabitler, ekran görüntüleri) yerelde üretilir ve git'e eklenmez.

---

## Lisans

MIT — bkz. [LICENSE](LICENSE). Üçüncü taraf kodlar [dist/THIRD_PARTY.txt](dist/THIRD_PARTY.txt)
içinde belgelenir: sstv-decoder uyarlaması (0BSD), jsQR (MIT), Nayuki QR-Code-generator'ından
uyarlanan QR kapasite tabloları (MIT).
