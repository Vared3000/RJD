import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalCard } from '../modules/print-forms/personal-card/personal-card.builder.js';
import { buildPreservationReceipt } from '../modules/print-forms/preservation-receipt/preservation-receipt.builder.js';

function fixture() {
  const model = { id: 'coat', name: 'Плащ', unit: 'шт.' };
  const movement = (id, overrides = {}) => ({
    id,
    documentId: 'issue',
    wearMonthsSnapshot: [4, 5, 6],
    instance: { id, model, modelId: model.id, sizeId: '52', heightSizeId: '182' },
    ...overrides,
  });
  return {
    model,
    movement,
    context: {
      employee: { id: 'employee', fullName: 'Работник', hireDate: '2026-01-01' },
      dpo: {},
      fromText: '2026-01-01',
      toText: '2026-09-25',
      issuanceDocuments: [{ id: 'issue', documentDate: '2026-09-01' }],
      returnDocuments: [],
      importedPersonalCard: [],
      kitItems: [{ modelId: model.id, model, quantity: 2, serviceLifeYears: 4 }],
      movements: [movement('one'), movement('two')],
    },
  };
}

test('Р3: 31 экземпляр 22 моделей — 22 строки, фактическое количество 31, без невыданного комплекта', () => {
  const { context, movement } = fixture();
  context.movements = [];
  for (let n = 0; n < 22; n++) {
    const model = { id: `model-${n}`, name: `Вещь ${n}`, unit: 'шт.' };
    for (let copy = 0; copy < (n < 9 ? 2 : 1); copy++) {
      const id = `instance-${n}-${copy}`;
      context.movements.push(
        movement(id, { instance: { id, model, sizeId: '52', heightSizeId: '182' } }),
      );
    }
  }
  const rows = buildPersonalCard(context).rows;
  assert.equal(rows.length, 22);
  assert.equal(
    rows.reduce((sum, row) => sum + row.issuedQuantity, 0),
    31,
  );
  assert.ok(rows.every((row) => row.issuedQuantity > 0));
  context.movements = context.movements.filter((row) => row.instance.id.endsWith('-0'));
  assert.equal(buildPersonalCard(context).rows.length, 22);
  assert.equal(
    buildPersonalCard(context).rows.reduce((sum, row) => sum + row.issuedQuantity, 0),
    22,
  );
});

test('Р3: повтор движения не удваивает вещь; разные размеры и выдачи не теряются', () => {
  const { context, movement, model } = fixture();
  context.movements.push(context.movements[0]);
  assert.equal(buildPersonalCard(context).rows.length, 1);
  assert.equal(buildPersonalCard(context).rows[0].issuedQuantity, 2);
  context.movements.push(
    movement('three', { instance: { id: 'three', model, sizeId: '54', heightSizeId: '182' } }),
  );
  context.issuanceDocuments.push({ id: 'second', documentDate: '2026-09-02' });
  context.movements.push(movement('one', { documentId: 'second' }));
  const rows = buildPersonalCard(context).rows;
  assert.equal(rows.length, 3);
  assert.equal(
    rows.reduce((sum, row) => sum + row.issuedQuantity, 0),
    4,
  );
});

test('Р3: частичный возврат сохраняет отдельные строки и норматив носки', () => {
  const { context } = fixture();
  context.returnDocuments.push({ documentDate: '2026-09-05', lines: [{ instanceId: 'one' }] });
  const rows = buildPersonalCard(context).rows;
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce((sum, row) => sum + row.issuedQuantity, 0),
    2,
  );
  assert.equal(
    rows.reduce((sum, row) => sum + (row.returnedQuantity ?? 0), 0),
    1,
  );
  assert.ok(rows.every((row) => row.serviceLifeYears === 4));
  assert.equal(rows.find((row) => row.returnedQuantity).returnedDate, '2026-09-05');
});

test('Р3: сохранка агрегирует физическое количество, не смешивает работников и не подмешивает комплект', async () => {
  const { model } = fixture();
  const document = (employeeId) => ({
    id: employeeId,
    employeeId,
    employee: { fullName: 'Однофамилец', personnelNumber: employeeId },
    lines: [{ id: `${employeeId}-one`, modelId: model.id, model, quantity: 2 }],
  });
  const data = await buildPreservationReceipt({
    dpo: {},
    documents: [document('one'), document('two')],
    kitItems: [{ modelId: 'unissued' }],
  });
  assert.equal(data.rows.length, 2);
  assert.deepEqual(
    data.rows.map((row) => row.quantity),
    [2, 2],
  );
});
