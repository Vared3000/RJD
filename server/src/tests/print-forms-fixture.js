import request from 'supertest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';

export async function loginAsAdmin(agent) {
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ login: env.BOOTSTRAP_ADMIN_LOGIN, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  return res.body.data.accessToken;
}

export function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => callback(null, Buffer.from(data, 'binary')));
}

export async function setupApp() {
  const app = createApp();
  const agent = request.agent(app);
  const token = await loginAsAdmin(agent);
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  return { app, agent, auth };
}

export function createFixtureState() {
  return {
    organizationId: null,
    dpoId: null,
    employeeId: null,
    positionId: null,
    modelId: null,
    sizeId: null,
    warehouseId: null,
    supplierId: null,
    receivingId: null,
    batchId: null,
    issuanceId: null,
    secondIssuanceId: null,
    returnId: null,
    kitId: null,
    instanceIds: [],
    sourceRecordIds: [],
    partyVersionIds: [],
    monthlyActIds: [],
  };
}

export async function cleanupFixtureState(state) {
  if (state.monthlyActIds.length > 0) {
    await models.MonthlyRentalAct.destroy({ where: { id: state.monthlyActIds } });
  }
  if (state.partyVersionIds.length > 0) {
    await models.PrintFormParty.destroy({ where: { id: state.partyVersionIds } });
  }
  if (state.instanceIds.length > 0) {
    await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
  }
  if (state.issuanceId) await models.IssuanceDocument.destroy({ where: { id: state.issuanceId } });
  if (state.secondIssuanceId) {
    await models.IssuanceDocument.destroy({ where: { id: state.secondIssuanceId } });
  }
  if (state.returnId) await models.ReturnDocument.destroy({ where: { id: state.returnId } });
  if (state.instanceIds.length > 0) {
    await models.Instance.destroy({ where: { id: state.instanceIds } });
  }
  if (state.receivingId) {
    await models.ReceivingDocument.destroy({ where: { id: state.receivingId } });
  }
  if (state.batchId) await models.Batch.destroy({ where: { id: state.batchId } });
  if (state.sourceRecordIds.length > 0) {
    await models.NomenclaturePrice.destroy({ where: { sourceRecordId: state.sourceRecordIds } });
    await models.SourceImportRecord.destroy({ where: { id: state.sourceRecordIds } });
  }
  if (state.kitId) await models.PositionKitItem.destroy({ where: { id: state.kitId } });
  if (state.employeeId) await models.Employee.destroy({ where: { id: state.employeeId } });
  if (state.dpoId) {
    await models.DpoHistory.destroy({ where: { dpoId: state.dpoId } });
    await models.Dpo.destroy({ where: { id: state.dpoId } });
  }
  if (state.positionId) await models.Position.destroy({ where: { id: state.positionId } });
  if (state.modelId) await models.NomenclatureModel.destroy({ where: { id: state.modelId } });
  if (state.sizeId) await models.Size.destroy({ where: { id: state.sizeId } });
  if (state.warehouseId) await models.Warehouse.destroy({ where: { id: state.warehouseId } });
  if (state.supplierId) await models.Supplier.destroy({ where: { id: state.supplierId } });
  if (state.organizationId) {
    await models.Organization.destroy({ where: { id: state.organizationId } });
  }
}

function uniqueKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Короче uniqueKey() — умещается в лимит `Size.value` (32 символа) вместе с
// префиксом-значением.
function shortUniqueKey() {
  return Math.random().toString(36).slice(2, 8);
}

