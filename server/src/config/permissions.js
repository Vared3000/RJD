// Единый каталог прав системы. При добавлении нового модуля — дополнять здесь.
export const PERMISSIONS = [
  { code: 'employees.view', description: 'Просмотр работников' },
  { code: 'employees.manage', description: 'Управление работниками' },
  { code: 'dpo.manage', description: 'Управление ДПО' },
  {
    code: 'catalogs.view',
    description:
      'Просмотр справочников (организации, подразделения, должности, склады, поставщики, размеры)',
  },
  {
    code: 'catalogs.manage',
    description:
      'Управление справочниками (организации, подразделения, должности, склады, поставщики, размеры)',
  },
  { code: 'nomenclature.view', description: 'Просмотр номенклатуры' },
  { code: 'nomenclature.manage', description: 'Управление номенклатурой и партиями' },
  { code: 'purchases.manage', description: 'Управление закупками и оприходованием' },
  { code: 'warehouse.view', description: 'Просмотр остатков склада' },
  { code: 'issuance.manage', description: 'Выдача и возврат спецодежды' },
  { code: 'transfers.manage', description: 'Перемещение между складами' },
  { code: 'inventory.manage', description: 'Инвентаризация' },
  { code: 'laundry.manage', description: 'Стирка' },
  { code: 'repair.manage', description: 'Ремонт' },
  { code: 'writeoff.manage', description: 'Списание' },
  { code: 'reports.view', description: 'Просмотр отчётов' },
  { code: 'print_forms.use', description: 'Формирование печатных форм' },
  { code: 'admin.manage', description: 'Администрирование системы (пользователи, роли)' },
];

export const ROLE_DEFINITIONS = [
  {
    code: 'admin',
    name: 'Администратор',
    isSystem: true,
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    code: 'warehouse_manager',
    name: 'Кладовщик',
    isSystem: true,
    permissions: [
      'catalogs.view',
      'nomenclature.view',
      'nomenclature.manage',
      'purchases.manage',
      'warehouse.view',
      'issuance.manage',
      'transfers.manage',
      'inventory.manage',
      'laundry.manage',
      'repair.manage',
      'writeoff.manage',
    ],
  },
  {
    code: 'hr_manager',
    name: 'Специалист по кадрам',
    isSystem: true,
    permissions: [
      'catalogs.view',
      'employees.view',
      'employees.manage',
      'dpo.manage',
      'issuance.manage',
      'reports.view',
      'print_forms.use',
    ],
  },
  {
    code: 'accountant',
    name: 'Бухгалтер',
    isSystem: true,
    permissions: [
      'catalogs.view',
      'purchases.manage',
      'nomenclature.view',
      'warehouse.view',
      'reports.view',
      'print_forms.use',
    ],
  },
  {
    code: 'viewer',
    name: 'Наблюдатель',
    isSystem: true,
    permissions: [
      'catalogs.view',
      'employees.view',
      'nomenclature.view',
      'warehouse.view',
      'reports.view',
    ],
  },
];
