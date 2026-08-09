# Эксплуатация и резервное копирование

## Первый запуск на сервере

1. Установить Docker Engine с Compose.
2. Скопировать `.env.example` в `.env`.
3. Заменить пароль PostgreSQL, пароль администратора и оба JWT-секрета.
   Пароль PostgreSQL в `DATABASE_URL` должен быть URL-кодирован, если содержит
   `@`, `:`, `/`, `#` или `%`.
4. Закрепить постоянный IPv4 сервера и указать `LAN_BIND_ADDRESS`, `LAN_SUBNET`
   и `CLIENT_ORIGIN`, например `192.168.1.20`, `192.168.1.0/24` и
   `http://192.168.1.20`.
5. Запустить:

   ```bash
   docker compose up -d --build
   docker compose ps
   ```

Контейнер backend при каждом старте сам применяет недостающие миграции и
идемпотентно проверяет роли/администратора. Frontend начинает принимать трафик
только после успешного healthcheck backend. На хосте публикуется только порт
frontend `LAN_BIND_ADDRESS:80`; PostgreSQL и backend остаются внутри Docker.
Healthcheck доступен через reverse proxy: `http://<сервер>/health`.

После запуска ограничьте Windows Firewall и выполните приёмочную проверку по
[инструкции LAN-развёртывания](LAN_DEPLOYMENT.md).

## Обновление

Перед обновлением сделать резервную копию, затем:

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
```

Не копировать в Git исходную папку `РЖД 2й этаж`: она содержит персональные
данные и исключена через `.gitignore`.

## Резервное копирование

Для Windows без Bash и Docker используйте отдельную
[инструкцию и PowerShell-скрипты](WINDOWS_BACKUP.md).

На машине с установленным `pg_dump`:

```bash
./scripts/backup.sh
```

Для Docker без локального PostgreSQL-клиента:

```bash
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "backups/workwear_erp_$(date +%Y%m%d_%H%M%S).dump"
```

Рекомендуемый регламент: ежедневная копия, хранение последних 30 дней и одна
месячная копия за пределами самого сервера. Периодически проверять
восстановление на отдельной тестовой БД.

## Восстановление

Операция перезаписывает текущую БД. Сначала остановить backend:

```bash
docker compose stop server
./scripts/restore.sh backups/<имя>.dump
docker compose start server
```

Если PostgreSQL-клиент доступен только в контейнере:

```bash
docker compose stop server
docker compose exec -T postgres sh -c \
  'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backups/<имя>.dump
docker compose start server
```

После восстановления проверить `/health`, вход администратора, остатки,
карточку работника и формирование одного отчёта.

## Проверка перед выпуском

```bash
pnpm db:verify-clean
pnpm test
pnpm lint
pnpm build
```

`db:verify-clean` создаёт отдельную временную схему, накатывает в неё все
миграции и сиды, проверяет таблицы, затем удаляет только эту временную схему.
Рабочие данные не изменяются.
