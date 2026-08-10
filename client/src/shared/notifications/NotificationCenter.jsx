import { dismissNotification, useNotificationStore } from './notification-store.js';
import styles from './NotificationCenter.module.css';

const TYPE_CLASS = {
  success: styles.success,
  error: styles.error,
  warning: styles.warning,
  info: styles.info,
};

// Монтируется один раз в AppProviders — покрывает весь экран, включая
// страницу логина, а не только авторизованный layout.
export function NotificationCenter() {
  const items = useNotificationStore((state) => state.items);

  if (items.length === 0) return null;

  return (
    <div className={styles.stack} role="region" aria-label="Уведомления">
      {items.map((item) => (
        <div
          key={item.id}
          className={`${styles.toast} ${TYPE_CLASS[item.type] ?? ''}`}
          role="status"
        >
          <p className={styles.message}>{item.message}</p>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => dismissNotification(item.id)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
