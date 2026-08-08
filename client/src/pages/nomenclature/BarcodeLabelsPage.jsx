import { useState } from 'react';
import { Button } from '../../shared/ui/Button.jsx';
import { downloadLabels, findInstanceByBarcode } from '../../features/barcodes/api/barcode-api.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './BarcodeLabelsPage.module.css';

export function BarcodeLabelsPage() {
  const [barcode, setBarcode] = useState('');
  const [instances, setInstances] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function scan(event) {
    event.preventDefault();
    const value = barcode.trim();
    if (!value) return;
    setPending(true);
    setError('');
    try {
      const instance = await findInstanceByBarcode(value);
      setInstances((current) =>
        current.some((item) => item.id === instance.id) ? current : [...current, instance],
      );
      setBarcode('');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Экземпляр не найден');
    } finally {
      setPending(false);
    }
  }

  async function print(labelType) {
    setPending(true);
    setError('');
    try {
      await downloadLabels(
        instances.map((instance) => instance.id),
        labelType,
      );
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? 'Не удалось сформировать этикетки');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Штрихкоды и этикетки</h1>
          <p className={styles.subtitle}>
            Сканер работает как клавиатура: отсканируйте код и нажмите Enter.
          </p>
        </div>
      </div>

      <form className={styles.scanForm} onSubmit={scan}>
        <label>
          Штрихкод или инвентарный номер
          <input
            autoFocus
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="Отсканируйте код…"
          />
        </label>
        <Button type="submit" disabled={pending}>
          Добавить
        </Button>
      </form>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <Button disabled={pending || instances.length === 0} onClick={() => print('qr')}>
          PDF с QR
        </Button>
        <Button
          variant="secondary"
          disabled={pending || instances.length === 0}
          onClick={() => print('code128')}
        >
          PDF с Code128
        </Button>
        <Button
          variant="secondary"
          disabled={pending || instances.length === 0}
          onClick={() => setInstances([])}
        >
          Очистить
        </Button>
      </div>

      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Инв. номер</th>
              <th>Модель</th>
              <th>Размер</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {instances.length === 0 && (
              <tr>
                <td colSpan="4" className={catalogStyles.hint}>
                  Список пуст
                </td>
              </tr>
            )}
            {instances.map((instance) => (
              <tr key={instance.id}>
                <td>{instance.inventoryNumber}</td>
                <td>{instance.model?.name ?? '—'}</td>
                <td>{instance.size?.value ?? '—'}</td>
                <td>
                  <button
                    type="button"
                    className={catalogStyles.linkButton}
                    onClick={() =>
                      setInstances((items) => items.filter((item) => item.id !== instance.id))
                    }
                  >
                    Убрать
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
