import { useEffect, useId } from 'react';
import styles from './Modal.module.css';

// closeOnOverlayClick=false для модалок с вводом данных (формы) — случайный
// клик по фону не должен молча стирать то, что пользователь уже заполнил;
// закрыть такую модалку можно кнопкой ×/"Отмена" или Escape. Для модалок
// подтверждения действия (без полей ввода) поведение по умолчанию (true)
// безопасно и ожидаемо.
export function Modal({ title, onClose, children, closeOnOverlayClick = true, size = 'default' }) {
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={closeOnOverlayClick ? onClose : undefined}>
      <div
        className={`${styles.card} ${size === 'wide' ? styles.wide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
