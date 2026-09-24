import { test, expect, request } from '@playwright/test';

test('Р1: при нулевом остатке кнопка создаёт задачи без сохранной расписки', async ({ page }) => {
  const api = await request.newContext({ baseURL: process.env.E2E_API_URL });
  const credentials = {
    login: process.env.BOOTSTRAP_ADMIN_LOGIN,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  };
  try {
    const login = await api.post('auth/login', { data: credentials });
    expect(login.status()).toBe(200);
    const session = (await login.json()).data;
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const create = async (path, data) => {
      const res = await api.post(path, { headers, data });
      expect(res.status(), await res.text()).toBe(201);
      return (await res.json()).data;
    };
    const suffix = Date.now();
    const organization = await create('organizations', { name: `Р1 организация ${suffix}` });
    const warehouse = await create('warehouses', {
      name: `Р1 склад ${suffix}`,
      organizationId: organization.id,
    });
    const employee = await create('employees', {
      fullName: `Р1 работник ${suffix}`,
      organizationId: organization.id,
      hireDate: '2026-01-01',
    });
    const model = await create('nomenclature-models', { name: `Р1 бейдж ${suffix}` });
    const draft = await create('issuance/documents', {
      employeeId: employee.id,
      warehouseId: warehouse.id,
      documentDate: '2026-09-24',
    });
    await create(`issuance/documents/${draft.id}/lines`, { modelId: model.id, quantity: 2 });
    await page.goto('/login');
    await page.getByLabel('Логин').fill(credentials.login);
    await page.getByLabel('Пароль').fill(credentials.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
    await page.goto(`/issuance/documents/${draft.id}`);
    await expect(
      page.getByText('К выдаче: 0 шт. На доукомплектовку: 2 шт.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Скачать лист сборки' })).toBeDisabled();
    await page.getByRole('button', { name: 'Создать задачи', exact: true }).click();
    await page.getByRole('button', { name: 'Провести', exact: true }).click();
    await expect(
      page.getByText('Обработан без выдачи — доукомплектовка в задачах', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Сохранная расписка Excel' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Со склада ничего не списано.', { exact: false })).toBeVisible();
    await page.goto('/issuance/tasks');
    await page.getByRole('cell', { name: new RegExp(employee.fullName) }).click();
    await expect(page.getByText(model.name, { exact: true })).toBeVisible();
  } finally {
    await api.dispose();
  }
});