// Общий сценарий: организация/склад/поставщик/размер/модель/должность/ДПО/работник/
// комплект/цена(1000 руб. с 2026-01-01)/поступление(3 шт, проведено)/первая выдача
// (2 шт, 15.07.2026, проведена). Используется всеми тестами печатных форм — каждый
// вызывает её со своим уникальным `unique`, поэтому фикстуры разных тестовых файлов
// не пересекаются в общей тестовой схеме.
export async function setupBaseFixture({ agent, auth, unique }) {
  const state = createFixtureState();

  const organization = await auth(agent.post('/api/v1/organizations')).send({ name: unique });
  state.organizationId = organization.body.data.id;
  const warehouse = await auth(agent.post('/api/v1/warehouses')).send({
    organizationId: state.organizationId,
    name: unique,
  });
  state.warehouseId = warehouse.body.data.id;
  const supplier = await auth(agent.post('/api/v1/suppliers')).send({ name: unique });
  state.supplierId = supplier.body.data.id;
  const size = await auth(agent.post('/api/v1/sizes')).send({
    type: 'clothing',
    // Значение должно быть уникальным между тестовыми файлами: они делят одну
    // тестовую схему, и справочник размеров уникален по (type, value).
    value: `52/182-${shortUniqueKey()}`,
  });
  state.sizeId = size.body.data.id;
  const model = await auth(agent.post('/api/v1/nomenclature-models')).send({
    name: unique,
    sizeType: 'clothing',
    unit: 'шт.',
  });
  state.modelId = model.body.data.id;
  const position = await auth(agent.post('/api/v1/positions')).send({ name: unique });
  state.positionId = position.body.data.id;
  const dpo = await auth(agent.post('/api/v1/dpo')).send({
    name: unique,
    fullName: `${unique} — заказчик`,
    contractNumber: 'ТЕСТ-26',
    contractDate: '2026-01-15',
    directorFullName: 'Иванов Иван Иванович',
    directorBasis: 'Устав',
  });
  state.dpoId = dpo.body.data.id;
  const employee = await auth(agent.post('/api/v1/employees')).send({
    organizationId: state.organizationId,
    dpoId: state.dpoId,
    positionId: state.positionId,
    fullName: 'Петров Пётр Петрович',
    personnelNumber: `PF-${uniqueKey()}`,
    hireDate: '2020-01-01',
    clothingSizeId: state.sizeId,
  });
  state.employeeId = employee.body.data.id;
  const kit = await auth(agent.post('/api/v1/kits')).send({
    positionId: state.positionId,
    modelId: state.modelId,
    quantity: 1,
    serviceLifeYears: 4,
    season: 'summer',
  });
  state.kitId = kit.body.data.id;

  const sourceRecord = await models.SourceImportRecord.create({
    sourceKey: `print-form-test-${uniqueKey()}`,
    sourceFile: 'test.xlsx',
    fileHash: '0'.repeat(64),
    recordType: 'price',
    sheetName: 'Тест',
    rowNumber: 1,
    payload: { test: true },
  });
  state.sourceRecordIds.push(sourceRecord.id);
  const price = await models.NomenclaturePrice.create({
    modelId: state.modelId,
    dpoId: state.dpoId,
    sourceRecordId: sourceRecord.id,
    effectiveDate: '2026-01-01',
    priceWithoutVat: 1000,
    vatRate: 5,
    priceWithVat: 1050,
  });

  const receiving = await auth(agent.post('/api/v1/purchases/receiving')).send({
    supplierId: state.supplierId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-01',
  });
  state.receivingId = receiving.body.data.id;
  await auth(agent.post(`/api/v1/purchases/receiving/${state.receivingId}/lines`)).send({
    modelId: state.modelId,
    sizeId: state.sizeId,
    quantity: 3,
    purchasePrice: 1000,
  });
  const receivingPosted = await auth(
    agent.post(`/api/v1/purchases/receiving/${state.receivingId}/post`),
  );
  state.batchId = receivingPosted.body.data.batchId;
  const instances = await models.Instance.findAll({ where: { modelId: state.modelId } });
  state.instanceIds = instances.map((instance) => instance.id);

  const issuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-15',
  });
  state.issuanceId = issuance.body.data.id;
  await auth(agent.post(`/api/v1/issuance/documents/${state.issuanceId}/lines`)).send({
    modelId: state.modelId,
    sizeId: state.sizeId,
    quantity: 2,
  });
  await auth(agent.post(`/api/v1/issuance/documents/${state.issuanceId}/post`));

  return {
    state,
    employee: employee.body.data,
    model: model.body.data,
    dpo: dpo.body.data,
    price,
  };
}

