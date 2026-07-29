# ERP «Учёт спецодежды»

Корпоративная ERP-система учёта аренды спецодежды: закупка → оприходование →
склад → выдача → эксплуатация → возврат → стирка → ремонт → повторная выдача →
списание. Полное техническое задание — [PROJECT_SPECIFICATION.md](PROJECT_SPECIFICATION.md).

## Стек

- **Backend**: Node.js + Express 5, Sequelize 6 (PostgreSQL), JWT, Swagger/OpenAPI
- **Frontend**: React 19 (Feature-Sliced Design), Vite, React Query, Zustand, React Hook Form + Zod
- **Инфраструктура**: Docker Compose, pnpm workspaces

## Структура репозитория

```
server/           Backend (Express, Sequelize, REST API)
  src/
    config/       env, swagger, каталог прав (permissions.js)
    database/     sequelize, models, migrations, seeders
    middlewares/  auth, permissions, error handler
    modules/      по одному модулю на бизнес-сущность
                  (routes -> controller -> service -> repository)
    utils/
    tests/
client/           Frontend (React, Feature-Sliced Design)
  src/
    app/          провайдеры, роутинг, глобальные стили
    pages/        композиции страниц
    widgets/      составные UI-блоки (layout)
    features/     пользовательские сценарии (auth и т.д.)
    shared/       переиспользуемые api/ui/config/session
scripts/          backup.sh / restore.sh для PostgreSQL
docs/             архитектурные заметки
```

## Быстрый старт (локальная разработка)

Предполагается локально установленный PostgreSQL (либо Docker — см. ниже).

```bash
cp .env.example .env      # заполнить реальными значениями
pnpm install
pnpm db:migrate
pnpm db:seed               # создаёт роли, права и администратора
pnpm dev                   # backend :4000, frontend :5173
```

Вход: логин/пароль из `BOOTSTRAP_ADMIN_LOGIN` / `BOOTSTRAP_ADMIN_PASSWORD` в `.env`.

Swagger UI: http://localhost:4000/api-docs

## Запуск через Docker Compose (для сервера предприятия)

```bash
cp .env.example .env      # заполнить реальными значениями, включая секреты JWT
docker compose up -d --build
docker compose exec server node src/database/migrate.js up
docker compose exec server node src/database/seed.js
```

Frontend будет доступен на порту 80, backend — на 4000.

## Резервное копирование БД

```bash
./scripts/backup.sh [каталог]     # pg_dump -> backups/*.dump
./scripts/restore.sh файл.dump    # восстановление (перезаписывает БД!)
```

## Скрипты

| Команда | Назначение |
|---|---|
| `pnpm dev` | backend + frontend одновременно |
| `pnpm db:migrate` / `db:seed` | миграции и сид БД |
| `pnpm lint` / `format` | ESLint / Prettier по всему репозиторию |
| `pnpm test` | тесты backend (node:test + supertest) |
| `pnpm build` | продакшн-сборка |

## Роли и права (Этап 2)

Права хранятся как строки вида `модуль.действие` в
[server/src/config/permissions.js](server/src/config/permissions.js) — единый
каталог, который дополняется по мере реализации новых модулей. Предустановленные
роли: `admin`, `warehouse_manager`, `hr_manager`, `accountant`, `viewer`.

Авторизация — JWT: короткоживущий access-токен возвращается в теле ответа и
хранится на фронтенде только в памяти (Zustand), refresh-токен — в httpOnly
cookie с ротацией при каждом обновлении и отзывом при выходе.

## Справочники (Этап 3)

Организации, Подразделения, Должности, Склады, Поставщики, Размеры — все
шесть реализованы на общей фабрике CRUD с мягким удалением
([server/src/modules/catalogs/reference-crud.factory.js](server/src/modules/catalogs/reference-crud.factory.js))
и общей странице на фронтенде
([client/src/features/catalogs/ui/CatalogPage.jsx](client/src/features/catalogs/ui/CatalogPage.jsx)),
конфигурируемой per-сущность (колонки, поля формы, zod-схема). Подразделения
и Склады привязаны к Организации через `organizationId` с проверкой
существования при создании/правке.

