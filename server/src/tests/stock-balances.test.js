// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
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

test('остатки: фильтры, естественный числовой порядок размеров, составная сортировка по умолчанию, экспорт', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const unique = `Test StockBalances ${Date.now()}`;

  const state = {
    organizationId: null,
    warehouseId: null,
    modelMaleId: null,
    modelFemaleId: null,
    sizeIds: [],
    instanceIds: [],
  };
  t.after(async () => {
    if (state.instanceIds.length > 0) {
      await models.Instance.destroy({ where: { id: state.instanceIds } });
    }
    if (state.sizeIds.length > 0) {
      await models.Size.destroy({ where: { id: state.sizeIds } });
    }
    await models.NomenclatureModel.destroy({
      where: { id: [state.modelMaleId, state.modelFemaleId].filter(Boolean) },
    });
    if (state.warehouseId) await models.Warehouse.destroy({ where: { id: state.warehouseId } });
    if (state.organizationId) {
      await models.Organization.destroy({ where: { id: state.organizationId } });
    }
  });

  const organization = await models.Organization.create({ name: unique });
  state.organizationId = organization.id;
  const warehouse = await models.Warehouse.create({
    organizationId: organization.id,
    name: unique,
  });
  state.warehouseId = warehouse.id;

  const modelMale = await models.NomenclatureModel.create({
    name: `${unique} М`,
    sizeType: 'clothing',
    genderCategory: 'male',
  });
  state.modelMaleId = modelMale.id;
  const modelFemale = await models.NomenclatureModel.create({
    name: `${unique} Ж`,
    sizeType: 'clothing',
    genderCategory: 'female',
  });
  state.modelFemaleId = modelFemale.id;

  const sizeValues = ['8', '10', '46', '100'];
  const sizesByValue = {};
  for (const value of sizeValues) {
    const size = await models.Size.create({ type: 'clothing', value });
    state.sizeIds.push(size.id);
    sizesByValue[value] = size;
  }
  const height182 = await models.Size.create({ type: 'height', value: '182' });
  state.sizeIds.push(height182.id);

  async function createInstance(spec) {
    const instance = await models.Instance.create({
      modelId: spec.modelId,
      inventoryNumber: `${unique}-${spec.tag}`,
      warehouseId: warehouse.id,
      sizeId: spec.sizeId ?? null,
      heightSizeId: spec.heightSizeId ?? null,
    });
    state.instanceIds.push(instance.id);
    return instance;
  }

  // Мужская модель: размеры 8/10/46/100 и одна позиция без размера вовсе.
  for (const value of sizeValues) {
    await createInstance({ modelId: modelMale.id, sizeId: sizesByValue[value].id, tag: value });
  }
  await createInstance({ modelId: modelMale.id, sizeId: null, tag: 'no-size' });

  // Женская модель: размер 46 + рост 182, две единицы (проверка группировки COUNT).
  await createInstance({
    modelId: modelFemale.id,
    sizeId: sizesByValue['46'].id,
    heightSizeId: height182.id,
    tag: 'f1',
  });
  await createInstance({
    modelId: modelFemale.id,
    sizeId: sizesByValue['46'].id,
    heightSizeId: height182.id,
    tag: 'f2',
  });

  // --- Естественный числовой порядок размеров, пустой размер — последним ---
  const ascBySize = await auth(agent.get('/api/v1/stock/balances')).query({
    warehouseId: warehouse.id,
    modelId: modelMale.id,
    sort: 'size',
    order: 'ASC',
  });
  assert.equal(ascBySize.status, 200);
  assert.deepEqual(
    ascBySize.body.data.map((row) => row.size?.value ?? null),
    ['8', '10', '46', '100', null],
  );

  // Пустой размер остаётся последним даже при DESC — направление не должно
  // выталкивать его в начало (см. компаратор compareSizeLike в stock.service.js).
  const descBySize = await auth(agent.get('/api/v1/stock/balances')).query({
    warehouseId: warehouse.id,
    modelId: modelMale.id,
    sort: 'size',
    order: 'DESC',
  });
  assert.deepEqual(
    descBySize.body.data.map((row) => row.size?.value ?? null),
    ['100', '46', '10', '8', null],
  );

  // --- Составная сортировка по умолчанию: Склад -> Категория по полу -> ... ---
  // male (rank 0) должен идти раньше female (rank 1) при отсутствии явного sort.
  const defaultSort = await auth(agent.get('/api/v1/stock/balances')).query({
    warehouseId: warehouse.id,
  });
  const genderSequence = defaultSort.body.data.map((row) => row.model?.genderCategory);
  const firstFemaleIndex = genderSequence.indexOf('female');
  const lastMaleIndex = genderSequence.lastIndexOf('male');
  assert.ok(
    firstFemaleIndex === -1 || lastMaleIndex < firstFemaleIndex,
    'мужские позиции должны идти раньше женских в сортировке по умолчанию',
  );

  // --- Фильтр по категории по полу ---
  const femaleOnly = await auth(agent.get('/api/v1/stock/balances')).query({
    warehouseId: warehouse.id,
    genderCategory: 'female',
  });
  assert.equal(femaleOnly.body.data.length, 1);
  assert.equal(femaleOnly.body.data[0].quantity, 2, 'две единицы одной позиции сгруппированы');
  assert.equal(femaleOnly.body.data[0].genderCategoryLabel, 'Женское');

  // --- Фильтр по размеру: размер 46 встречается у обеих моделей ---
  const bySize46 = await auth(agent.get('/api/v1/stock/balances')).query({
    warehouseId: warehouse.id,
    sizeId: sizesByValue['46'].id,
  });
  assert.equal(bySize46.body.data.length, 2);

  // --- Фильтр по росту ---
  const byHeight = await auth(agent.get('/api/v1/stock/balances')).query({
    warehouseId: warehouse.id,
    heightSizeId: height182.id,
  });
  assert.equal(byHeight.body.data.length, 1);
  assert.equal(byHeight.body.data[0].model.id, modelFemale.id);

  // --- Экспорт: та же выборка/порядок, шесть колонок, итог ---
  const exportRes = await auth(agent.get('/api/v1/reports/stock-balances/export'))
    .query({
      warehouseId: warehouse.id,
      modelId: modelMale.id,
      sort: 'size',
      order: 'ASC',
      format: 'xlsx',
    })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(exportRes.status, 200);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportRes.body);
  const sheet = workbook.worksheets[0];
  const headerRow = sheet.getRow(4).values.slice(1);
  assert.deepEqual(headerRow, [
    'Склад',
    'Категория по полу',
    'Модель',
    'Размер',
    'Рост',
    'Количество',
  ]);
  assert.match(
    String(sheet.getCell(2, 1).value),
    /Сформировано/,
    'печатная форма остатков должна указывать дату и время формирования',
  );

  const dataRows = [];
  for (let r = 5; r < 5 + ascBySize.body.data.length; r += 1) {
    dataRows.push(sheet.getRow(r).getCell(4).value ?? null);
  }
  assert.deepEqual(dataRows, ['8', '10', '46', '100', null]);

  const totalRow = sheet.getRow(5 + ascBySize.body.data.length);
  assert.equal(
    totalRow.getCell(6).value,
    5,
    'итог: 5 единиц (по одной каждого размера + одна без размера)',
  );
});
