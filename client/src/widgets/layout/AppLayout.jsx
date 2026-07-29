import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStore } from '../../shared/session/session-store.js';
import { useLogout } from '../../features/auth/model/use-logout.js';
import { Button } from '../../shared/ui/Button.jsx';
import styles from './AppLayout.module.css';

const NAV_ITEMS = [{ to: '/', label: 'Главная', end: true }];

export function AppLayout() {
  const user = useSessionStore((state) => state.user);
  const logout = useLogout();

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Учёт спецодежды</div>
        <nav>
          <ul className={styles.nav}>
            {NAV_ITEMS.map((item) => (
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
