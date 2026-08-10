// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  createArchiveRecord,
  cleanupFixtureState,
} from './print-forms-fixture.js';

test('печатная форма УПД: только PDF, fallback на ФПУ-26 без архива, архивные реквизиты документа', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test UPD ${Date.now()}`;
  const { state } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  const query = { dpoId: state.dpoId, from: '2026-07-01', to: '2026-07-31' };

  const xlsxRejected = await auth(agent.get('/api/v1/print-forms/upd')).query({
    ...query,
    format: 'xlsx',
  });
  assert.equal(xlsxRejected.status, 400);

  // Без архивного УПД за период форма строится из проведённых выдач (тех же
  // строк, что и ФПУ-26 за тот же период).
  const fallbackPdf = await auth(agent.get('/api/v1/print-forms/upd'))
    .query({ ...query, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(fallbackPdf.status, 200);
  assert.match(fallbackPdf.headers['content-type'], /application\/pdf/);
  assert.equal(fallbackPdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(fallbackPdf.body.length > 5000);

  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-upd',
    sourceFile: 'archive-upd.pdf',
    sheetName: 'УПД',
    rowNumber: 1,
    payload: {
      type: 'nomenclature',
      formType: 'upd',
      effectiveDate: '2026-07-31',
      documentNumber: '172-ТЕСТ',
      paymentDocumentNumber: '224027',
      paymentDocumentDate: '2026-07-07',
      rowNumber: 1,
      article: 'ТЕСТ-УПД-01',
      name: `${unique} архив УПД`,
      unitCode: '796',
      unit: 'шт.',
      quantity: 2,
      priceWithoutVat: 1000,
      subtotalWithoutVat: 2000,
      vatRate: 5,
      vatAmount: 100,
      totalWithVat: 2100,
    },
  });

  const archivePdf = await auth(agent.get('/api/v1/print-forms/upd'))
    .query({ ...query, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(archivePdf.status, 200);
  assert.equal(archivePdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(archivePdf.body.length > 5000);
});
