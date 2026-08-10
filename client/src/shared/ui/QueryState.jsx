import { parseApiError } from '../lib/parse-api-error.js';
import { Button } from './Button.jsx';
import styles from './QueryState.module.css';

// Общая замена бесхозного "if (isLoading) return <p>Загрузка…</p>" без ветки
// ошибки (страница раньше зависала на заглушке навсегда, если запрос падал).
// query — результат useQuery/useList (нужны isLoading/isError/error/refetch).
export function QueryState({ query, loadingText = 'Загрузка…', children }) {
  if (query.isLoading) {
    return <p className={styles.hint}>{loadingText}</p>;
  }
  if (query.isError) {
    return (
      <div className={styles.errorBox}>
        <p className={styles.errorText}>{parseApiError(query.error).message}</p>
        <Button variant="secondary" onClick={() => query.refetch()}>
          Повторить
        </Button>
      </div>
    );
  }
  return children ?? null;
}
