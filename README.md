# YemekQR

[Detailed Turkish setup and operations guide](README.tr.md)

A cashier-assisted restaurant ordering system with manual and camera ordering, public QR order summaries, cash/card payment records, order history, cancellations/refunds, menu/staff management and date-range reporting, cash-shift reconciliation, account password changes and an administrator audit history.

Stack: React/TypeScript/Vite, Express/Prisma/SQLite, Python/FastAPI/Gemini. Monetary values use integer kuruş. Orders preserve product names and prices. Idempotency keys prevent duplicate orders on retries. Sessions use revocable HttpOnly cookies.

The interface supports Turkish and English with a persistent language switcher on every screen. System messages, statuses, accessible labels, dates, currency formatting and CSV headings follow the selection. Custom menu items have editable English name/category fields; both receipt names are snapshotted. Currency remains TRY and business time remains Europe/Istanbul.

## Development

Requires Node 24.11+ within the 24.x line, and Python 3.14 for camera/testing.

```sh
npm ci
npm run setup
npm run dev
```

Open http://localhost:5173. Setup installs locked dependencies, generates a random local secret if no backend environment file exists, and deploys migrations. It preserves existing environment settings.

Optional demo data: `npm run seed --prefix backend`. Accounts: `admin@demo.com`, `kasiyer@demo.com`; password `demo1234`. Demo seed is disabled in production and preserves existing edits.

For image analysis, install `ml-service/requirements.lock.txt`, configure `ml-service/.env` from its example, and run `npm run dev:ml`. Gemini mode requires credentials; there is no silent mock fallback. Explicit development-only mock mode is available. Manual sales work without the image service.

## Verification

```sh
npm run build
npm run lint
npm run check:format
npm test
npm run test:browser
```

Browser tests use Edge on Windows; otherwise install Chromium with `npx playwright install chromium`. Tests use isolated databases and explicit mock inference. They do not call a paid model.

## Production and limits

Run `npm run build`, then `npm start`. Production requires a database URL, a random secret of at least 32 characters and an HTTPS frontend URL. The backend serves the built frontend on the same origin. Keep inference private and configure the shared service token. This release targets a single backend process.

Cash/card actions record payments completed outside this application. It does not charge cards or issue fiscal documents. Physical printer tests, live model accuracy and restaurant load require separate field validation.

Migration snapshots existing product names and leaves historical payments unknown. Email normalization collisions stop migration without deleting accounts. Back up before migrating.

Use `npm run backup` for consistent SQLite backups. Restore to a new file with `python scripts/database.py restore --source BACKUP.db --target NEW.db`; existing targets are never overwritten.

See [the roadmap](ROADMAP.md).
