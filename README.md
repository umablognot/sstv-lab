# Ses / Fotoğraf

Merve için tarayıcıda çalışan Robot36 SSTV test arayüzü. Alıcı telefonda, gönderici bilgisayarda açılır. Fotoğraf dosyaları ve mikrofon PCM verisi ağ üzerinden gönderilmez; uygulama tamamen istemci tarafındadır.

## Kullanım

1. Telefonda HTTPS siteyi aç, Fotoğraf al > Mikrofonla dinlemeyi başlat.
2. Bilgisayarda aynı siteyi aç, Fotoğraf gönder > Fotoğraf seç (veya renk kartı).
3. Bilgisayar hoparlöründen sesi çal. Telefonu yaklaştır, iki sayfayı da ön planda tut.
4. Yaklaşık 37 saniyede 320 × 240 görüntü alınır. PNG olarak kaydedilebilir.

WAV dışa aktarımı: 16 kHz mono signed 16-bit little-endian PCM. ESP yazılımı WAV başlığını ayrıştırmalı ve belirtilen örnekleme hızını korumalıdır. Kart modeline uygun DAC/I2S veya filtrelenmiş PWM ses çıkışı ve hoparlör yükselteci ayrıca seçilmelidir. Bu depo ESP firmware içermez.

## Yerel çalışma

Node.js ile `npm run dev`; sunucu `http://127.0.0.1:5188` adresini sunar. Bilgisayardaki localhost mikrofon için güvenli bağlam sayılır. Telefon için HTTPS dağıtım adresi kullanılmalıdır. Derleme ve harici CDN gerektirmeyen statik ESM dosyaları `dist/` altında tutulur.

## İşleyiş ve sınırlar

- Robot36 modu sabittir; başka modlar otomatik algılanmaz.
- Web Audio AudioWorklet ile kesintisiz örnek alımı; ScriptProcessor yalnızca eski tarayıcılar için yedektir. AnalyserNode üzerinden tekrarlanan/kayıp ses kareleriyle çözüm yapılmaz.
- DSP ayrı Worker'da çalışır. Tonlar kompleks taban banda çevrilir, FIR filtreden geçirilir ve FM demodülasyonu yapılır.
- 150 ms satır aralığı, 1200 Hz senkronizasyonu ve renk ayraçları kullanılır. VIS ile birleşen ilk satır senkronizasyonu kontrol edilerek ilk çift kurtarılır. Son satır için sonraki senkronizasyon beklenmez.
- Eksik yayın başarı olarak raporlanmaz. Sinyal kaybında alıcı bir sonraki fotoğrafı öncekinin devamına eklemez; kullanıcı sıfırlamalıdır.
- Gürültü, yankı, hoparlör/mikrofon tepkisi, saat sapması ve işletim sistemi ses işlemesi kaliteyi etkiler. Gerçek iPhone/Android cihazla akustik deneme yapılmadı.
- Sayfa arka plana alınınca veya kapatılınca mikrofon/oynatma durur. Ekran uyanık tutma desteği varsa kullanılır.

## Doğrulama

`npm test`: 16/44.1/48 kHz Robot36 kodlama/çözme; sessizlik; eksik yayın; düşük ses + yapay yankı/gürültü. Sabit renklerin iç bölgelerinde renk hatası ölçülür. Bağımsız pySSTV 44.1 kHz kaydı mevcutsa ayrıca çözülür. Test çıktıları dağıtıma ve Git'e girmez.

`tools/test-browser.cjs`: Playwright ile masaüstü/mobil boyutu, indirme, başlat/durdur, izin reddi ve sahte mikrofon aygıtından gerçek Web Audio > Worklet > Worker > canvas akışı. WebMCP araç sözleşmesi test kaydıyla doğrulandı; yerel tarayıcıda yerleşik WebMCP bağlamı doğrulanmadı.

## Kaynaklar

DSP yardımcıları `smolgroot/sstv-decoder` içinden 0BSD lisansıyla uyarlandı (commit `ad3f3e0c69251336e5a15188c24e62121b9e2564`). Java Robot36 kökeni ve lisansı `dist/THIRD_PARTY.txt` içindedir. `tools/vendor.mjs` dönüştürme betiğidir; dağıtımda çalıştırılmaz.

Robot36 kodlayıcı zamanlamaları pySSTV `d998fad154d3e6ad2d73af5add49beec0d2ab59f` ile bağımsız kontrol edildi. Fotoğraf kodlayıcı ve kare birleştirici bu uygulama için yazıldı.
