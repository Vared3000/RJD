// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Релиз В (docs/TZ_NEXT_RELEASES_2026-08-19.md) — фильтры по региону/
// статусу и сортировка на экране /employees и в печатной форме
// employees-list должны давать одинаковую выборку.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';

async function loginAsAdmin(agent) {
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ login: env.BOOTSTRAP_ADMIN_LOGIN, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  return res.body.data.accessToken;
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

test('работники: фильтры по региону/статусу, сортировка и печатная форма списка (Релиз В)', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test EmpList ${Date.now()}`;

  const state = {
    organizationId: null,
    dpoAId: null,
    dpoBId: null,
    positionId: null,
    employeeIds: [],
  };
  t.after(async () => {
    if (state.employeeIds.length > 0) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    if (state.positionId) await models.Position.destroy({ where: { id: state.positionId } });
    if (state.dpoAId || state.dpoBId) {
      await models.Dpo.destroy({ where: { id: [state.dpoAId, state.dpoBId].filter(Boolean) } });
    }
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const regionA = `${unique} Регион А`;
  const regionB = `${unique} Регион Б`;

  const dpoA = await auth(agent.post('/api/v1/dpo')).send({
    name: `${unique} ДПО А`,
    fullName: `${unique} ДПО А — полное наименование`,
    region: regionA,
  });
  assert.equal(dpoA.status, 201);
  state.dpoAId = dpoA.body.data.id;

  const dpoB = await auth(agent.post('/api/v1/dpo')).send({
    name: `${unique} ДПО Б`,
    fullName: `${unique} ДПО Б — полное наименование`,
    region: regionB,
  });
  assert.equal(dpoB.status, 201);
  state.dpoBId = dpoB.body.data.id;

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  state.organizationId = org.body.data.id;

  const position = await auth(agent.post('/api/v1/positions')).send({ name: unique });
  state.positionId = position.body.data.id;

  async function createEmployee(spec) {
    const res = await auth(agent.post('/api/v1/employees')).send({
      organizationId: state.organizationId,
      positionId: spec.positionId ?? state.positionId,
      dpoId: spec.dpoId,
      fullName: spec.fullName,
      personnelNumber: spec.personnelNumber,
      hireDate: '2020-01-01',
      terminationDate: spec.terminationDate,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    state.employeeIds.push(res.body.data.id);
    return res.body.data;
  }

  const empIvanov = await createEmployee({
    dpoId: state.dpoAId,
    fullName: `${unique} Иванов`,
    personnelNumber: `TEL-${Date.now()}-1`,
  });
  const empPetrov = await createEmployee({
    dpoId: state.dpoAId,
    fullName: `${unique} Петров`,
    personnelNumber: `TEL-${Date.now()}-2`,
    terminationDate: '2020-06-01',
  });
  const empSidorov = await createEmployee({
    dpoId: state.dpoBId,
    fullName: `${unique} Сидоров`,
    personnelNumber: `TEL-${Date.now()}-3`,
  });
  const empYakovlev = await createEmployee({
    dpoId: undefined,
    positionId: null,
    fullName: `${unique} Яковлев`,
    personnelNumber: undefined,
  });
  const empArchived = await createEmployee({
    dpoId: state.dpoAId,
    fullName: `${unique} Архивный`,
    personnelNumber: `TEL-${Date.now()}-4`,
  });
  const archiveRes = await auth(agent.delete(`/api/v1/employees/${empArchived.id}`));
  assert.equal(archiveRes.status, 200);

  // --- Фильтр по региону: только dpoA, архивный по умолчанию не виден ---
  const byRegion = await auth(agent.get('/api/v1/employees')).query({ region: regionA });
  assert.deepEqual(
    new Set(byRegion.body.data.map((e) => e.id)),
    new Set([empIvanov.id, empPetrov.id]),
  );

  // --- Фильтр по статусу (в пределах dpoA, чтобы не задеть реальные данные) ---
  const archivedOnly = await auth(agent.get('/api/v1/employees')).query({
    dpoId: state.dpoAId,
    status: 'archived',
  });
  assert.deepEqual(
    archivedOnly.body.data.map((e) => e.id),
    [empArchived.id],
  );

  const terminatedOnly = await auth(agent.get('/api/v1/employees')).query({
    dpoId: state.dpoAId,
    status: 'terminated',
  });
  assert.deepEqual(
    terminatedOnly.body.data.map((e) => e.id),
    [empPetrov.id],
  );

  const activeOnlyDpoA = await auth(agent.get('/api/v1/employees')).query({
    dpoId: state.dpoAId,
    status: 'active',
  });
  assert.deepEqual(
    activeOnlyDpoA.body.data.map((e) => e.id),
    [empIvanov.id],
  );

  // --- Регрессия: статус "Активен" (внутренний OR по terminationDate) не
  // должен конфликтовать с OR поиска по ФИО/табельному (addOrGroup) ---
  const activeSearch = await auth(agent.get('/api/v1/employees')).query({
    search: unique,
    status: 'active',
  });
  assert.deepEqual(
    new Set(activeSearch.body.data.map((e) => e.id)),
    new Set([empIvanov.id, empSidorov.id, empYakovlev.id]),
  );

  // --- Сортировка по умолчанию: Регион -> ДПО -> ФИО (архивный скрыт) ---
  const defaultOrder = await auth(agent.get('/api/v1/employees')).query({ search: unique });
  assert.deepEqual(
    defaultOrder.body.data.map((e) => e.id),
    [empIvanov.id, empPetrov.id, empSidorov.id, empYakovlev.id],
  );

  // --- Явная сортировка по ФИО, DESC ---
  const byFullNameDesc = await auth(agent.get('/api/v1/employees')).query({
    search: unique,
    sort: 'fullName',
    order: 'DESC',
  });
  assert.deepEqual(
    byFullNameDesc.body.data.map((e) => e.id),
    [empYakovlev.id, empSidorov.id, empPetrov.id, empIvanov.id],
  );

  // --- Сортировка по табельному номеру: пустой — последним ---
  const byPersonnelNumber = await auth(agent.get('/api/v1/employees')).query({
    search: unique,
    sort: 'personnelNumber',
    order: 'ASC',
  });
  assert.deepEqual(
    byPersonnelNumber.body.data.map((e) => e.id),
    [empIvanov.id, empPetrov.id, empSidorov.id, empYakovlev.id],
  );

  // --- Сортировка по вычисляемому статусу (SQL CASE) ---
  const byStatus = await auth(agent.get('/api/v1/employees')).query({
    search: unique,
    sort: 'status',
    order: 'ASC',
  });
  assert.deepEqual(
    byStatus.body.data.map((e) => e.id),
    [empIvanov.id, empSidorov.id, empYakovlev.id, empPetrov.id],
  );

  // --- Печатная форма: шесть колонок, та же выборка/сортировка, что на экране ---
  const exportRes = await auth(agent.get('/api/v1/reports/employees-list/export'))
    .query({ format: 'xlsx', search: unique, sort: 'fullName', order: 'ASC' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(exportRes.status, 200);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportRes.body);
  const sheet = workbook.worksheets[0];
  assert.deepEqual(sheet.getRow(4).values.slice(1), [
    'ФИО',
    'Табельный номер',
    'Регион',
    'Должность',
    'ДПО',
    'Статус',
  ]);
  assert.match(String(sheet.getCell(2, 1).value), /Сформировано/);

  const rows = [];
  for (let r = 5; r <= 8; r += 1) {
    const row = sheet.getRow(r);
    rows.push({
      fullName: row.getCell(1).value,
      personnelNumber: row.getCell(2).value ?? null,
      region: row.getCell(3).value ?? null,
      status: row.getCell(6).value,
    });
  }
  assert.deepEqual(
    rows.map((r) => r.fullName),
    [empIvanov.fullName, empPetrov.fullName, empSidorov.fullName, empYakovlev.fullName],
  );
  assert.equal(rows[0].region, regionA);
  assert.equal(rows[0].status, 'Активен');
  assert.equal(rows[1].status, 'Уволен');
  // Работник без ДПО/табельного номера не ломает выгрузку.
  assert.equal(rows[3].region, null);
  assert.equal(rows[3].personnelNumber, null);

  // --- Подзаголовок формы отражает активные фильтры (ДПО) ---
  const exportWithDpoFilter = await auth(agent.get('/api/v1/reports/employees-list/export'))
    .query({ format: 'xlsx', dpoId: state.dpoAId })
    .buffer(true)
    .parse(binaryParser);
  const workbook2 = new ExcelJS.Workbook();
  await workbook2.xlsx.load(exportWithDpoFilter.body);
  const subtitle2 = String(workbook2.worksheets[0].getCell(2, 1).value);
  assert.match(subtitle2, /ДПО:/);
});

// Контрольное задание после проверки релиза В (CLAUDE_REVIEW_TASK.md):
// 1) sortPersonnelListRows() в reports.service.js сравнивала dpoName как
//    fullName (chain использовал строку 'dpoName', а ветки сравнения — 'dpo'),
//    поэтому экспорт по умолчанию фактически сортировался Регион -> ФИО, а не
//    Регион -> ДПО -> ФИО, как на экране;
// 2) CatalogPage показывал только бинарный архивный статус — уволенный, но не
//    архивный работник выглядел "Активно";
// 3) SQL-сортировка по archivedAt/terminationDate на экране путала группировку
//    статусов для работника с ещё не наступившей датой увольнения (по-прежнему
//    "Активен", но сортировался как будто позже всех "Уволен").
test('работники: сортировка по ДПО, будущая дата увольнения и поиск в подзаголовке (код-ревью Релиза В)', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test EmpReview ${Date.now()}`;

  const state = {
    organizationId: null,
    dpoOneId: null, // "Я-ДПО" — алфавитно последний
    dpoTwoId: null, // "А-ДПО" — алфавитно первый
    positionId: null,
    employeeIds: [],
  };
  t.after(async () => {
    if (state.employeeIds.length > 0) {
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    if (state.positionId) await models.Position.destroy({ where: { id: state.positionId } });
    if (state.dpoOneId || state.dpoTwoId) {
      await models.Dpo.destroy({ where: { id: [state.dpoOneId, state.dpoTwoId].filter(Boolean) } });
    }
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const region = `${unique} Регион`;

  // Оба ДПО в одном регионе — это ловит баг пункта 1: ФИО подобраны так,
  // чтобы алфавитный порядок ФИО противоречил правильной группировке по ДПО.
  const dpoOne = await auth(agent.post('/api/v1/dpo')).send({
    name: `${unique} Я-ДПО`,
    fullName: `${unique} Я-ДПО — полное наименование`,
    region,
  });
  assert.equal(dpoOne.status, 201);
  state.dpoOneId = dpoOne.body.data.id;

  const dpoTwo = await auth(agent.post('/api/v1/dpo')).send({
    name: `${unique} А-ДПО`,
    fullName: `${unique} А-ДПО — полное наименование`,
    region,
  });
  assert.equal(dpoTwo.status, 201);
  state.dpoTwoId = dpoTwo.body.data.id;

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  state.organizationId = org.body.data.id;
  const position = await auth(agent.post('/api/v1/positions')).send({ name: unique });
  state.positionId = position.body.data.id;

  async function createEmployee(spec) {
    const res = await auth(agent.post('/api/v1/employees')).send({
      organizationId: state.organizationId,
      positionId: state.positionId,
      dpoId: spec.dpoId,
      fullName: spec.fullName,
      hireDate: '2020-01-01',
      terminationDate: spec.terminationDate,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    state.employeeIds.push(res.body.data.id);
    return res.body.data;
  }

  // "Аaa" числится в Я-ДПО (алфавитно последний ДПО), а "Zzz"/"Bbb"/"Yyy" — в
  // А-ДПО (алфавитно первый). Правильная сортировка region->dpo->fullName
  // обязана поставить всю группу А-ДПО перед Я-ДПО вопреки алфавиту ФИО.
  const empInDpoOne = await createEmployee({
    dpoId: state.dpoOneId,
    fullName: `${unique} Aaa`,
  });
  const empInDpoTwo = await createEmployee({
    dpoId: state.dpoTwoId,
    fullName: `${unique} Zzz`,
  });
  // Активен, дата увольнения ещё не наступила — регрессия пункта 3.
  const empFutureTerm = await createEmployee({
    dpoId: state.dpoTwoId,
    fullName: `${unique} Bbb`,
    terminationDate: '2099-01-01',
  });
  const empTerminated = await createEmployee({
    dpoId: state.dpoTwoId,
    fullName: `${unique} Yyy`,
    terminationDate: '2020-06-01',
  });

  // --- Пункт 1: сортировка по умолчанию (Регион -> ДПО -> ФИО) одинакова на
  // экране и в выгрузке — до фикса выгрузка сортировалась Регион -> ФИО ---
  const expectedDefaultOrder = [empFutureTerm.id, empTerminated.id, empInDpoTwo.id, empInDpoOne.id];

  const screenDefault = await auth(agent.get('/api/v1/employees')).query({ search: unique });
  assert.deepEqual(
    screenDefault.body.data.map((e) => e.id),
    expectedDefaultOrder,
  );

  const exportDefault = await auth(agent.get('/api/v1/reports/employees-list/export'))
    .query({ format: 'xlsx', search: unique })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(exportDefault.status, 200);
  const workbookDefault = new ExcelJS.Workbook();
  await workbookDefault.xlsx.load(exportDefault.body);
  const sheetDefault = workbookDefault.worksheets[0];
  const exportDefaultFullNames = [];
  for (let r = 5; r <= 8; r += 1) {
    exportDefaultFullNames.push(sheetDefault.getRow(r).getCell(1).value);
  }
  assert.deepEqual(
    exportDefaultFullNames,
    expectedDefaultOrder.map(
      (id) =>
        [empFutureTerm, empTerminated, empInDpoTwo, empInDpoOne].find((e) => e.id === id).fullName,
    ),
  );

  // --- Пункт 4: подзаголовок печатной формы отражает поисковую строку ---
  const searchSubtitle = String(sheetDefault.getCell(2, 1).value);
  assert.match(searchSubtitle, /Поиск:/);
  assert.match(searchSubtitle, new RegExp(unique.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // --- Пункт 3: сортировка по вычисляемому статусу группирует будущую дату
  // увольнения вместе с активными, а не после уволенных; порядок одинаков
  // на экране и в выгрузке ---
  const expectedStatusOrder = [empFutureTerm.id, empInDpoTwo.id, empInDpoOne.id, empTerminated.id];

  const screenByStatus = await auth(agent.get('/api/v1/employees')).query({
    search: unique,
    sort: 'status',
    order: 'ASC',
  });
  assert.deepEqual(
    screenByStatus.body.data.map((e) => e.id),
    expectedStatusOrder,
  );
  const futureTermRow = screenByStatus.body.data.find((e) => e.id === empFutureTerm.id);
  assert.equal(futureTermRow.statusCode, 'active');
  assert.equal(futureTermRow.status, 'Активен');
  const terminatedRow = screenByStatus.body.data.find((e) => e.id === empTerminated.id);
  assert.equal(terminatedRow.statusCode, 'terminated');
  assert.equal(terminatedRow.status, 'Уволен');

  const exportByStatus = await auth(agent.get('/api/v1/reports/employees-list/export'))
    .query({ format: 'xlsx', search: unique, sort: 'status', order: 'ASC' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(exportByStatus.status, 200);
  const workbookByStatus = new ExcelJS.Workbook();
  await workbookByStatus.xlsx.load(exportByStatus.body);
  const sheetByStatus = workbookByStatus.worksheets[0];
  const exportByStatusFullNames = [];
  for (let r = 5; r <= 8; r += 1) {
    exportByStatusFullNames.push(sheetByStatus.getRow(r).getCell(1).value);
  }
  assert.deepEqual(
    exportByStatusFullNames,
    expectedStatusOrder.map(
      (id) =>
        [empFutureTerm, empInDpoTwo, empInDpoOne, empTerminated].find((e) => e.id === id).fullName,
    ),
  );
});
