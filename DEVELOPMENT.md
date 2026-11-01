# Tiles Clash Planner — разработка

## Локальный запуск

Требуется Node.js 20+ и npm.

```bash
npm install
npm run dev:full
```

Frontend откроется на `http://127.0.0.1:4173`, API — на `http://127.0.0.1:8787`. Vite проксирует `/api` в backend. Данные совместной работы сохраняются в `server-data/database.json`; каталог исключён из Git и не должен публиковаться как статический файл.

Отдельный запуск:

```bash
npm run dev
npm run dev:server
```

## Проверки и сборка

```bash
npm run check
npm run test:e2e
npm run build
```

Сборка создаёт клиент в `dist` и backend-бандл в `dist-server/index.mjs`. Для production:

```bash
npm ci
npm run build
NODE_ENV=production PLANNER_STATIC_DIR=/opt/tiles-clash-planner/current/dist PLANNER_DATA_FILE=/var/lib/tiles-clash-planner/database.json node dist-server/index.mjs
```

Перед production-развёртыванием backend следует закрыть reverse proxy с HTTPS. Cookie сессии получает `Secure`, когда `NODE_ENV=production`.

Ежедневную резервную копию базы можно настроить таймером systemd. Установите `deploy/backup-database.example.sh` в каталог с правами пользователя `tilesclash` и задайте `PLANNER_BACKUP_DIR` на отдельный диск или защищённое хранилище.

## Архитектура

- `src/App.tsx`, `src/components/` — React-оболочка интерфейса.
- `src/planner-runtime.ts` — координация Konva, UI и локального состояния.
- `src/map-renderer.ts` — отрисовка карты Konva.
- `src/planner-store.ts`, `src/plans.ts`, `src/alliances.ts` — бизнес-операции.
- `src/persistence.ts` — валидация, миграции и localStorage.
- `src/collaboration-api.ts`, `src/collaboration-panel.ts` — frontend совместной работы.
- `server/` — аккаунты, роли, общие проекты, версии, SSE и короткие ссылки.
- `data/gene-clash-map.json` — каноническая карта.
- `data/game-config.json` — единый источник наград и эффективности территорий.
- `data/map-manifest.json` — контрольная сумма и размеры канонической карты.

React отвечает за оболочку и будущие компоненты. Konva остаётся императивным изолированным рендерером, поэтому миграцию интерфейса можно продолжать по частям.

## Роли

- `R5` — редактирование проекта и управление участниками.
- `R4` — редактирование, восстановление истории и создание публичной ссылки.
- `MEMBER` — только просмотр общего проекта.

Обновления передаются через Server-Sent Events. Сохранение использует номер базовой версии; конкурентная запись возвращает `409`, не перезаписывая чужие изменения.

## API

- `/api/auth/register`, `/login`, `/logout`, `/me`
- `/api/projects`
- `/api/projects/:id/state`
- `/api/projects/:id/events`
- `/api/projects/:id/history`
- `/api/projects/:id/members`
- `/api/projects/:id/share`
- `/api/public/:shareId`

Пароли хешируются `scrypt`, сессии хранятся только как SHA-256 хеши токенов, cookie — `HttpOnly` и `SameSite=Lax`.

## Карта и форматы

Карта содержит `territories`, `connections`, `bases` и `baseConnections`. Пользовательские планы не меняют статическую карту: статусы находятся в `Plan.territories`.

После изменения наград в `data/game-config.json` выполните `npm run sync:rewards`. Команда обновит значения всех 165 территорий; `npm run verify:rewards` проверяет их соответствие конфигурации. Геометрия и связи карты при этом не меняются.

Импортёры пишут результат в `data/generated/`. Замена канонической карты требует ручной проверки и обновления `data/map-manifest.json`. Команда `npm run verify:map` защищает карту от случайной перезаписи.

Формат сохранения версионируется через `STORAGE_VERSION` в `src/persistence.ts`. Новые поля необходимо добавлять в строгую проверку и покрывать миграционным тестом.
