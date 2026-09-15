# SSTV Lab — Fotoğrafı Ses Olarak Gönder

[![GitHub Pages yayını](https://github.com/altunsumerve/sstv-lab/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/altunsumerve/sstv-lab/actions/workflows/deploy-pages.yml)
[![Testler](https://github.com/altunsumerve/sstv-lab/actions/workflows/test.yml/badge.svg)](https://github.com/altunsumerve/sstv-lab/actions/workflows/test.yml)
[![Lisans: MIT](https://img.shields.io/badge/Lisans-MIT-informational.svg)](LICENSE)

**Demo adresi (Pages yayını sonrasında): [SSTV Lab’i aç](https://altunsumerve.github.io/sstv-lab/)**

*[English README](README.md)*

Bu proje, SSTV’yi daha önce hiç duymamış kişiler dahil herkesin bu teknolojiyi mümkün olan en
basit şekilde deneyimleyebilmesi için hazırlandı. Radyo veya elektronik bilgisi, özel donanım
ya da ücretli yazılım gerektirmeden; bir telefon, bir bilgisayar ve bu cihazların hoparlör ve
mikrofonlarıyla bir fotoğrafın ses üzerinden nasıl aktarılabildiğini keşfedebilirsin.

Tarayıcıda çalışan **Robot36 SSTV** kodlayıcı ve akustik çözücü. Bir cihaz fotoğrafı hoparlöründen
ses tonları olarak çalar; diğer cihaz mikrofonuyla dinler ve görüntüyü satır satır yeniden kurar.
İki cihaz arasındaki tek bağlantı havadır.

Uygulama kurulumu veya üyelik gerekmez. Sayfayı iki cihazda açıp hazır renk kartıyla başlayabilirsin;
alıcı mikrofonunu sesi çalan hoparlöre yakın tut.

> **Gizlilik:** fotoğraflar ve mikrofon PCM verisi cihazdan çıkmaz — kodlama da çözme de tarayıcıda
> yapılır. Resmî demoda, sayfa dosyalarına ek olarak ziyaret ve alım denemesi sayaçları için istek yapılır;
> aşağıdaki **Canlı sayaçlar** bölümüne bak.

---

## Ne yapıyor

| | |
|---|---|
| **Mod** | Robot36 (sabit — başka modlar otomatik algılanmaz) |
| **Çözünürlük** | 320 × 240, renkli |
| **Aktarım süresi** | Görüntü başına ~37 sn |
| **Ses bandı** | VIS 1100–1300 Hz; görüntü 1500–2300 Hz; senkronizasyon 1200 Hz |
| **Çözücü örnekleme hızı** | 16 kHz üzerindeki cihaz hızları 16 kHz’e indirilir |
| **Bağımlılık** | Yok. Derleme adımı yok, CDN yok, çalışma anında npm paketi yok |

---

## Nasıl kullanılır

**İki cihaz** gerekir — biri çalar, diğeri dinler. Bu arayüz aynı anda tek rol çalıştırır;
sesle aktarım deneyi için ikinci cihazı kullan.

1. **Telefonda:** canlı demoyu aç → *01 Fotoğraf al* → **Mikrofonla dinlemeyi başlat**, mikrofon
   iznini ver.
2. **Bilgisayarda:** aynı sayfayı aç → *02 Fotoğraf gönder* → **Fotoğraf seç** (fotoğraf seçmek
   istemiyorsan renk kartı düğmesine bas).
3. **Sesi çal**'a bas. Telefonu bilgisayarın hoparlörüne yaklaştır.
4. Görüntü ~37 saniyede oluşur. **PNG kaydet** ile kaydet.

**Gerçekten fark yaratan ipuçları:**

- İki sekmeyi de ön planda tut — tarayıcılar arka plandaki sekmelerin sesini askıya alır.
- Ses seviyesi orta olsun. Kırpılma (clipping) FM sapmasını bozar ve rengi mahveder.
- Bluetooth kulaklığı çıkar; codec'leri tonları bozuyor ve gecikme ekliyor.
- Ortam sessiz olsun. 1–2,5 kHz bandındaki konuşma ve müzik tam sinyalin üstüne biniyor.

---

## HTTPS neden şart

`getUserMedia()` (mikrofon erişimi) yalnızca **güvenli bağlamda** (secure context) çalışır:

- `https://…` — çalışır (GitHub Pages'in doğru tercih olmasının sebebi tam olarak bu)
- `http://127.0.0.1:5188` — çalışır (localhost güvenli sayılır)
- `http://192.168.x.x:5188` — **mikrofon engellenir**

Yani yerel ağda düz HTTP ile sayfayı önizleyip ses *gönderebilirsin*, ama telefonun *alıcı* olması
için gerçek HTTPS gerekir. Telefon denemelerinde yayınlanmış Pages adresini kullan.

---

## Canlı sayaçlar

Başlıkta iki sayı var; [countapi.mileshilliard.com](https://countapi.mileshilliard.com) tutuyor —
üyeliksiz ve API key'siz ücretsiz bir sayaç servisi:

| Sayaç | Neyle artıyor |
|---|---|
| **ZİYARETÇİ** | Bir tarayıcıdan gelen ilk ziyaret. `localStorage` işareti sayesinde sayfa yenilemeleri tekrar saymaz; yani sayfa açılışını değil tarayıcıyı sayar. |
| **ALIM DENEMESİ** | Mikrofonla dinlemenin başarıyla başlatıldığı her deneme. Yarım kalan, kesilen veya hiç satır oluşmayan denemeler de sayılır. Görüntünün tamamlanması ayrıca sayılmaz. |

Dinlemeyi durdurup yeniden başlatmak yeni deneme sayılır. Dinleme açıkken görüntüyü temizlemek
sayacı artırmaz. Mikrofon izni reddedilirse veya mikrofon başlatılamazsa sayılmaz. Bu sayı kişi
veya başarılı fotoğraf sayısı değil, deneme sayısıdır. Önceki tamamlanan fotoğraf sayacından ayrı
bir sayaç anahtarı kullanılır; geçmişte sayılmayan yarım denemeler geriye dönük getirilemez.

Uygulama sayaç anahtarını gönderir; fotoğraf, ses veya kullanıcı kimliği göndermez. İsteklere
çerezler ve sayfa yönlendirme bilgisi eklenmez. Ancak sayaç hizmeti, her web hizmeti gibi, isteğin
IP adresini ve olağan bağlantı bilgilerini görebilir.

Dürüst uyarılar:

- Sayaçlar kullanım hakkında yaklaşık bir fikir verir; doğrulanmış istatistikler değildir.
- Bu yaklaşık bir tarayıcı sayısıdır; benzersiz kişi sayısı değildir. Site verisini temizlemek,
  başka tarayıcı kullanmak, depolamayı engellemek veya eşzamanlı ilk ziyaretler tekrar sayılabilir.
- Sayaçlar yalnızca `https://altunsumerve.github.io/sstv-lab/` adresinde çalışır. Yerel önizleme,
  geçici HTTPS tünelleri ve çatallanmış depolar sayıları artırmaz. Kendi yayının için
  `dist/counter.js` içindeki adresi, yolu ve sayaç anahtarlarını değiştir.
- İstekler altı saniyede zaman aşımına uğrar. Ulaşılamayan sayaç boş kalır; ikisi de
  başarısızsa panel gizlenir.
  SSTV uygulaması hiçbir zaman sayacı beklemez ve sayaç yüzünden bozulmaz.
- Bu, kesintisiz çalışma garantisi olmayan harici bir servistir. SSTV deneyi bu servise bağlı değildir.

---

## Yerelde çalıştırma

```bash
git clone https://github.com/altunsumerve/sstv-lab.git
cd sstv-lab
npm run dev
```

`dist/` klasörünü `http://127.0.0.1:5188` adresinde sunar; ayrıca `0.0.0.0` üzerinden dinler ve
başka bir cihazdan açabilmen için tüm yerel ağ adreslerini terminale yazar. Windows güvenlik duvarı
özel ağda gelen TCP 5188 bağlantılarına izin vermeli.

Node.js 20+ gerekir; 22 veya daha yenisi önerilir. Çalışma zamanı bağımlılığı yoktur — `npm install` sadece Playwright
tarayıcı testi için gerekir.

---

## Testler

```bash
npm test              # DSP ve sayaç testleri, tarayıcı gerekmez
npm run test:acoustic # akustik bozulma taraması
npm run test:browser  # tam tarayıcı hattı (Playwright + :5188'de dev sunucu ister)
```

`npm test` bir renk kartı görüntüsünü kodlar ve **16 / 44,1 / 48 kHz**'de geri çözer, sonra şunları
doğrular:

- 240 satırın tamamı çözüldü mü,
- ortalama renk hatası eşiğin altında mı (renk kartı testinde tipik olarak < 1 / 255),
- yapay yankı ve gürültü eklenmiş kısık sinyal hâlâ çözülüyor mu (hata ≈ 4,5 / 255),
- sessizlikten görüntü **üretilmiyor** mu,
- yarım kalan aktarım "tamamlandı" diye **raporlanmıyor** mu.

`test-output/reference.wav` varsa — [pySSTV](https://github.com/dnet/pySSTV) ile üretilmiş bir kayıt —
o da çözülür. Bu, çözücünün sadece kendi kodlayıcımızla değil, bağımsız bir kodlayıcıyla da
uyuştuğunun kanıtıdır.

`npm run test:browser` gerçek sayfayı Playwright ile sahte mikrofon aygıtı üzerinden sürer: masaüstü
ve mobil boyut, WAV indirme, başlat/durdur, izin reddi ve tam Web Audio → AudioWorklet → Worker →
canvas akışı. Önce Playwright'ı kur:

```bash
npm install
npx playwright install chromium
npm test
# İkinci terminalde npm run dev açıkken:
npm run test:browser
```

Test çıktıları `test-output/` altına düşer, bu klasör Git'e girmez.

---

## Nasıl çalışıyor

**Kodlayıcı** (`dist/encoder.js`) — fotoğraf 320 × 240 bir canvas'a çizilir, YUV'a çevrilir ve
Robot36 ton dizisine dönüştürülür: önce VIS başlığı, sonra her satır için 1200 Hz senkronizasyon
darbesi, bir parlaklık (luminance) taraması ve dönüşümlü R−Y / B−Y renk bilgisi. Robot36 rengi
dikeyde yarı hızda gönderir; 320 × 240'ın 37 saniyeye sığmasının sebebi budur.

**Çözücü** (`dist/receiver.js` + `dist/vendor/`) — arayüzün işini azaltmak için ayrı bir Worker’da çalışır:

1. `capture-worklet.js` mikrofondan audio thread üzerinde kesintisiz örnek blokları alır.
   `ScriptProcessor` yalnızca eski tarayıcılar için yedektir. `AnalyserNode` bilerek **kullanılmıyor**
   — kare düşürüp tekrarlıyor, bu da satır zamanlamasını sessizce bozuyor.
2. `resampler.js` 16 kHz üzerindeki cihaz hızlarını kesintisiz bir filtreyle 16 kHz’e indirir.
3. Tonlar kompleks taban banda kaydırılır, FIR filtreden geçirilir ve **FM demodülasyonu** yapılır —
   anlık frekans, pikselin değeridir.
4. Alıcı, Robot36 VIS kodunu ve eşlik bitini doğrular; ardından 150 ms satır saatini izler.
   Senkronizasyon darbeleri saat kaymasını düzeltir. Kaçırılan bir darbe veya bozulan renk ayracı
   satır silinmesine ya da renk kanallarının karışmasına yol açmaz. Uzun kesintiden sonra
   yeni ve geçerli bir başlık, yeni görüntüyü başlatır.

Son satır, kendisinden sonraki senkronizasyon darbesi beklenmeden yazılır — beklenseydi her görüntü
bir satır eksik biterdi.

---

## Dosya yapısı

```
dist/                    statik site — GitHub Pages'in yayınladığı klasör tam olarak burası
  index.html             iki sekmeli arayüz (al / gönder)
  about.html             SSTV'nin sade dille anlatımı
  app.js                 arayüz, mikrofon yaşam döngüsü, wake lock, WebMCP araç kaydı
  encoder.js             Robot36 kodlayıcı + WAV yazıcı
  receiver.js            çözücü durum makinesi ve görüntü birleştirme
  resampler.js           herhangi bir örnekleme hızından 16 kHz'e
  capture-worklet.js     AudioWorklet mikrofon yakalama
  decode-worker.js       alıcıyı saran Worker
  counter.js             ziyaret / alım denemesi sayaçları (çevrimdışıyken sessizce kapanır)
  style.css
  vendor/                smolgroot/sstv-decoder'dan uyarlanan DSP (0BSD)
  THIRD_PARTY.txt
serve.mjs                bağımlılıksız statik geliştirme sunucusu
tools/                   test betikleri (siteye dahil edilmez)
.github/workflows/       CI ve Pages yayını
```

---

## Yayınlama

`main` dalına gönderim, DSP, sayaç ve akustik testlerini çalıştırır; geçerlerse `dist/`
GitHub Pages’e yayınlanır. Depoya yalnızca `dist/` değil, `.github/workflows/` dahil tüm kaynak
dosyalarını yükle.

Yeni repoda tek seferlik ayar: **Settings → Pages → Source → GitHub Actions**.

Sitedeki tüm yollar göreli (relative) olduğu için `/sstv-lab/` alt yolunda hiçbir değişiklik
gerekmeden çalışır. `dist/.nojekyll` dosyası Jekyll'in dosyalara dokunmasını engeller.

---

## Sınırlar — issue açmadan önce oku

- **Sadece Robot36.** Scottie, Martin ve PD modları ne uygulandı ne de otomatik algılanıyor.
- **Gerçek ortam koşulları sonucu etkiler.** Oda akustiği, hoparlör kalitesi, saat sapması ve
  işletim sistemi seviyesindeki AGC / gürültü bastırma sonuca etki eder. Gürültülü bir oda ya da
  kırpan bir hoparlör satır kaybına veya renk hatasına yol açar.
- **Devam ettirme yok.** Uzun kesintiden sonra sesi baştan çal. Yeni bir geçerli başlık,
  yarım görüntüye eklemek yerine yeni bir görüntü başlatır.
- **Yarım kalan aktarım asla başarı olarak raporlanmaz.** Bu bilinçli bir tercih.
- Sayfa arka plana alınınca veya kapanınca mikrofon ve oynatma durur. Tarayıcı destekliyorsa Screen
  Wake Lock kullanılır.

---

## Kaynaklar

- DSP yardımcıları [smolgroot/sstv-decoder](https://github.com/smolgroot/sstv-decoder) projesinden
  (commit `ad3f3e0c`) 0BSD lisansıyla uyarlandı; o da
  [xdsopl/robot36](https://github.com/xdsopl/robot36) kökenli. Tam lisans metni
  [`dist/THIRD_PARTY.txt`](dist/THIRD_PARTY.txt) içinde. `tools/vendor.mjs` dönüştürme betiğidir,
  çalışma anında hiç çalıştırılmaz.
- Robot36 kodlayıcı zamanlamaları [pySSTV](https://github.com/dnet/pySSTV) (commit `d998fad1`) ile
  bağımsız olarak doğrulandı.
- Fotoğraf kodlayıcı ve kare birleştirici bu proje için yazıldı.

## Lisans

MIT — bkz. [LICENSE](LICENSE). Uyarlanan DSP kodu 0BSD altında kalır.
