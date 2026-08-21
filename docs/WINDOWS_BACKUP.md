# Резервное копирование на Windows

Скрипты релиза 16 работают в Windows PowerShell без Bash и без Docker:

- `scripts/backup.ps1` — ежедневная и месячная копия без ограничения срока хранения на ПК №1, ПК №2 и ПК №3;
- `scripts/verify-backup.ps1` — SHA-256, проверка архива и тестовое восстановление;
- `scripts/restore.ps1` — восстановление с подтверждением и страховочной копией;
- `scripts/install-backup-tasks.ps1` — регистрация заданий Планировщика Windows.

## Подготовка

На сервере должны быть установлены клиентские утилиты той же или более новой
основной версии PostgreSQL: `pg_dump.exe`, `pg_restore.exe`, `psql.exe`,
`createdb.exe` и `dropdb.exe`. Скрипты ищут их в `PATH`, затем в
`C:\Program Files\PostgreSQL\<версия>\bin`.

Заполните `.env`:

```dotenv
BACKUP_ROOT=D:\WorkwearBackups
BACKUP_SECONDARY_PATHS=\\PC2\workwear-erp;\\PC3\workwear-erp
BACKUP_TASK_USER=DOMAIN\workwear-backup
BACKUP_ADMIN_DATABASE_URL=postgres://workwear_backup_verify:CHANGE_ME@localhost:5432/postgres
```

Новый параметр `BACKUP_SECONDARY_PATHS` содержит ровно два разных UNC-пути
через точку с запятой. Старый `BACKUP_SECONDARY_PATH` поддерживается только для
обратной совместимости и означает один вторичный адресат.

Используйте UNC-путь, а не подключённый диск `Z:`: задания Планировщика не
видят пользовательские сетевые диски. Учётной записи задания нужны права
записи на сетевой каталог.

`BACKUP_ADMIN_DATABASE_URL` используется только для создания и удаления
временной проверочной БД. Рабочую БД копирует обычный пользователь из
`DATABASE_URL`. Для проверки можно создать отдельную роль с минимально нужным
атрибутом:

```sql
CREATE ROLE workwear_backup_verify LOGIN CREATEDB PASSWORD 'CHANGE_ME';
```

Не добавляйте эту роль в администраторы приложения и не записывайте `.env` в Git.

## Ручная проверка до установки расписания

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\backup.ps1 `
  -RequiredSecondaryCount 2 -NotifyOnFailure -ForceMonthly

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-backup.ps1 `
  -LatestMonthly -TestRestore
```

Успешная проверка означает, что:

1. размер и SHA-256 совпали с манифестом;
2. `pg_restore` прочитал структуру архива;
3. создана временная БД;
4. в ней совпали количества работников, экземпляров, документов и движений;
5. временная БД удалена.

## Расписание

Запустите PowerShell от имени администратора:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\install-backup-tasks.ps1
```

Будут созданы задания:

- `Workwear ERP Daily Backup` — ежедневно в 02:00;
- `Workwear ERP Monthly Restore Test` — ежедневная проверка срока в 03:00,
  фактическое восстановление только первого числа месяца.

Установщик запускает первое резервирование сразу после регистрации задания и
считает установку успешной только при записи на оба резервных ПК. По умолчанию
задания работают от `SYSTEM`. Для сетевых папок в домене выдайте право записи
учётной записи компьютера либо установите задания под отдельной служебной
учётной записью:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\install-backup-tasks.ps1 `
  -TaskUser 'DOMAIN\workwear-backup'
```

Установщик запросит пароль в системном окне Windows; пароль не печатается и не
хранится в файлах проекта. Задания будут запускаться без входа этого пользователя
в Windows. В недоменной сети `SYSTEM` обычно не имеет доступа к другим ПК,
поэтому нужна одинаковая отдельная служебная учётная запись с доступом к обеим
сетевым папкам. Её пароль хранится Планировщиком Windows, а не в `.env` или
аргументах задания.

Backup хранит все ежедневные и месячные копии бессрочно: автоматическое удаление
дампов отключено. Каждый комплект сначала копируется во временные файлы и
публикуется только после проверки SHA-256; повреждённый существующий комплект не
перезаписывается. Ошибка любого из двух адресатов даёт ненулевой код задания,
при этом успешная копия на другом ПК сохраняется. Логи старше 90 дней удаляются.
Ошибка также создаёт запись в `BACKUP_ROOT\logs` и, при `-NotifyOnFailure`,
сообщение активному пользователю.

После установки запустите каждое задание вручную и проверьте `Last Run Result = 0x0`.

## Ежемесячная ручная проверка печатной формы

Автоматическая проверка подтверждает целостность данных. Раз в месяц оставьте
временную БД для визуальной проверки:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify-backup.ps1 `
  -LatestMonthly -TestRestore -KeepTemporaryDatabase
```

Скрипт напечатает имя временной БД. Запустите отдельный тестовый экземпляр
backend с `DATABASE_URL`, указывающим на неё, откройте карточку работника и
сформируйте одну Excel/PDF-форму. Не подключайте рабочий frontend к временной
БД.

После проверки удалите временную БД:

```powershell
dropdb.exe --host=localhost --username=workwear_backup_verify --force <имя_временной_БД>
```

## Восстановление рабочей БД

Сначала остановите backend. Затем:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\restore.ps1 `
  -BackupFile D:\WorkwearBackups\daily\workwear_erp_YYYYMMDD_HHMMSS.dump
```

Перед изменением БД скрипт:

1. проверит хеш и структуру выбранной копии;
2. запросит подтверждение;
3. создаст страховочный backup в `BACKUP_ROOT\pre-restore`;
4. восстановит с `--clean --if-exists --exit-on-error`;
5. выведет контрольные количества.

Если backend установлен как Windows-служба, передайте её имя через
`-ApplicationServiceName`: скрипт остановит её и запустит после завершения.
После восстановления проверьте `/health`, вход, остатки, карточку работника и
одну печатную форму.
