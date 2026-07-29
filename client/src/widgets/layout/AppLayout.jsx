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
];

export function AppLayout() {
  const user = useSessionStore((state) => state.user);
  const logout = useLogout();
  const permissions = user?.permissions ?? [];
  const visibleSections = NAV_SECTIONS.filter(
    (section) => !section.permission || permissions.includes(section.permission),
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
