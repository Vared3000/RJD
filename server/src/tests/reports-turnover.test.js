// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
// Отчёт «Сменяемость работников по ДПО» (Релиз Г,
// docs/TZ_NEXT_RELEASES_2026-08-19.md). Принадлежность к ДПО берётся из
// EmployeeDpoAssignment на конкретную дату, поэтому сценарий перевода между
// ДПО собирает историю назначений напрямую через модель (API создаёт только
// одну запись назначения с validFrom = сегодня при смене dpoId — это не
// подходит для управляемой исторической даты перевода внутри теста).
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

function closeTo(actual, expected, epsilon = 0.001) {
  assert.ok(Math.abs(actual - expected) < epsilon, `ожидалось ~${expected}, получено ${actual}`);
}

test('отчёт сменяемости работников по ДПО: формула, история назначений, фильтры', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test Turnover ${Date.now()}`;

  const state = {
    employeeIds: [],
    dpoIds: [],
    positionIds: [],
    organizationId: null,
  };
  t.after(async () => {
    if (state.employeeIds.length > 0) {
      await models.EmployeeDpoAssignment.destroy({ where: { employeeId: state.employeeIds } });
      await models.Employee.destroy({ where: { id: state.employeeIds } });
    }
    if (state.dpoIds.length > 0) {
      await models.DpoHistory.destroy({ where: { dpoId: state.dpoIds } });
      await models.Dpo.destroy({ where: { id: state.dpoIds } });
    }
    if (state.positionIds.length > 0) {
      await models.Position.destroy({ where: { id: state.positionIds } });
    }
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const org = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  const organizationId = org.body.data.id;
  state.organizationId = organizationId;

  async function createDpo(suffix) {
    const res = await auth(agent.post('/api/v1/dpo')).send({
      name: `${unique} ${suffix}`,
      fullName: `${unique} ${suffix} — структурное подразделение`,
    });
    state.dpoIds.push(res.body.data.id);
    return res.body.data;
  }

  async function createEmployee({ dpoId, hireDate, terminationDate, gender, positionId }) {
    const res = await auth(agent.post('/api/v1/employees')).send({
      organizationId,
      dpoId,
      fullName: `${unique} employee ${state.employeeIds.length + 1}`,
      hireDate: hireDate ?? undefined,
      terminationDate: terminationDate ?? undefined,
      gender: gender ?? undefined,
      positionId: positionId ?? undefined,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    state.employeeIds.push(res.body.data.id);
    return res.body.data;
  }

  // === Сценарий 1 (контрольный из ТЗ) + «нулевая средняя» — общий период,
  // чтобы одним запросом без фильтра ДПО проверить пересчёт итоговой строки
  // из общих чисел (а не суммы процентов по строкам). ===
  const periodMain = { from: '2026-01-01', to: '2026-01-31' };
  const dpoMain = await createDpo('Main');
  const dpoZero = await createDpo('Zero');

  // 10 работников, активных на начало периода: приняты задолго до `from`.
  const startEmployees = [];
  for (let i = 0; i < 10; i += 1) {
    startEmployees.push(await createEmployee({ dpoId: dpoMain.id, hireDate: '2020-01-01' }));
  }
  // 2 из них увольняются внутри периода.
  await auth(agent.patch(`/api/v1/employees/${startEmployees[0].id}`)).send({
    terminationDate: '2026-01-10',
  });
  await auth(agent.patch(`/api/v1/employees/${startEmployees[1].id}`)).send({
    terminationDate: '2026-01-20',
  });
  // 3 новых приёма внутри периода.
  for (let i = 0; i < 3; i += 1) {
    await createEmployee({ dpoId: dpoMain.id, hireDate: '2026-01-15' });
  }

  // dpoZero: один работник принят и уволен в один и тот же период — нулевая
  // численность и на начало, и на конец, но принято=1 и уволено=1.
  const zeroEmployee = await createEmployee({
    dpoId: dpoZero.id,
    hireDate: '2026-01-05',
    terminationDate: '2026-01-20',
  });
  void zeroEmployee;

  const mainReport = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodMain,
    dpoId: dpoMain.id,
  });
  assert.equal(mainReport.status, 200);
  assert.equal(mainReport.body.data.length, 1);
  const mainRow = mainReport.body.data[0];
  assert.equal(mainRow.start, 10, 'на начало периода');
  assert.equal(mainRow.hired, 3, 'принято за период');
  assert.equal(mainRow.terminated, 2, 'уволено за период');
  assert.equal(mainRow.end, 11, 'на конец периода');
  closeTo(mainRow.average, 10.5);
  closeTo(mainRow.turnoverRate, 19.047619047619047);
  closeTo(mainRow.turnoverPercent, 47.61904761904762);
  // Значения из ТЗ при округлении до двух знаков для отображения.
  assert.equal(mainRow.turnoverRate.toFixed(2), '19.05');
  assert.equal(mainRow.turnoverPercent.toFixed(2), '47.62');
  // Формула обязана явно объяснять, ПОЧЕМУ это не текучесть (ТЗ требует
  // предупреждение), поэтому слово «текучесть» в тексте ожидаемо — но сам
  // показатель нигде не должен называться «текучестью» как метрикой (это
  // отдельно проверяют заголовки колонок Excel ниже: «Сменяемость, %» /
  // «Оборот кадров, %», не «Текучесть, %»).
  assert.match(mainReport.body.meta.formulaText, /не показатель текучести/);

  const zeroReport = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodMain,
    dpoId: dpoZero.id,
  });
  assert.equal(zeroReport.status, 200);
  const zeroRow = zeroReport.body.data[0];
  assert.equal(zeroRow.start, 0);
  assert.equal(zeroRow.end, 0);
  assert.equal(zeroRow.hired, 1);
  assert.equal(zeroRow.terminated, 1);
  assert.equal(zeroRow.average, 0);
  assert.equal(zeroRow.turnoverRate, 0, 'нулевая средняя — сменяемость 0, не NaN/Infinity');
  assert.equal(zeroRow.turnoverPercent, 0);

  // Общий запрос без фильтра ДПО: итог пересчитывается из суммы общих чисел
  // (10+0 на начало, 3+1 принято, 2+1 уволено, 11+0 на конец), а НЕ является
  // суммой процентов отдельных строк (19.05 + 0 != пересчитанный показатель).
  const combinedReport = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodMain,
    groupBy: 'dpo',
  });
  assert.equal(combinedReport.status, 200);
  const combinedRows = combinedReport.body.data;
  const rowMain = combinedRows.find((r) => r.dpoName === dpoMain.name);
  const rowZero = combinedRows.find((r) => r.dpoName === dpoZero.name);
  assert.ok(rowMain && rowZero);
  const totals = combinedReport.body.meta.totals;
  const expectedTotalStart = rowMain.start + rowZero.start;
  const expectedTotalHired = rowMain.hired + rowZero.hired;
  const expectedTotalTerminated = rowMain.terminated + rowZero.terminated;
  const expectedTotalEnd = rowMain.end + rowZero.end;
  assert.equal(totals.start, expectedTotalStart);
  assert.equal(totals.hired, expectedTotalHired);
  assert.equal(totals.terminated, expectedTotalTerminated);
  assert.equal(totals.end, expectedTotalEnd);
  const expectedAverage = (expectedTotalStart + expectedTotalEnd) / 2;
  const expectedTurnoverRate =
    expectedAverage === 0
      ? 0
      : (Math.min(expectedTotalHired, expectedTotalTerminated) / expectedAverage) * 100;
  closeTo(totals.average, expectedAverage);
  closeTo(totals.turnoverRate, expectedTurnoverRate);
  const naiveSumOfPercentages = rowMain.turnoverRate + rowZero.turnoverRate;
  assert.notEqual(
    Math.round(totals.turnoverRate * 100),
    Math.round(naiveSumOfPercentages * 100),
    'итог не должен быть суммой процентов строк',
  );

  // === Сценарий 2: перевод работника между ДПО внутри периода. ===
  const periodTransfer = { from: '2026-02-01', to: '2026-02-28' };
  const dpoFrom = await createDpo('TransferFrom');
  const dpoTo = await createDpo('TransferTo');
  const transferEmployee = await createEmployee({ dpoId: dpoFrom.id, hireDate: '2020-01-01' });
  const originalAssignment = await models.EmployeeDpoAssignment.findOne({
    where: { employeeId: transferEmployee.id },
  });
  await originalAssignment.update({ validTo: '2026-02-14' });
  await models.EmployeeDpoAssignment.create({
    employeeId: transferEmployee.id,
    dpoId: dpoTo.id,
    validFrom: '2026-02-15',
    validTo: null,
  });

  const transferFromReport = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodTransfer,
    dpoId: dpoFrom.id,
  });
  const transferFromRow = transferFromReport.body.data[0];
  assert.equal(transferFromRow.start, 1, 'старое ДПО видит его в численности на начало');
  assert.equal(transferFromRow.end, 0, 'старое ДПО не видит его в численности на конец');
  assert.equal(transferFromRow.hired, 0);
  assert.equal(transferFromRow.terminated, 0);

  const transferToReport = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodTransfer,
    dpoId: dpoTo.id,
  });
  const transferToRow = transferToReport.body.data[0];
  assert.equal(transferToRow.start, 0, 'новое ДПО не видит его в численности на начало');
  assert.equal(transferToRow.end, 1, 'новое ДПО видит его в численности на конец');
  assert.equal(transferToRow.hired, 0);
  assert.equal(transferToRow.terminated, 0);

  // === Сценарий 3: неполная карточка (без даты приёма/пола/должности). ===
  const periodIncomplete = { from: '2026-03-01', to: '2026-03-31' };
  const dpoIncomplete = await createDpo('Incomplete');
  await createEmployee({ dpoId: dpoIncomplete.id });

  const incompleteReport = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodIncomplete,
    dpoId: dpoIncomplete.id,
  });
  assert.equal(incompleteReport.status, 200);
  assert.equal(incompleteReport.body.meta.incompleteHireCount, 1);
  const incompleteRow = incompleteReport.body.data[0];
  assert.equal(incompleteRow.start, 1, 'работник без даты приёма всё равно входит в численность');
  assert.equal(incompleteRow.end, 1);
  assert.equal(incompleteRow.hired, 0, 'без даты приёма не считается принятым');

  const incompleteByGender = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodIncomplete,
    dpoId: dpoIncomplete.id,
    groupBy: 'gender',
  });
  const incompleteGenderRow = incompleteByGender.body.data[0];
  assert.equal(incompleteGenderRow.gender, null);
  assert.equal(incompleteGenderRow.genderLabel, 'Не указан');

  const incompleteByPosition = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodIncomplete,
    dpoId: dpoIncomplete.id,
    groupBy: 'position',
  });
  const incompletePositionRow = incompleteByPosition.body.data[0];
  assert.equal(incompletePositionRow.positionId, null);
  assert.equal(incompletePositionRow.positionName, 'Без должности');

  // === Сценарий 4: фильтры по должности и полу. ===
  const periodFilters = { from: '2026-04-01', to: '2026-04-30' };
  const dpoFilters = await createDpo('Filters');
  const positionA = await auth(agent.post('/api/v1/positions')).send({ name: `${unique} PosA` });
  const positionB = await auth(agent.post('/api/v1/positions')).send({ name: `${unique} PosB` });
  state.positionIds.push(positionA.body.data.id, positionB.body.data.id);

  await createEmployee({
    dpoId: dpoFilters.id,
    hireDate: '2020-01-01',
    gender: 'male',
    positionId: positionA.body.data.id,
  });
  await createEmployee({
    dpoId: dpoFilters.id,
    hireDate: '2020-01-01',
    gender: 'female',
    positionId: positionB.body.data.id,
  });

  const maleOnly = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodFilters,
    dpoId: dpoFilters.id,
    gender: 'male',
  });
  assert.equal(maleOnly.body.data[0].start, 1);
  assert.equal(maleOnly.body.data[0].end, 1);

  const positionAOnly = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodFilters,
    dpoId: dpoFilters.id,
    positionId: positionA.body.data.id,
  });
  assert.equal(positionAOnly.body.data[0].start, 1);

  const genderGrouped = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodFilters,
    dpoId: dpoFilters.id,
    groupBy: 'gender',
  });
  assert.equal(genderGrouped.body.data.length, 2);
  const maleRow = genderGrouped.body.data.find((r) => r.gender === 'male');
  const femaleRow = genderGrouped.body.data.find((r) => r.gender === 'female');
  assert.equal(maleRow.start, 1);
  assert.equal(femaleRow.start, 1);

  // === Сценарий 5: техническая архивация карточки не переписывает историю. ===
  const periodArchived = { from: '2026-05-01', to: '2026-05-31' };
  const dpoArchived = await createDpo('Archived');
  const archivedEmployee = await createEmployee({
    dpoId: dpoArchived.id,
    hireDate: '2020-01-01',
    terminationDate: '2026-05-10',
  });
  const archived = await auth(agent.delete(`/api/v1/employees/${archivedEmployee.id}`));
  assert.equal(archived.status, 200);
  const archivedRecord = await models.Employee.findByPk(archivedEmployee.id);
  assert.ok(archivedRecord.archivedAt, 'карточка должна быть архивирована');

  const archivedReport = await auth(agent.get('/api/v1/reports/turnover')).query({
    ...periodArchived,
    dpoId: dpoArchived.id,
  });
  assert.equal(archivedReport.status, 200);
  assert.equal(archivedReport.body.data.length, 1);
  const archivedRow = archivedReport.body.data[0];
  assert.equal(archivedRow.start, 1, 'архивный работник учитывается на начало периода');
  assert.equal(archivedRow.hired, 0);
  assert.equal(archivedRow.terminated, 1, 'архивный работник учитывается в увольнениях');
  assert.equal(archivedRow.end, 0);

  // === Валидация: период обязателен. ===
  const missingPeriod = await auth(agent.get('/api/v1/reports/turnover')).query({
    dpoId: dpoMain.id,
  });
  assert.equal(missingPeriod.status, 400);

  // === Экспорт: Excel/PDF с ожидаемыми колонками, период, формула, итог. ===
  const xlsx = await auth(agent.get('/api/v1/reports/turnover/export'))
    .query({ ...periodMain, dpoId: dpoMain.id, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers['content-type'], /spreadsheetml/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  const sheet = workbook.worksheets[0];
  // sheet.actualRowCount недооценивает число строк на 1 после записи+чтения
  // .xlsx (не подхватывает последнюю добавленную строку — воспроизведено
  // отдельно на минимальном примере с generateTabularExcel напрямую) —
  // rowCount корректно отражает все записанные строки, включая итоговую.
  const headerRowNumber = Array.from({ length: sheet.rowCount }, (_, index) => index + 1).find(
    (rowNumber) => sheet.getCell(rowNumber, 1).value === 'ДПО',
  );
  assert.ok(headerRowNumber);
  const headerRow = sheet.getRow(headerRowNumber);
  assert.deepEqual(headerRow.values.slice(1, 11), [
    'ДПО',
    'Должность',
    'Пол',
    'На начало',
    'Принято',
    'Уволено',
    'На конец',
    'Средняя численность',
    'Сменяемость, %',
    'Оборот кадров, %',
  ]);
  const subtitle = sheet.getCell(2, 1).value;
  assert.match(subtitle, /Период/);
  assert.match(subtitle, /min\(принято, уволено\)/);
  const dataRow = sheet.getRow(headerRowNumber + 1);
  assert.equal(dataRow.getCell(4).value, 10);
  const totalRow = sheet.getRow(sheet.rowCount);
  assert.equal(totalRow.getCell(1).value, 'Итого');

  const pdf = await auth(agent.get('/api/v1/reports/turnover/export'))
    .query({ ...periodMain, dpoId: dpoMain.id, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.body.length > 500);
});
