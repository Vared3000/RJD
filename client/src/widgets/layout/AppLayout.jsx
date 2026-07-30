import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStore } from '../../shared/session/session-store.js';
import { useLogout } from '../../features/auth/model/use-logout.js';
import { Button } from '../../shared/ui/Button.jsx';
import styles from './AppLayout.module.css';

const NAV_SECTIONS = [
  { items: [{ to: '/', label: 'Главная', end: true }] },
  {
    title: 'Справочники',
    permission: 'catalogs.view',
    items: [
      { to: '/catalogs/organizations', label: 'Организации' },
      { to: '/catalogs/subdivisions', label: 'Подразделения' },
      { to: '/catalogs/positions', label: 'Должности' },
      { to: '/catalogs/warehouses', label: 'Склады' },
      { to: '/catalogs/suppliers', label: 'Поставщики' },
      { to: '/catalogs/sizes', label: 'Размеры' },
    ],
  },
  {
    title: 'Номенклатура',
    permission: 'nomenclature.view',
    items: [
      { to: '/nomenclature/models', label: 'Модели' },
      { to: '/nomenclature/instances', label: 'Экземпляры' },
    ],
  },
  {
    title: 'Закупки',
    permission: 'purchases.manage',
    items: [{ to: '/purchases/receiving', label: 'Поступление' }],
  },
  {
    title: 'Склады',
    permission: 'warehouse.view',
    items: [
      { to: '/warehouses/balances', label: 'Остатки' },
      { to: '/warehouses/movements', label: 'Движения' },
    ],
  },
  {
    title: 'Работники',
    // У раздела нет единого права (ДПО — dpo.manage, не employees.view) —
    // фильтруются сами пункты, как у "Складские документы".
    items: [
      { to: '/employees', label: 'Работники', permission: 'employees.view' },
      { to: '/employees/kits', label: 'Комплекты', permission: 'employees.view' },
      { to: '/dpo', label: 'ДПО', permission: 'dpo.manage' },
    ],
  },
  {
    title: 'Выдача/Возврат',
    permission: 'issuance.manage',
    items: [
      { to: '/issuance/documents', label: 'Выдача' },
      { to: '/issuance/returns', label: 'Возврат' },
    ],
  },
  {
    title: 'Стирка/Ремонт',
    permission: 'laundry.manage',
    items: [
      { to: '/laundry/documents', label: 'Стирка' },
      { to: '/repair/documents', label: 'Ремонт' },
    ],
  },
  {
    title: 'Складские документы',
    // У раздела нет единого права — три независимых (в отличие от
    // "Стирка/Ремонт"), поэтому фильтруются сами пункты (item.permission),
    // а не только секция целиком.
    items: [
      { to: '/transfers/documents', label: 'Перемещение', permission: 'transfers.manage' },
      { to: '/inventory/documents', label: 'Инвентаризация', permission: 'inventory.manage' },
      { to: '/writeoff/documents', label: 'Списание', permission: 'writeoff.manage' },
    ],
  },
  {
    title: 'Отчётность',
    permission: 'reports.view',
    items: [
      { to: '/reports/employees', label: 'Работники' },
      { to: '/reports/dpo', label: 'ДПО' },
      { to: '/reports/purchases', label: 'Закупки' },
      { to: '/reports/suppliers', label: 'Поставщики' },
      { to: '/reports/writeoffs', label: 'Списания' },
      { to: '/reports/repairs', label: 'Ремонты' },
      { to: '/reports/warehouses', label: 'Склады' },
      { to: '/reports/stock-balances', label: 'Остатки' },
      { to: '/reports/property-cost', label: 'Стоимость имущества' },
    ],
  },
  {
    title: 'Документы',
    permission: 'print_forms.use',
    items: [{ to: '/print-forms', label: 'Печатные формы' }],
  },
];

export function AppLayout() {
  const user = useSessionStore((state) => state.user);
  const logout = useLogout();
  const permissions = user?.permissions ?? [];
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || permissions.includes(item.permission),
    ),
  })).filter(
    (section) =>
      (!section.permission || permissions.includes(section.permission)) && section.items.length > 0,
  );

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Учёт спецодежды</div>
        <nav className={styles.nav}>
          {visibleSections.map((section) => (
            <div key={section.title ?? 'main'} className={styles.navSection}>
              {section.title && <div className={styles.navSectionTitle}>{section.title}</div>}
              <ul>
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.fullName}</span>
            <span className={styles.userRole}>{user?.role?.name}</span>
          </div>
          <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Выйти
          </Button>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
