import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Логин').fill(process.env.BOOTSTRAP_ADMIN_LOGIN);
  await page.getByLabel('Пароль').fill(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
}

test('администратор входит, ищет раздел и скачивает шаблон стартового импорта', async ({
  page,
}) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  const search = page.getByRole('searchbox', { name: 'Поиск по меню' });
  await search.fill('стартовый импорт');
  await nav.getByRole('link', { name: 'Стартовый импорт' }).click();
  await expect(page.getByRole('heading', { name: 'Стартовый импорт' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать шаблон Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);

  await search.fill('штрихкод');
  await expect(nav.getByText('Ничего не найдено')).toBeVisible();
});

test('редкие складские операции доступны в разделе «Дополнительно»', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  await nav.getByRole('button', { name: /Дополнительно/i }).click();
  await expect(nav.getByRole('link', { name: 'Перемещение' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Инвентаризация' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Корректировка' })).toBeVisible();
});
