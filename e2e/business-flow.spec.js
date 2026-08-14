import { test, expect, request as playwrightRequest } from '@playwright/test';

async function expectJson(response, status = 200) {
  const body = await response.text();
  expect(response.status(), body).toBe(status);
  return JSON.parse(body).data;
}

test('сквозной цикл: работник → комплект → документы → сервис → инвентаризация → списание → отчёт', async ({
  page,
}) => {
  const api = await playwrightRequest.newContext({ baseURL: process.env.E2E_API_URL });
  const relative = (url) => url.replace(/^\//, '');
  const loginResponse = await api.post('auth/login', {
    data: {
      login: process.env.BOOTSTRAP_ADMIN_LOGIN,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    },
  });
  const session = await expectJson(loginResponse);
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const post = (url, data) => api.post(relative(url), { headers, data });
  const get = (url, params) => api.get(relative(url), { headers, params });

  const suffix = Date.now();
  const organization = await expectJson(
    await post('/organizations', { name: `E2E Организация ${suffix}` }),
    201,
  );
  const dpo = await expectJson(
    await post('/dpo', {
      name: `E2E ДПО ${suffix}`,
      fullName: `Дирекция пассажирских обустройств E2E ${suffix}`,
    }),
    201,
  );
  const position = await expectJson(
    await post('/positions', { name: `E2E Дежурный ${suffix}` }),
    201,
  );
  const warehouse = await expectJson(
    await post('/warehouses', {
      organizationId: organization.id,
      name: `E2E Склад ${suffix}`,
      code: `E2E-${suffix}`,
    }),
    201,
  );
  const supplier = await expectJson(
    await post('/suppliers', { name: `E2E Поставщик ${suffix}` }),
    201,
  );
  const size = await expectJson(
    await post('/sizes', { type: 'clothing', value: `E2E-${suffix}` }),
    201,
  );
  const model = await expectJson(
    await post('/nomenclature-models', {
      name: `E2E Куртка ${suffix}`,
      article: `E2E-${suffix}`,
      sizeType: 'clothing',
    }),
    201,
  );
  const employee = await expectJson(
    await post('/employees', {
      organizationId: organization.id,
      dpoId: dpo.id,
      positionId: position.id,
      fullName: `Иванов Иван E2E ${suffix}`,
      personnelNumber: `E2E-${suffix}`,
      hireDate: '2026-01-01',
      gender: 'male',
      clothingSizeId: size.id,
    }),
    201,
  );
  await expectJson(
    await post('/kits', {
      positionId: position.id,
      modelId: model.id,
      season: 'summer',
      gender: 'male',
      quantity: 1,
      serviceLifeYears: 2,
    }),
    201,
  );

  const receiving = await expectJson(
    await post('/purchases/receiving', {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      documentDate: '2026-08-01',
    }),
    201,
  );
  await expectJson(
    await post(`/purchases/receiving/${receiving.id}/lines`, {
      modelId: model.id,
      sizeId: size.id,
      quantity: 2,
      purchasePrice: 1200,
      employeeCost: 600,
    }),
    201,
  );
  await expectJson(await post(`/purchases/receiving/${receiving.id}/post`));
  const revisedReceiving = await expectJson(
    await post(`/purchases/receiving/${receiving.id}/revise`, {
      header: {
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        documentDate: '2026-08-02',
      },
      lines: [
        {
          modelId: model.id,
          sizeId: size.id,
          quantity: 2,
          purchasePrice: 1250,
          employeeCost: 625,
        },
      ],
      reason: 'Уточнена цена при приёмке',
    }),
  );
  expect(revisedReceiving.revisionNumber).toBe(2);

  const issuance = await expectJson(
    await post('/issuance/documents', {
      employeeId: employee.id,
      warehouseId: warehouse.id,
      documentDate: '2026-08-03',
    }),
    201,
  );
  const kitApplied = await expectJson(
    await post(`/issuance/documents/${issuance.id}/apply-kit`, { season: 'summer' }),
  );
  expect(kitApplied.lines).toHaveLength(1);
  await expectJson(await post(`/issuance/documents/${issuance.id}/post`));
  const revisedIssuance = await expectJson(
    await post(`/issuance/documents/${issuance.id}/revise`, {
      header: {
        employeeId: employee.id,
        warehouseId: warehouse.id,
        documentDate: '2026-08-04',
      },
      lines: [{ modelId: model.id, sizeId: size.id, quantity: 1 }],
      reason: 'Исправлена дата выдачи',
    }),
  );
  expect(revisedIssuance.revisionNumber).toBe(2);

  await page.goto('/login');
  await page.getByLabel('Логин').fill(process.env.BOOTSTRAP_ADMIN_LOGIN);
  await page.getByLabel('Пароль').fill(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  await page.goto(`/issuance/documents/${issuance.id}`);
  await expect(page.getByRole('button', { name: 'Сохранная расписка Excel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранная расписка PDF' })).toBeVisible();
  const receiptDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранная расписка Excel' }).click();
  const receiptDownload = await receiptDownloadPromise;
  expect(receiptDownload.suggestedFilename()).toMatch(/preservation-receipt.*\.xlsx$/i);

  let instances = await expectJson(await get('/instances', { limit: 100 }));
  const issued = instances.find((item) => item.modelId === model.id && item.status === 'issued');
  expect(issued).toBeTruthy();

  const returnDocument = await expectJson(
    await post('/issuance/returns', {
      employeeId: employee.id,
      warehouseId: warehouse.id,
      documentDate: '2026-08-05',
    }),
    201,
  );
  await expectJson(
    await post(`/issuance/returns/${returnDocument.id}/lines`, {
      instanceId: issued.id,
      condition: 'good',
      routeTo: 'in_stock',
    }),
    201,
  );
  await expectJson(await post(`/issuance/returns/${returnDocument.id}/post`));

  const laundry = await expectJson(
    await post('/laundry/documents', {
      warehouseId: warehouse.id,
      documentDate: '2026-08-06',
    }),
    201,
  );
  await expectJson(
    await post(`/laundry/documents/${laundry.id}/lines`, { instanceId: issued.id }),
    201,
  );
  const laundrySent = await expectJson(await post(`/laundry/documents/${laundry.id}/send`));
  await expectJson(
    await post(`/laundry/documents/${laundry.id}/complete`, {
      lines: [{ lineId: laundrySent.lines[0].id, conditionAfter: 'good' }],
    }),
  );

  const repair = await expectJson(
    await post('/repair/documents', {
      warehouseId: warehouse.id,
      documentDate: '2026-08-07',
    }),
    201,
  );
  await expectJson(
    await post(`/repair/documents/${repair.id}/lines`, { instanceId: issued.id }),
    201,
  );
  const repairSent = await expectJson(await post(`/repair/documents/${repair.id}/send`));
  await expectJson(
    await post(`/repair/documents/${repair.id}/complete`, {
      lines: [{ lineId: repairSent.lines[0].id, conditionAfter: 'good', cost: 150 }],
    }),
  );

  const reissue = await expectJson(
    await post('/issuance/documents', {
      employeeId: employee.id,
      warehouseId: warehouse.id,
      documentDate: '2026-08-08',
    }),
    201,
  );
  await expectJson(
    await post(`/issuance/documents/${reissue.id}/lines`, {
      modelId: model.id,
      sizeId: size.id,
      quantity: 1,
    }),
    201,
  );
  await expectJson(await post(`/issuance/documents/${reissue.id}/post`));

  const inventory = await expectJson(
    await post('/inventory/documents', {
      warehouseId: warehouse.id,
      documentDate: '2026-08-09',
    }),
    201,
  );
  expect(inventory.lines.length).toBeGreaterThan(0);
  for (const line of inventory.lines) {
    await expectJson(
      await api.patch(relative(`/inventory/documents/${inventory.id}/lines/${line.id}`), {
        headers,
        data: { confirmed: true },
      }),
    );
  }
  await expectJson(await post(`/inventory/documents/${inventory.id}/complete`));

  instances = await expectJson(await get('/instances', { limit: 100 }));
  const remaining = instances.find(
    (item) => item.modelId === model.id && item.status === 'in_stock',
  );
  expect(remaining).toBeTruthy();
  const adjustment = await expectJson(
    await post('/adjustments/documents', {
      warehouseId: warehouse.id,
      documentDate: '2026-08-10',
    }),
    201,
  );
  await expectJson(
    await post(`/adjustments/documents/${adjustment.id}/lines`, {
      adjustmentType: 'condition',
      instanceId: remaining.id,
      toCondition: 'damaged',
      reason: 'Уточнение состояния после инвентаризации',
    }),
    201,
  );
  await expectJson(await post(`/adjustments/documents/${adjustment.id}/post`));

  const writeoff = await expectJson(
    await post('/writeoff/documents', {
      warehouseId: warehouse.id,
      documentDate: '2026-08-11',
    }),
    201,
  );
  await expectJson(
    await post(`/writeoff/documents/${writeoff.id}/lines`, {
      instanceId: remaining.id,
      reason: 'Повреждение подтверждено комиссией',
    }),
    201,
  );
  await expectJson(await post(`/writeoff/documents/${writeoff.id}/post`));

  const report = await api.get('reports/employees', {
    headers,
    params: { dpoId: dpo.id, from: '2026-08-01', to: '2026-08-31' },
  });
  expect(report.status()).toBe(200);
  const printForm = await api.get('print-forms/personal-card', {
    headers,
    params: { employeeId: employee.id, format: 'xlsx' },
  });
  expect(printForm.status()).toBe(200);
  expect(
    Buffer.from(await printForm.body())
      .subarray(0, 2)
      .toString(),
  ).toBe('PK');
  await api.dispose();
});
