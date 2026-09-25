import { test, expect, request } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const ExcelJS = require('exceljs');

test('Р3: оба комплекта без повторной общей вещи, скачивание сохранки конкретной выдачи', async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: process.env.E2E_API_URL });
  try {
    const credentials = {
      login: process.env.BOOTSTRAP_ADMIN_LOGIN,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    };
    const session = (await (await api.post('auth/login', { data: credentials })).json()).data;
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    async function post(url, data, status = 201) {
      const response = await api.post(url, { headers, data });
      expect(response.status(), await response.text()).toBe(status);
      return (await response.json()).data;
    }
    const key = Date.now();
    const org = await post('organizations', { name: `Р3 ${key}` });
    const dpo = await post('dpo', { name: `Р3 ДПО ${key}`, fullName: `Р3 Дирекция ${key}` });
    const position = await post('positions', { name: `Р3 должность ${key}` });
    const warehouse = await post('warehouses', { organizationId: org.id, name: `Р3 склад ${key}` });
    const supplier = await post('suppliers', { name: `Р3 поставщик ${key}` });
    const employee = await post('employees', {
      organizationId: org.id,
      dpoId: dpo.id,
      positionId: position.id,
      fullName: `Р3 работник ${key}`,
    });
    const model = await post('nomenclature-models', { name: `Р3 бейдж ${key}` });
    // Общая модель в обоих комплектах не должна удваиваться при последовательном подборе.
    for (const season of ['summer', 'winter']) {
      await post('kits', { positionId: position.id, modelId: model.id, quantity: 2, season });
    }
    const receipt = await post('purchases/receiving', {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      documentDate: '2026-09-24',
    });
    await post(`purchases/receiving/${receipt.id}/lines`, { modelId: model.id, quantity: 3 });
    await post(`purchases/receiving/${receipt.id}/post`, {}, 200);
    const issue = await post('issuance/documents', {
      employeeId: employee.id,
      warehouseId: warehouse.id,
      documentDate: '2026-09-24',
    });
    for (const season of ['summer', 'winter', 'summer'])
      await post(`issuance/documents/${issue.id}/apply-kit`, { season }, 200);
    const posted = await post(`issuance/documents/${issue.id}/post`, {}, 200);
    expect(posted.lines).toHaveLength(1);
    expect(posted.lines[0].quantity).toBe(2);
    const second = await post('issuance/documents', {
      employeeId: employee.id,
      warehouseId: warehouse.id,
      documentDate: '2026-09-24',
    });
    await post(`issuance/documents/${second.id}/lines`, { modelId: model.id, quantity: 1 });
    await post(`issuance/documents/${second.id}/post`, {}, 200);
    await page.goto('/login');
    await page.getByLabel('Логин').fill(credentials.login);
    await page.getByLabel('Пароль').fill(credentials.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
    await page.goto(`/issuance/documents/${issue.id}`);
    for (let repeat = 0; repeat < 2; repeat++) {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Сохранная расписка Excel', exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/^Сохранная_расписка.*\.xlsx$/);
      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(await download.path());
      expect(book.worksheets[0].getCell('D5').value).toBe(model.name);
      expect(book.worksheets[0].getCell('F5').value).toBe(2);
      expect(book.worksheets[0].getCell('D6').value).toBeNull();
    }
  } finally {
    await api.dispose();
  }
});
