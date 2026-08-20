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

test('складские операции собраны в одном разделе', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  await nav.getByRole('button', { name: /Склад/i }).click();
  const batchesLink = nav.getByRole('link', { name: /Партии/i });
  await expect(batchesLink).toBeVisible();
  await expect(nav.getByRole('link', { name: /Перемещения/i })).toBeVisible();
  await expect(nav.getByRole('link', { name: /Инвентаризации/i })).toBeVisible();
  await expect(nav.getByRole('link', { name: /Корректировки/i })).toBeVisible();

  await batchesLink.click();
  await expect(page.getByRole('heading', { name: 'Партии' })).toBeVisible();
  await expect(page.getByPlaceholder('Код партии, поставщик или примечание…')).toBeVisible();
});

test('конструктор предлагает все поддерживаемые печатные формы', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Основное меню' });
  await nav.getByRole('button', { name: /Настройки/i }).click();
  await nav.getByRole('link', { name: 'Шаблоны печати' }).click();
  await expect(
    page.getByRole('heading', { name: 'Конструктор макетов печатных форм' }),
  ).toBeVisible();

  const formSelect = page.getByLabel('Печатная форма');
  await expect(formSelect.locator('option')).toHaveText([
    'Выберите…',
    'ФПУ-26',
    'Приложение 1.5',
    'Приложение 1.7',
    'Личная карточка работника',
    'Сохранная расписка',
  ]);
});
