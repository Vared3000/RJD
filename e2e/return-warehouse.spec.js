import { test, expect, request } from '@playwright/test';

test('Р2: склад возврата выбирается в форме, новое автоматически направляется на Основной', async ({
  page,
}) => {
  const api = await request.newContext({ baseURL: process.env.E2E_API_URL });
  try {
    const credentials = {
      login: process.env.BOOTSTRAP_ADMIN_LOGIN,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    };
    const login = await api.post('auth/login', { data: credentials });
    const session = (await login.json()).data;
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    async function post(path, data, status = 201) {
      const response = await api.post(path, { headers, data });
      expect(response.status(), await response.text()).toBe(status);
      return (await response.json()).data;
    }
    const key = Date.now();
    const org = await post('organizations', { name: `Р2 организация ${key}` });
    const main = await post('warehouses', {
      organizationId: org.id,
      name: `Основной ${key}`,
      isPrimaryForReturns: true,
    });
    const returns = await post('warehouses', { organizationId: org.id, name: `Возвратный ${key}` });
    const supplier = await post('suppliers', { name: `Р2 поставщик ${key}` });
    const employee = await post('employees', {
      organizationId: org.id,
      fullName: `Р2 работник ${key}`,
      hireDate: '2026-01-01',
    });
    const model = await post('nomenclature-models', { name: `Р2 бейдж ${key}` });
    const receipt = await post('purchases/receiving', {
      supplierId: supplier.id,
      warehouseId: main.id,
      documentDate: '2026-09-24',
    });
    await post(`purchases/receiving/${receipt.id}/lines`, { modelId: model.id, quantity: 2 });
    await post(`purchases/receiving/${receipt.id}/post`, {}, 200);
    const issue = await post('issuance/documents', {
      employeeId: employee.id,
      warehouseId: main.id,
      documentDate: '2026-09-24',
    });
    await post(`issuance/documents/${issue.id}/lines`, { modelId: model.id, quantity: 2 });
    await post(`issuance/documents/${issue.id}/post`, {}, 200);
    const document = await post('issuance/returns', {
      employeeId: employee.id,
      warehouseId: main.id,
      documentDate: '2026-09-25',
    });
    await page.goto('/login');
    await page.getByLabel('Логин').fill(credentials.login);
    await page.getByLabel('Пароль').fill(credentials.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
    await page.goto(`/issuance/returns/${document.id}`);
    await page.getByRole('button', { name: '+ Выбрать вещи' }).click();
    await page.getByRole('checkbox').first().check();
    await page.getByLabel('Склад назначения').selectOption(returns.id);
    await page.getByRole('button', { name: 'Добавить выбранные (1)' }).click();
    await expect(page.getByRole('cell', { name: returns.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Вернуть всё', exact: true }).click();
    await page.getByLabel('Состояние при возврате').selectOption('new');
    await expect(page.getByLabel('Склад назначения')).toHaveValue(main.id);
    await expect(page.getByLabel('Склад назначения')).toBeDisabled();
    await page.getByRole('button', { name: 'Добавить выбранные (1)' }).click();
    await page.getByRole('button', { name: 'Провести', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Провести', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Вернуть всё', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('cell', { name: returns.name, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: main.name, exact: true })).toBeVisible();
  } finally {
    await api.dispose();
  }
});
