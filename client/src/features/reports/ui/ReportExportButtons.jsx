import { useState } from 'react';
import { Button } from '../../../shared/ui/Button.jsx';
import { downloadReport } from '../api/reports-api.js';
import { parseBlobApiError } from '../../../shared/lib/parse-api-error.js';
import styles from './ReportExportButtons.module.css';

export function ReportExportButtons({ report, params }) {
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');

  async function download(format) {
    setPending(format);
    setError('');
    try {
      await downloadReport(report, params, format);
    } catch (requestError) {
      setError(await parseBlobApiError(requestError));
    } finally {
      setPending('');
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.actions}>
        <Button onClick={() => download('xlsx')} disabled={Boolean(pending)}>
          {pending === 'xlsx' ? 'Формирование…' : 'Скачать Excel'}
        </Button>
        <Button variant="secondary" onClick={() => download('pdf')} disabled={Boolean(pending)}>
          {pending === 'pdf' ? 'Формирование…' : 'Скачать PDF'}
        </Button>
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
