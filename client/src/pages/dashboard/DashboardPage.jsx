import { useSessionStore } from '../../shared/session/session-store.js';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const user = useSessionStore((state) => state.user);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Главная</h1>
      <p className={styles.hint}>
        Добро пожаловать, {user?.fullName}. Роль: {user?.role?.name}.
      </p>
      <p className={styles.hint}>
        Модули системы (справочники, номенклатура, склад, работники, документы, отчёты) будут
        появляться здесь по мере реализации следующих этапов.
      </p>
    </div>
  );
}
