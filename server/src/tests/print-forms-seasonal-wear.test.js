// Требует применённых миграций и сида.
import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';
import { loadContext } from '../modules/print-forms/shared/load-context.js';
import { buildFpu26 } from '../modules/print-forms/fpu-26/fpu-26.builder.js';
import { buildAppendix15 } from '../modules/print-forms/appendix-1-5/appendix-1-5.builder.js';
import { buildAppendix17 } from '../modules/print-forms/appendix-1-7/appendix-1-7.builder.js';
import { loadUpdContext, buildUpd } from '../modules/print-forms/upd/upd.builder.js';
import { monthlyRentalService } from '../modules/print-forms/monthly-rental-act/monthly-rental-act.service.js';
import { setupApp, setupBaseFixture, cleanupFixtureState } from './print-forms-fixture.js';

test('С2: оба комплекта выданы сразу, а расчётные формы разделяют их по месяцам', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) return t.skip('Не задан пароль тестового администратора');
  const { agent, auth } = await setupApp();
  const unique = `Seasonal S2 ${Date.now()}`;
  const { state } = await setupBaseFixture({
    agent,
    auth,
    unique,
    receivingDate: '2026-01-02',
    issuanceDate: '2026-01-10',
    modelInput: {
      name: `${unique} зимнее`,
      rentalPrice: 975.6762,
      wearMonths: [1, 2, 3, 11, 12],
    },
    additionalModelInput: { rentalPrice: 354.334, wearMonths: [4, 5, 6, 7, 8, 9, 10] },
  });
  t.after(() => cleanupFixtureState(state));

  const period = (month) => ({
    dpoId: state.dpoId,
    from: `2026-${month}-01`,
    to: `2026-${month}-${month === '01' || month === '07' ? '31' : '30'}`,
  });
  const names = (rows) => rows.map((row) => row.modelName);

  const january = await loadContext(period('01'));
  const januaryFpu = buildFpu26(january);
  const january15 = await buildAppendix15(january);
  const january17 = await buildAppendix17(january);
  const januaryUpd = buildUpd(await loadUpdContext(period('01')));
  assert.deepEqual(names(januaryFpu.rows), [`${unique} зимнее`]);
  assert.deepEqual(names(january15.rows), [`${unique} зимнее`]);
  assert.deepEqual(names(januaryUpd.rows), [`${unique} зимнее`]);
  assert.deepEqual(names(january17.rows), [`${unique} зимнее`, `${unique} летнее`]);
  assert.equal(januaryFpu.rows[0].quantity, 1);
  assert.equal(january15.rows[0].quantity, 1);
  assert.ok(january17.rows.every((row) => row.quantity === 1));
  assert.equal(januaryUpd.rows[0].quantity, 1);
  for (const key of ['costWithoutVat', 'vatAmount', 'totalWithVat']) {
    assert.equal(januaryFpu.totals[key], january15.totals[key]);
  }
  for (const key of ['costWithoutVat', 'vatAmount', 'totalWithVat']) {
    assert.equal(januaryUpd.totals[key], januaryFpu.totals[key]);
  }
  const january17Winter = january17.rows.find((row) => row.modelName.endsWith('зимнее'));
  assert.equal(january17Winter.priceWithoutVat, 975.6762);
  assert.equal(january17Winter.subtotalWithoutVat, januaryFpu.rows[0].costWithoutVat);
  assert.equal(january17Winter.vatAmount, januaryFpu.rows[0].vatAmount);
  assert.equal(january17Winter.totalWithVat, januaryFpu.rows[0].totalWithVat);
  assert.equal(januaryFpu.rows[0].rentalDays, 31, 'часть месяца оплачивается как полный месяц');

  const july = await loadContext(period('07'));
  assert.equal(july.documents.length, 0, 'в июле нет новой выдачи');
  assert.deepEqual(names(buildFpu26(july).rows), [`${unique} летнее`]);
  assert.deepEqual(names((await buildAppendix15(july)).rows), [`${unique} летнее`]);
  assert.deepEqual(names(buildUpd(await loadUpdContext(period('07'))).rows), [`${unique} летнее`]);

  const januaryAct = await monthlyRentalService.preview({ dpoId: state.dpoId, month: '2026-01' });
  const julyAct = await monthlyRentalService.preview({ dpoId: state.dpoId, month: '2026-07' });
  assert.equal(januaryAct.rows.length, 2);
  assert.ok(
    januaryAct.rows.every((row) => row.modelName.endsWith('зимнее') && row.rentalDays === 22),
  );
  assert.equal(julyAct.rows.length, 2);
  assert.ok(julyAct.rows.every((row) => row.modelName.endsWith('летнее') && row.rentalDays === 31));

  await models.NomenclatureModel.update(
    { wearMonths: [1, 2, 3] },
    { where: { id: state.additionalModelId } },
  );
  assert.equal(
    (await monthlyRentalService.preview({ dpoId: state.dpoId, month: '2026-07' })).rows.length,
    2,
    'проведённая выдача хранит свой снимок месяцев',
  );

  const revised = await auth(
    agent.post(`/api/v1/issuance/documents/${state.issuanceId}/revise`),
  ).send({
    header: {
      employeeId: state.employeeId,
      warehouseId: state.warehouseId,
      documentDate: '2026-01-10',
      note: 'Проверка снимка сезонности',
    },
    lines: [
      { modelId: state.modelId, sizeId: state.sizeId, quantity: 2 },
      { modelId: state.additionalModelId, sizeId: state.sizeId, quantity: 2 },
    ],
    reason: 'Тест сезонности',
  });
  assert.equal(revised.status, 200);
  assert.equal(
    (await monthlyRentalService.preview({ dpoId: state.dpoId, month: '2026-07' })).rows.length,
    0,
    'перепроведение получает новый снимок месяцев',
  );
});