// Вторая выдача другому периоду цены (2000 руб. с 20.07.2026) — сценарий для
// проверки исторического ценового снимка (релиз 12): выдачи до и после смены
// цены должны сохранять свою цену на момент проведения.
export async function addSecondPriceAndIssuance({ agent, auth, state, model }) {
  const secondPriceSource = await models.SourceImportRecord.create({
    sourceKey: `print-form-second-price-${uniqueKey()}`,
    sourceFile: 'second-price.xlsx',
    fileHash: '9'.repeat(64),
    recordType: 'price',
    sheetName: 'Тест',
    rowNumber: 2,
    payload: { test: true },
  });
  state.sourceRecordIds.push(secondPriceSource.id);
  const secondPrice = await models.NomenclaturePrice.create({
    modelId: model.id,
    dpoId: state.dpoId,
    sourceRecordId: secondPriceSource.id,
    effectiveDate: '2026-07-20',
    priceWithoutVat: 2000,
    vatRate: 5,
    priceWithVat: 2100,
  });
  const secondIssuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-25',
  });
  state.secondIssuanceId = secondIssuance.body.data.id;
  await auth(agent.post(`/api/v1/issuance/documents/${state.secondIssuanceId}/lines`)).send({
    modelId: model.id,
    sizeId: state.sizeId,
    quantity: 1,
  });
  await auth(agent.post(`/api/v1/issuance/documents/${state.secondIssuanceId}/post`));
  return { secondPrice };
}

export async function createPartyVersion({ agent, auth, state, effectiveDate, overrides = {} }) {
  const response = await auth(agent.post('/api/v1/print-form-settings/parties')).send({
    role: 'executor',
    effectiveDate,
    fullName: 'ООО «Тестовый исполнитель»',
    shortName: 'ООО «Тест»',
    inn: '1234567890',
    kpp: '123456789',
    address: 'Тестовый адрес, дом 1',
    okpo: '12345678',
    directorFullName: 'Сидоров Сидор Сидорович',
    directorPosition: 'Генеральный директор',
    directorBasis: 'Устава',
    ...overrides,
  });
  state.partyVersionIds.push(response.body.data.id);
  return response;
}

export async function createReturnDocument({ agent, auth, state, instanceId, documentDate }) {
  const draft = await auth(agent.post('/api/v1/issuance/returns')).send({
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate,
  });
  state.returnId = draft.body.data.id;
  await auth(agent.post(`/api/v1/issuance/returns/${state.returnId}/lines`)).send({
    instanceId,
    condition: 'good',
  });
  return auth(agent.post(`/api/v1/issuance/returns/${state.returnId}/post`));
}

export async function createArchiveRecord({
  state,
  sourceKeyPrefix,
  sourceFile,
  sheetName,
  rowNumber,
  payload,
}) {
  const record = await models.SourceImportRecord.create({
    sourceKey: `${sourceKeyPrefix}-${uniqueKey()}`,
    sourceFile,
    fileHash: uniqueKey().padEnd(64, '0').slice(0, 64),
    recordType: 'normalized_candidate',
    sheetName,
    rowNumber: rowNumber ?? null,
    payload,
  });
  state.sourceRecordIds.push(record.id);
  return record;
}

// Снимает выданные экземпляры и документы выдачи/возврата, оставляя только
// склад/номенклатуру/ДПО/работника — так проверяется, что печатная форма
// переключается на архивные строки, когда живых документов уже нет.
export async function destroyLiveIssuanceState(state) {
  await models.StockMovement.destroy({ where: { instanceId: state.instanceIds } });
  if (state.returnId) {
    await models.ReturnDocument.destroy({ where: { id: state.returnId } });
    state.returnId = null;
  }
  if (state.issuanceId) {
    await models.IssuanceDocument.destroy({ where: { id: state.issuanceId } });
    state.issuanceId = null;
  }
  if (state.secondIssuanceId) {
    await models.IssuanceDocument.destroy({ where: { id: state.secondIssuanceId } });
    state.secondIssuanceId = null;
  }
  await models.Instance.destroy({ where: { id: state.instanceIds } });
  state.instanceIds = [];
}
