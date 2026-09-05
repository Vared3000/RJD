import { LAUNDRY_REPAIR_ENABLED } from '../../shared/config/features.js';

const LAUNDRY_REPAIR_PATHS = new Set([
  '/laundry/documents',
  '/repair/documents',
  '/reports/repairs',
]);

export const NAV_SECTIONS = [
  {
    icon: '⌂',
    items: [{ to: '/', label: 'Главная', icon: '⌂', end: true }],
  },
  {
    title: 'Рабочий день',
    icon: '↻',
    items: [
      {
        to: '/purchases/receiving',
        label: 'Поступления',
        icon: '↓',
        permission: 'purchases.manage',
      },
      { to: '/issuance/documents', label: 'Выдачи', icon: '→', permission: 'issuance.manage' },
      { to: '/issuance/returns', label: 'Возвраты', icon: '←', permission: 'issuance.manage' },
      {
        to: '/issuance/tasks',
        label: 'Задачи',
        icon: '✎',
        permission: 'issuance.manage',
        badge: 'issuance-open-tasks',
      },
      { to: '/laundry/documents', label: 'Стирка', icon: '≈', permission: 'laundry.manage' },
      { to: '/repair/documents', label: 'Ремонт', icon: '◇', permission: 'repair.manage' },
    ],
  },
  {
    title: 'Склад',
    icon: '▦',
    items: [
      { to: '/warehouses/balances', label: 'Остатки', icon: '▦', permission: 'warehouse.view' },
      { to: '/warehouses/movements', label: 'Движения', icon: '⇄', permission: 'warehouse.view' },
      { to: '/purchases/batches', label: 'Партии', icon: '▤', permission: 'warehouse.view' },
      {
        to: '/transfers/documents',
        label: 'Перемещения',
        icon: '⇆',
        permission: 'transfers.manage',
      },
      {
        to: '/inventory/documents',
        label: 'Инвентаризации',
        icon: '✓',
        permission: 'inventory.manage',
      },
      {
        to: '/adjustments/documents',
        label: 'Корректировки',
        icon: '±',
        permission: 'adjustments.manage',
      },
      { to: '/writeoff/documents', label: 'Списания', icon: '×', permission: 'writeoff.manage' },
    ],
  },
  {
    title: 'Работники',
    icon: '♙',
    items: [
      { to: '/employees', label: 'Список работников', icon: '♙', permission: 'employees.view' },
      {
        to: '/employees/kits',
        label: 'Комплекты должностей',
        icon: '▣',
        permission: 'employees.view',
      },
      { to: '/dpo', label: 'ДПО', icon: '⌂', permission: 'dpo.manage' },
    ],
  },
  {
    title: 'Номенклатура',
    icon: '▤',
    items: [
      {
        to: '/nomenclature/models',
        label: 'Модели одежды',
        icon: '▤',
        permission: 'nomenclature.view',
      },
      {
        to: '/nomenclature/instances',
        label: 'Экземпляры одежды',
        icon: '#',
        permission: 'nomenclature.view',
      },
    ],
  },
  {
    title: 'Отчёты и документы',
    icon: '▧',
    items: [
      { to: '/print-forms', label: 'Печатные формы', icon: '▧', permission: 'print_forms.use' },
      {
        to: '/reports/employees',
        label: 'Отчёт по работникам',
        icon: '·',
        permission: 'reports.view',
      },
      { to: '/reports/dpo', label: 'Отчёт по ДПО', icon: '·', permission: 'reports.view' },
      {
        to: '/reports/turnover',
        label: 'Сменяемость по ДПО',
        icon: '·',
        permission: 'reports.view',
      },
      {
        to: '/reports/purchases',
        label: 'Отчёт по поступлениям',
        icon: '·',
        permission: 'reports.view',
      },
      {
        to: '/reports/suppliers',
        label: 'Отчёт по поставщикам',
        icon: '·',
        permission: 'reports.view',
      },
      {
        to: '/reports/writeoffs',
        label: 'Отчёт по списаниям',
        icon: '·',
        permission: 'reports.view',
      },
      { to: '/reports/repairs', label: 'Отчёт по ремонтам', icon: '·', permission: 'reports.view' },
      {
        to: '/reports/warehouses',
        label: 'Отчёт по складам',
        icon: '·',
        permission: 'reports.view',
      },
      {
        to: '/reports/stock-balances',
        label: 'Отчёт по остаткам',
        icon: '·',
        permission: 'reports.view',
      },
      {
        to: '/reports/property-cost',
        label: 'Имущество у работников',
        icon: '·',
        permission: 'reports.view',
      },
    ],
  },
  {
    title: 'Настройки',
    icon: '⚙',
    items: [
      {
        to: '/catalogs/organizations',
        label: 'Организации',
        icon: '·',
        permission: 'catalogs.view',
      },
      {
        to: '/catalogs/subdivisions',
        label: 'Станции',
        icon: '·',
        permission: 'catalogs.view',
      },
      { to: '/catalogs/positions', label: 'Должности', icon: '·', permission: 'catalogs.view' },
      { to: '/catalogs/warehouses', label: 'Склады', icon: '·', permission: 'catalogs.view' },
      { to: '/catalogs/suppliers', label: 'Поставщики', icon: '·', permission: 'catalogs.view' },
      { to: '/catalogs/sizes', label: 'Размеры', icon: '·', permission: 'catalogs.view' },
      { to: '/admin/users', label: 'Пользователи', icon: '·', permission: 'admin.manage' },
      {
        to: '/admin/print-form-settings',
        label: 'Реквизиты форм',
        icon: '·',
        permission: 'admin.manage',
      },
      {
        to: '/admin/print-form-templates',
        label: 'Шаблоны печати',
        icon: '·',
        permission: 'admin.manage',
      },
      {
        to: '/admin/startup-import',
        label: 'Стартовый импорт',
        icon: '·',
        permission: 'admin.manage',
      },
    ],
  },
];

export function getVisibleNavSections(permissions) {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!LAUNDRY_REPAIR_ENABLED && LAUNDRY_REPAIR_PATHS.has(item.to)) return false;
      return !item.permission || permissions.includes(item.permission);
    }),
  })).filter((section) => section.items.length > 0);
}
