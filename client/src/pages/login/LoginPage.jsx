import { Navigate } from 'react-router-dom';
import { LoginForm } from '../../features/auth/ui/LoginForm.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const status = useSessionStore((state) => state.status);

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Учёт спецодежды</h1>
        <LoginForm />
      </div>
    </div>
  );
}
