// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import request from 'supertest';
import { Op } from 'sequelize';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  cleanupFixtureState,
} from './print-forms-fixture.js';

const FPU26_QUERY = { dpoId: null, from: '2026-07-01', to: '2026-07-31' };

async function baseTemplateBuffer(formType = 'fpu-26') {
  const active = await models.PrintFormTemplate.findOne({
    where: { formType, activatedAt: { [Op.ne]: null } },
    order: [['activatedAt', 'DESC']],
  });
  return { id: active.id, versionNumber: active.versionNumber, buffer: active.fileData };
}

async function buildVariant(baseBuffer, mutate) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(baseBuffer);
  mutate(workbook.worksheets[0]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Раздвигает архив .xlsx на уровне zip-записей — обходит собственную защиту
// exceljs от пересекающихся объединений в mergeCells() (см. диагностику в
// начале задачи 19: exceljs бросает исключение и на запись, и на чтение
// валидного XML с пересечением, так что смоделировать это можно только через
// сырую подмену XML, как сделал бы вредоносный файл).
function injectOverlappingMerge(baseBuffer) {
  const zip = new AdmZip(baseBuffer);
  const entry = zip.getEntry('xl/worksheets/sheet1.xml');
  const xml = entry.getData().toString('utf8');
  const injected = xml.replace(/<mergeCells count="(\d+)">/, (_match, count) => {
    return `<mergeCells count="${Number(count) + 2}"><mergeCell ref="N1:O2"/><mergeCell ref="N2:O3"/>`;
  });
  zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(injected, 'utf8'));
  return zip.toBuffer();
}

function injectZipEntry(baseBuffer, entryName, content) {
  const zip = new AdmZip(baseBuffer);
  zip.addFile(entryName, Buffer.from(content));
  return zip.toBuffer();
}

async function totalsOf(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const at = (address) => {
    const value = sheet.getCell(address).value;
    return value && typeof value === 'object' ? value.result : value;
  };
  return { cost: at('I43'), vat: at('K43'), total: at('L43') };
}

function currentActive(list) {
  return list
    .filter((item) => item.activatedAt)
    .sort((a, b) => new Date(b.activatedAt) - new Date(a.activatedAt))[0];
}

