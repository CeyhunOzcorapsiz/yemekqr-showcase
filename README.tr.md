# YemekQR

Restoranlar için kasiyer onaylı sipariş, QR sipariş özeti ve tahsilat takibi.

## Güncel özellikler

- **Türkçe / English:** Tüm ekranlarda dil seçimi; kalıcı tercih, hata/durum mesajları, tarih/para gösterimi ve CSV başlıkları. Demo menü çevrilidir; özel ürün/kategoriler için İngilizce karşılık alanları vardır. İki dilde ürün adları fişte sipariş anındaki hâliyle saklanır.

- Manuel sipariş; ürün arama, kategori filtresi, miktar ve nakit/kart/bekleyen ödeme.
- Fiyat değişikliği kontrolü, pasif ürün koruması ve tekrar istekte çift kaydı önleyen işlem anahtarı.
- Ürün adı ve birim fiyatının sipariş anında saklandığı, müşteriye açık QR özeti.
- Sipariş geçmişi; tarih/fiş/durum filtresi, sayfalama, tahsilat, yönetici iptal ve kısmi/tam iade kaydı.
- Ürün ekleme/düzenleme/gizleme/yeniden açma.
- Personel oluşturma, yetki ve aktiflik; son yönetici koruması, oturum iptali.
- Türkiye gün sınırlarıyla tarih aralıklı rapor; sipariş toplamı, tahsilat, iade, net tahsilat, personel ve yöntem filtresi, CSV.
- Fotoğraf yükleme/kamera, Gemini analizi, kasiyer düzeltmesi ve ilk tahmin/son karar kayıtları.
- Kasa vardiyasında açılış, nakit hareketleri, sayım ve kapanış farkı; hesap şifresi değiştirme ve yönetici denetim geçmişi.
- HttpOnly oturum çerezi; restoran bazlı erişim; kritik işlemlerin denetim kayıtları.

Kart tahsilatı/iadesi, harici ödeme cihazında yapılan işlemin kaydıdır. Uygulama karttan para çekmez. QR çıktısı sipariş özetidir; mali belge entegrasyonu içermez.

## Yerel kurulum

Node **24.11 veya daha yeni 24.x**, Python **3.14** kullanın.

```sh
npm ci
npm run setup
npm run dev
```

Kurulum alt projelerin kilitli paketlerini kurar, yoksa rastgele anahtarlı bir backend ortam dosyası oluşturur ve migration'ları uygular. Var olan ortam dosyasını değiştirmez. Arayüz: http://localhost:5173; API: http://127.0.0.1:4000/api.

İsteğe bağlı örnek menü ve demo personel:

```sh
npm run seed --prefix backend
```

Giriş: `admin@demo.com` veya `kasiyer@demo.com`; parola `demo1234`. Seed tekrar çalıştırılabilir; mevcut ürün düzenlemelerini/parolaları sıfırlamaz. Production'da çalışmaz. Giriş sayfasındaki demo açıklaması yalnızca geliştirmede `DEMO_MODE=true` ile görünür.

## Kamera servisi

Manuel sipariş için kamera servisi gerekmez.

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r ml-service/requirements.lock.txt
npm run dev:ml
```

`ml-service/.env.example` dosyasını örnek alarak `ml-service/.env` oluşturun. Gerçek analiz için `GEMINI_API_KEY` ve `ML_MODE=gemini` gerekir. Anahtar yoksa servis rastgele sonuçlara geçmez; kamera kullanılamaz, manuel satış devam eder.

Yalnızca geliştirmede açıkça `ML_MODE=mock` seçilebilir. Mock görüntüyü tanımaz ve arayüzde uyarı verir. Gerçek ortamda kapalıdır. Görüntüler diskte saklanmaz. Kamera için HTTPS veya desteklenen localhost güvenli bağlamı gerekir; LAN üzerindeki düz HTTP'de dosya yükleme kullanılabilir.

Ayrıntılar: [kamera servisi](ml-service/README.md).

## Kontroller

```sh
npm run build
npm run lint
npm run check:format
npm test
npm run test:browser
```

Tarayıcı testleri Windows'ta kurulu Edge'i kullanır. Diğer ortamlarda önce `npx playwright install chromium` çalıştırın. `PLAYWRIGHT_CHANNEL` ile tarayıcı kanalı değiştirilebilir. Testler ayrı `test.db` ve `e2e.db` kullanır; geliştirme veritabanı silinmez. Tarayıcı testlerinde 4100 ve 8100 portları boş olmalı; kamera servisi yalnızca açık mock modunda başlatılır.

## Production

```sh
npm run build
npm start
```

Başlatma production ayarlarını doğrular; geliştirme izleyicisi veya yeniden derleme çalıştırmaz. Backend'de `DATABASE_URL`, rastgele en az 32 karakterli `JWT_SECRET` ve HTTPS `FRONTEND_URL` zorunludur. Örnek anahtarlar, demo modu ve demo veritabanı reddedilir. Production için demo verisinden ayrı bir veritabanı kullanın. Arayüz backend tarafından aynı origin'den sunulur; farklı origin gerekiyorsa `CORS_ORIGIN` açık liste olmalıdır. Yalnızca bilinen ters vekil adreslerini `TRUST_PROXY` ile belirtin.

Kamera için Python servisinde production ortamı, Gemini anahtarı ve en az 32 karakterli ortak `ML_SERVICE_TOKEN` gerekir; aynı token backend'e de verilir. Python'u iç ağda tutun. Bu sürüm tek backend süreci için tasarlanmıştır; giriş limitleri bellektedir. Birden fazla örnek için ortak limit deposu, veritabanı ve kapasite planı ayrıca gerekir.

Migration öncesi yedek alın. Eski e-postalarda normalizasyondan sonra çakışma varsa yeni migration güvenle başarısız olur; hesapları birleştirmez/silmez. Eski fiş adları mevcut ürün adıyla doldurulur; daha önce değişmiş bir ad geçmişten geri kazanılamaz. Geçmiş tahsilat verisi uydurulmaz; eski siparişler tahsilat raporunda otomatik ödenmiş sayılmaz.

## Sağlık ve yedekleme

- `GET /health`: süreç canlılığı.
- `GET /api/ready`: veritabanı erişimi.
- `GET /api/capabilities`: kameranın hazır olma durumu; kamera kesilince manuel satış kapanmaz.

```sh
npm run backup
python scripts/database.py restore --source .backups/YEDEK.db --target .backups/geri-yuklenen.db
python scripts/database.py check --source .backups/geri-yuklenen.db
```

Yedekleme SQLite backup API'siyle tutarlı kopya alır. Geri yükleme mevcut dosyanın üzerine yazmaz. Gerçek geri dönüşte uygulamayı durdurun, yeni dosyayı kontrol edin ve `DATABASE_URL` değerini bu dosyaya yönlendirin.

## Kapsam ve takip

Limitler: restoran başına 2000 ürün, sipariş başına 100 farklı ürün, satırda 1000 adet, ürün fiyatında 1.000.000 TL, sipariş toplamında 20.000.000 TL. Rapor aralığı en fazla 366 gün; AI özeti en fazla son 10.000 başarılı analizdir.

Gerçek Gemini doğruluğu, ödeme cihazı entegrasyonu, termal yazıcı donanımı ve gerçek restoran kapasitesi ayrıca sahada doğrulanmalıdır. Şube/stok/abonelik ve mali belge entegrasyonları bu sürümde yoktur.

[Gelecek yol haritası](ROADMAP.md)