## Номенклатура (Этап 4)

Иерархия Модель → Размер → Экземпляр (раздел 7 ТЗ). Модели номенклатуры —
обычный справочник (та же `CatalogPage`). Экземпляр — физическая единица
спецодежды: инвентарный номер и штрихкод генерируются автоматически
(последовательность `instance_inventory_number_seq`, формат `СО-000001`),
но могут быть заданы вручную (для переноса данных из бумажного учёта).
Статус (`in_stock/issued/laundry/repair/write_off`) отражает жизненный цикл
из раздела 1 ТЗ, состояние (`new/good/worn/damaged`) — физический износ,
независимая характеристика. Партии (`batches`) заведены на уровне БД (на них
уже ссылается экземпляр), но собственного CRUD пока нет — партия будет
создаваться документом "Поступление" на Этапе 5.

## Закупки и оприходование (Этап 5)

Документ "Поступление" (`server/src/modules/purchases/receiving/`): шапка
(поставщик, склад, дата, договор, накладная, ответственный — автоматически
текущий пользователь) + строки (модель, размер, количество, закупочная цена,
стоимость для работника, НДС). Пока черновик — шапка и строки редактируемы.

**Проведение** — необратимая операция в одной БД-транзакции с блокировкой
шапки документа (`SELECT ... FOR UPDATE`, без включения строк в тот же запрос
— Postgres не разрешает блокировку через LEFT JOIN, который иначе возник бы у
документа без строк): создаёт партию (`Batch`, код = номер документа),
экземпляры (по одному на единицу количества каждой строки, с автономером
`СО-NNNNNN`) и движения склада (`StockMovement`, `documentType: 'receiving'`,
`fromWarehouseId: null`). После проведения документ и его строки недоступны
для изменения.

`StockMovement` — общая инфраструктура движений склада для всех будущих
документов (Выдача, Возврат, Перемещение, Списание и т.д.), которую использует
уже этот, первый документ; `document_id` в ней намеренно без FK (тип документа
определяет, в какой таблице искать) — просмотр истории движений и агрегация
остатков будет отдельным разделом на Этапе 6.

Фронтенд — не `CatalogPage` (документы устроены иначе: шапка + строки +
необратимое проведение), а отдельные `ReceivingListPage`/`ReceivingEditorPage`,
переиспользующие вынесенный из `CatalogPage` компонент `EntityFormModal`
(форма-в-модалке на конфиге полей) — для шапки, для строки и для самого
справочника это одна и та же форма-обёртка.

## Склады: остатки и движения (Этап 6)

Остатки не хранятся отдельной таблицей — источник истины `Instance`
(`status='in_stock' AND archivedAt IS NULL`). Эндпоинт `GET /stock/balances`
(`server/src/modules/warehouses/stock/`) агрегирует экземпляры по
складу/модели/размеру (количество, суммарная стоимость) без Sequelize
`include` в самом запросе группировки — подписи склада/модели/размера
довешиваются отдельными запросами и мержатся в сервисе, чтобы не собирать
вручную полный список колонок для `GROUP BY` присоединённых таблиц.
`GET /stock/movements` — история из `StockMovement` (уже писалась
документом "Поступление" на Этапе 5), с фильтром по складу через `Op.or`
на `fromWarehouseId`/`toWarehouseId`.

Оба эндпоинта read-only (право `warehouse.view`, без `manage` — остатки
меняются только складскими документами, раздел 11 ТЗ). Фронтенд — два
отдельных отчёта (`StockBalancesPage`/`StockMovementsPage`), не
`CatalogPage` (агрегированные/исторические данные без CRUD).

## Статус реализации

- [x] Этап 1 — Архитектура проекта
- [x] Этап 2 — Авторизация и роли
- [x] Этап 3 — Справочники
- [x] Этап 4 — Номенклатура
- [x] Этап 5 — Закупки и оприходование
- [x] Этап 6 — Склады (остатки и история движений)
- [ ] Этап 7–14 — см. PROJECT_SPECIFICATION.md, раздел 17