test('конструктор макетов ФПУ-26: загрузка, валидация маркеров, безопасность, активация/откат', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test Templates ${Date.now()}`;
  const { state } = await setupBaseFixture({ agent, auth, unique });
  FPU26_QUERY.dpoId = state.dpoId;
  const templateIds = [];
  const otherTemplateIds = [];
  t.after(async () => {
    if (templateIds.length + otherTemplateIds.length > 0) {
      await models.PrintFormTemplate.destroy({
        where: { id: [...templateIds, ...otherTemplateIds] },
      });
    }
    await cleanupFixtureState(state);
  });

  const base = await baseTemplateBuffer();

  // --- Визуальный редактор читает сетку и сохраняет правки отдельной версией ---
  const editorResponse = await auth(
    agent.get(`/api/v1/print-forms/templates/versions/${base.id}/layout`),
  );
  assert.equal(editorResponse.status, 200, JSON.stringify(editorResponse.body));
  assert.equal(editorResponse.body.data.version.id, base.id);
  assert.ok(editorResponse.body.data.layout.allowedMarkers.includes('CUSTOMER_NAME'));
  assert.equal(
    editorResponse.body.data.layout.cells.length,
    editorResponse.body.data.layout.rowCount * editorResponse.body.data.layout.columnCount,
  );

  const editedLayout = structuredClone(editorResponse.body.data.layout);
  editedLayout.columns[0].width += 2;
  editedLayout.rows[0].height += 2;
  editedLayout.pageSetup.orientation = 'landscape';
  editedLayout.pageSetup.paperSize = 9;
  const customerCell = editedLayout.cells.find((cell) => cell.row === 7 && cell.column === 2);
  const editedStyle = structuredClone(editedLayout.styles[customerCell.styleId] ?? {});
  editedStyle.alignment = { ...editedStyle.alignment, horizontal: 'right' };
  editedStyle.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' },
  };
  editedLayout.styles.push(editedStyle);
  customerCell.styleId = editedLayout.styles.length - 1;

  const visualPreview = await auth(
    agent.post(`/api/v1/print-forms/templates/versions/${base.id}/layout/preview`),
  )
    .send({
      dpoId: FPU26_QUERY.dpoId,
      from: FPU26_QUERY.from,
      to: FPU26_QUERY.to,
      format: 'xlsx',
      layout: editedLayout,
    })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(visualPreview.status, 200, visualPreview.body.toString());
  assert.equal(visualPreview.body.subarray(0, 2).toString(), 'PK');

  const visualSave = await auth(
    agent.post(`/api/v1/print-forms/templates/versions/${base.id}/layout`),
  ).send({
    dpoId: FPU26_QUERY.dpoId,
    from: FPU26_QUERY.from,
    to: FPU26_QUERY.to,
    comment: 'визуальная правка',
    layout: editedLayout,
  });
  assert.equal(visualSave.status, 201, JSON.stringify(visualSave.body));
  assert.equal(visualSave.body.data.validationResult.valid, true, JSON.stringify(visualSave.body));
  templateIds.push(visualSave.body.data.id);

  const visualDownload = await auth(
    agent.get(`/api/v1/print-forms/templates/versions/${visualSave.body.data.id}/download`),
  )
    .buffer(true)
    .parse(binaryParser);
  assert.equal(visualDownload.status, 200);
  const visualWorkbook = new ExcelJS.Workbook();
  await visualWorkbook.xlsx.load(visualDownload.body);
  const visualSheet = visualWorkbook.worksheets[0];
  assert.equal(visualSheet.pageSetup.orientation, 'landscape');
  assert.equal(visualSheet.pageSetup.paperSize, 9);
  assert.equal(visualSheet.getColumn(1).width, editedLayout.columns[0].width);
  assert.equal(visualSheet.getRow(1).height, editedLayout.rows[0].height);
  assert.equal(visualSheet.getCell('B7').alignment.horizontal, 'right');
  assert.equal(visualSheet.getCell('B7').fill.fgColor.argb, 'FFFFFF00');

  // Тот же round-trip работает для второго поддерживаемого макета.
  const preservationBase = await baseTemplateBuffer('preservation-receipt');
  const preservationEditor = await auth(
    agent.get(`/api/v1/print-forms/templates/versions/${preservationBase.id}/layout`),
  );
  assert.equal(preservationEditor.status, 200, JSON.stringify(preservationEditor.body));
  const preservationSave = await auth(
    agent.post(`/api/v1/print-forms/templates/versions/${preservationBase.id}/layout`),
  ).send({
    dpoId: FPU26_QUERY.dpoId,
    from: FPU26_QUERY.from,
    to: FPU26_QUERY.to,
    comment: 'round-trip сохранной расписки',
    layout: preservationEditor.body.data.layout,
  });
  assert.equal(preservationSave.status, 201, JSON.stringify(preservationSave.body));
  assert.equal(
    preservationSave.body.data.validationResult.valid,
    true,
    JSON.stringify(preservationSave.body),
  );
  otherTemplateIds.push(preservationSave.body.data.id);

  async function upload({ buffer, comment }) {
    const response = await auth(agent.post('/api/v1/print-forms/templates/fpu-26/versions'))
      .field('dpoId', FPU26_QUERY.dpoId)
      .field('from', FPU26_QUERY.from)
      .field('to', FPU26_QUERY.to)
      .field('comment', comment ?? '')
      .attach('file', buffer, 'fpu-26.xlsx');
    if (response.status === 201) templateIds.push(response.body.data.id);
    return response;
  }

  // --- Валидный клон активной версии — принимается, validation_result.valid ---
  const validClone = await upload({ buffer: base.buffer, comment: 'клон для теста' });
  assert.equal(validClone.status, 201);
  assert.equal(validClone.body.data.validationResult.valid, true, JSON.stringify(validClone.body));
  assert.equal(validClone.body.data.versionNumber, base.versionNumber + 2);

  // --- Новый собственный макет открывается как чистый лист A4 и сохраняется черновиком ---
  const newLayoutResponse = await auth(
    agent.get('/api/v1/print-forms/templates/fpu-26/layout/new'),
  );
  assert.equal(newLayoutResponse.status, 200, JSON.stringify(newLayoutResponse.body));
  assert.equal(newLayoutResponse.body.data.version.id, null);
  assert.equal(newLayoutResponse.body.data.layout.rowCount, 65);
  assert.equal(newLayoutResponse.body.data.layout.columnCount, 14);
  assert.equal(newLayoutResponse.body.data.layout.pageSetup.paperSize, 9);
  assert.ok(newLayoutResponse.body.data.layout.allowedMarkers.includes('TABLE_START'));

  const newLayoutPreview = await auth(
    agent.post('/api/v1/print-forms/templates/fpu-26/layout/new/preview'),
  )
    .send({
      dpoId: FPU26_QUERY.dpoId,
      from: FPU26_QUERY.from,
      to: FPU26_QUERY.to,
      format: 'xlsx',
      layout: newLayoutResponse.body.data.layout,
    })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(newLayoutPreview.status, 400);

  const newLayoutSave = await auth(
    agent.post('/api/v1/print-forms/templates/fpu-26/layout/new'),
  ).send({
    dpoId: FPU26_QUERY.dpoId,
    from: FPU26_QUERY.from,
    to: FPU26_QUERY.to,
    comment: 'пустой пользовательский макет',
    layout: newLayoutResponse.body.data.layout,
  });
  assert.equal(newLayoutSave.status, 201, JSON.stringify(newLayoutSave.body));
  assert.equal(newLayoutSave.body.data.validationResult.valid, false);
  assert.ok(
    newLayoutSave.body.data.validationResult.errors.some((item) =>
      item.includes('{{TABLE_START}}'),
    ),
  );
  templateIds.push(newLayoutSave.body.data.id);

  // --- Отсутствует обязательный маркер (CUSTOMER_NAME стёрт) ---
  const missingMarkerBuffer = await buildVariant(base.buffer, (sheet) => {
    sheet.getCell('B7').value = 'без маркера';
  });
  const missingMarker = await upload({ buffer: missingMarkerBuffer });
  assert.equal(missingMarker.status, 201);
  assert.equal(missingMarker.body.data.validationResult.valid, false);
  assert.ok(
    missingMarker.body.data.validationResult.errors.some((e) => e.includes('{{CUSTOMER_NAME}}')),
  );

  // --- Неизвестный токен-опечатка ---
  const unknownTokenBuffer = await buildVariant(base.buffer, (sheet) => {
    sheet.getCell('L12').value = '{{BOGUS_TOKEN}}';
  });
  const unknownToken = await upload({ buffer: unknownTokenBuffer });
  assert.equal(unknownToken.status, 201);
  assert.equal(unknownToken.body.data.validationResult.valid, false);
  assert.ok(
    unknownToken.body.data.validationResult.errors.some((e) => e.includes('{{BOGUS_TOKEN}}')),
  );

  // --- Обязательный маркер внутри повторяемой области таблицы ---
  const markerInsideTableBuffer = await buildVariant(base.buffer, (sheet) => {
    sheet.getCell('I43').value = '';
    sheet.getCell('N42').value = '{{GRAND_TOTAL_COST}}';
  });
  const markerInsideTable = await upload({ buffer: markerInsideTableBuffer });
  assert.equal(markerInsideTable.status, 201);
  assert.equal(markerInsideTable.body.data.validationResult.valid, false);
  assert.ok(
    markerInsideTable.body.data.validationResult.errors.some((e) =>
      e.includes('не должен находиться внутри повторяемой области'),
    ),
  );

  // --- Макрос в архиве .xlsx ---
  const macroUpload = await upload({
    buffer: injectZipEntry(base.buffer, 'xl/vbaProject.bin', 'fake macro'),
  });
  assert.equal(macroUpload.status, 201);
  assert.equal(macroUpload.body.data.validationResult.valid, false);
  assert.ok(macroUpload.body.data.validationResult.errors.some((e) => e.includes('vbaProject')));

  // --- Внешняя ссылка в архиве .xlsx ---
  const externalLinkUpload = await upload({
    buffer: injectZipEntry(base.buffer, 'xl/externalLinks/externalLink1.xml', '<externalLink/>'),
  });
  assert.equal(externalLinkUpload.status, 201);
  assert.equal(externalLinkUpload.body.data.validationResult.valid, false);
  assert.ok(
    externalLinkUpload.body.data.validationResult.errors.some((e) => e.includes('externalLinks')),
  );

  // --- Пересекающиеся объединения ячеек (сырая подмена XML) ---
  const overlapUpload = await upload({ buffer: injectOverlappingMerge(base.buffer) });
  assert.equal(overlapUpload.status, 201);
  assert.equal(overlapUpload.body.data.validationResult.valid, false);
  assert.ok(overlapUpload.body.data.validationResult.errors.length > 0);

  // --- Активация невалидной версии отклоняется ---
  const activateInvalid = await auth(
    agent.post(`/api/v1/print-forms/templates/versions/${missingMarker.body.data.id}/activate`),
  );
  assert.equal(activateInvalid.status, 400);

  // --- Список версий содержит все загруженные, ни одна не перезаписана ---
  const list = await auth(agent.get('/api/v1/print-forms/templates/fpu-26'));
  assert.equal(list.status, 200);
  const versionNumbers = list.body.data.map((item) => item.versionNumber);
  for (const id of templateIds) {
    assert.ok(list.body.data.some((item) => item.id === id));
  }
  assert.equal(
    new Set(versionNumbers).size,
    versionNumbers.length,
    'версии не должны дублироваться',
  );

  // --- Скачивание исходного файла версии ---
  const download = await auth(
    agent.get(`/api/v1/print-forms/templates/versions/${validClone.body.data.id}/download`),
  )
    .buffer(true)
    .parse(binaryParser);
  assert.equal(download.status, 200);
  assert.equal(download.body.subarray(0, 2).toString(), 'PK');

  // --- Превью по конкретной версии совпадает по суммам с активной (без активации) ---
  const previewQuery = {
    format: 'xlsx',
    dpoId: FPU26_QUERY.dpoId,
    from: FPU26_QUERY.from,
    to: FPU26_QUERY.to,
  };
  const activePreview = await auth(
    agent.get(`/api/v1/print-forms/templates/versions/${base.id}/preview`),
  )
    .query(previewQuery)
    .buffer(true)
    .parse(binaryParser);
  assert.equal(activePreview.status, 200);
  const clonePreview = await auth(
    agent.get(`/api/v1/print-forms/templates/versions/${validClone.body.data.id}/preview`),
  )
    .query(previewQuery)
    .buffer(true)
    .parse(binaryParser);
  assert.equal(clonePreview.status, 200);
  assert.deepEqual(await totalsOf(activePreview.body), await totalsOf(clonePreview.body));

  // --- Активация валидной версии и откат на предыдущую активную ---
  try {
    const activate = await auth(
      agent.post(`/api/v1/print-forms/templates/versions/${validClone.body.data.id}/activate`),
    );
    assert.equal(activate.status, 200);
    assert.ok(activate.body.data.activatedAt);

    const afterActivateList = await auth(agent.get('/api/v1/print-forms/templates/fpu-26'));
    assert.equal(currentActive(afterActivateList.body.data).id, validClone.body.data.id);

    const generated = await auth(agent.get('/api/v1/print-forms/fpu-26'))
      .query({ ...FPU26_QUERY, format: 'xlsx' })
      .buffer(true)
      .parse(binaryParser);
    assert.equal(generated.status, 200);
    const generatedWorkbook = new ExcelJS.Workbook();
    await generatedWorkbook.xlsx.load(generated.body);
    assert.match(
      generatedWorkbook.subject,
      new RegExp(`шаблон v${validClone.body.data.versionNumber}`),
    );
  } finally {
    // Откат обязателен: активная версия формы — общее состояние схемы,
    // используемое параллельно другими тестовыми файлами (см.
    // docs/architecture.md «Изоляция интеграционных тестов»).
    const rollback = await auth(
      agent.post(`/api/v1/print-forms/templates/versions/${base.id}/activate`),
    );
    assert.equal(rollback.status, 200);
  }

  // --- Пользователь без admin.manage не может загружать/активировать (403), но печатные формы работают ---
  const rolesRes = await auth(agent.get('/api/v1/admin/roles'));
  const accountantRole = rolesRes.body.data.find((r) => r.code === 'accountant');
  assert.ok(
    accountantRole,
    'ожидалась сидированная роль accountant (print_forms.use без admin.manage)',
  );
  const limitedLogin = `templlimited${Date.now()}`;
  const limitedUser = await auth(agent.post('/api/v1/admin/users')).send({
    login: limitedLogin,
    password: 'Passw0rd123',
    fullName: 'Ограниченный Пользователь',
    roleId: accountantRole.id,
  });
  assert.equal(limitedUser.status, 201);
  t.after(async () => {
    await models.User.destroy({ where: { id: limitedUser.body.data.id } });
  });

  const limitedAgent = request.agent(createApp());
  const limitedLoginRes = await limitedAgent
    .post('/api/v1/auth/login')
    .send({ login: limitedLogin, password: 'Passw0rd123' });
  const limitedToken = limitedLoginRes.body.data.accessToken;
  const limitedAuth = (req) => req.set('Authorization', `Bearer ${limitedToken}`);

  const forbiddenUpload = await limitedAuth(
    limitedAgent.post('/api/v1/print-forms/templates/fpu-26/versions'),
  )
    .field('dpoId', FPU26_QUERY.dpoId)
    .field('from', FPU26_QUERY.from)
    .field('to', FPU26_QUERY.to)
    .attach('file', base.buffer, 'fpu-26.xlsx');
  assert.equal(forbiddenUpload.status, 403);

  const forbiddenActivate = await limitedAuth(
    limitedAgent.post(`/api/v1/print-forms/templates/versions/${validClone.body.data.id}/activate`),
  );
  assert.equal(forbiddenActivate.status, 403);

  const forbiddenEditor = await limitedAuth(
    limitedAgent.get(`/api/v1/print-forms/templates/versions/${base.id}/layout`),
  );
  assert.equal(forbiddenEditor.status, 403);

  const forbiddenNewEditor = await limitedAuth(
    limitedAgent.get('/api/v1/print-forms/templates/fpu-26/layout/new'),
  );
  assert.equal(forbiddenNewEditor.status, 403);

  const stillWorks = await limitedAuth(limitedAgent.get('/api/v1/print-forms/fpu-26'))
    .query({ ...FPU26_QUERY, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(stillWorks.status, 200);
});
