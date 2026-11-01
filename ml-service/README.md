# YemekQR kamera servisi

Python 3.14 üzerinde FastAPI + httpx. Menüdeki ürün kimliklerini kullanarak öneri döndürür. Görüntüler kaydedilmez.

## Kurulum ve çalıştırma

Proje kökünden:

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r ml-service/requirements.lock.txt
python -m uvicorn main:app --app-dir ml-service --host 127.0.0.1 --port 8000
```

`ml-service/.env` oluştururken `.env.example` dosyasını kullanın. `ML_MODE=gemini`, `GEMINI_API_KEY` ve gerektiğinde `GEMINI_MODEL` ayarlayın. Anahtar yoksa analiz 503 döner; rastgele sonuç üretilmez. Geliştirmede açıkça `ML_MODE=mock` seçilebilir.

Production: `APP_ENV=production` veya `NODE_ENV=production`; Gemini anahtarı ve en az 32 karakterli `ML_SERVICE_TOKEN` zorunlu. Mock yasak. Aynı servis tokenını backend'de ayarlayın. Servis iç ağda kalmalı; production'da `--reload` kullanmayın.

## Sözleşme

- `GET /health`: hazır olma, mod ve model.
- `POST /detect`: multipart `image` ve JSON `labels`.
- Başlık: yapılandırıldıysa `X-Service-Token`.
- Etiket: `{id: UUID, name: string}`; 1–2000 benzersiz ürün.
- Yanıt: `{mode, model, detections: [{id, confidence}]}`.
- Yalnızca JPEG/PNG/WebP; 8 MB dosya ve 20 milyon piksel sınırı.
- Multipart toplam boyutu dosya limitine ek en fazla 1 MB; gövde okunurken de sınırlanır.
- En fazla dört eşzamanlı analiz; dolulukta 429.
- Dış çağrı asenkron; toplam/bağlantı zaman aşımı var.
- Yanıt kimlikleri menüden olmalı, tekrar edemez; skor sonlu ve 0–1 arasında olmalı.

Modelin güven skoru ölçülmüş doğruluk değildir. Kasiyer ürünleri kontrol edip onaylar. Backend ilk tahmini, model/mod/süreyi ve siparişe dönüşen son kararı ilişkilendirir. Mock kayıtları gerçek analizlerden ayırt edilir.

## Test

```sh
python -m unittest discover -s ml-service/tests -v
```

Testler model sağlayıcısını çağırmaz; yetki, boyut, görüntü ve etiket doğrulaması, skor/kimlik kontrolü, açık mock seçimi ve analiz beklerken sağlık isteğinin yanıt vermesini kontrol eder.
