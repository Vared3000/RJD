import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';
import { TextField } from './TextField.jsx';
import { BlockingDocumentsNotice } from './BlockingDocumentsNotice.jsx';
import { apiErrorDetails, mutationErrorMessage } from '../lib/parse-api-error.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';

export function UnpostDocumentModal({ editAfter, mutation, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const blockingDocuments = apiErrorDetails(mutation.error)?.blockingDocuments;

  async function handleSubmit(event) {
    event.preventDefault();
    await onConfirm({ reason });
  }

  return (
    <Modal
      title={editAfter ? 'Редактировать проведённый документ?' : 'Отменить проведение?'}
      onClose={onClose}
      closeOnOverlayClick={false}
    >
      <form className={catalogStyles.form} onSubmit={handleSubmit}>
        <p className={catalogStyles.hint}>
          Система проверит последующие операции, вернёт экземпляры в предыдущее состояние и
          переведёт документ в черновик. После исправления его потребуется провести заново.
        </p>
        <TextField
          id="revisionReason"
          label="Причина исправления (необязательно)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {mutation.isError && (
          <p className={catalogStyles.formError}>{mutationErrorMessage(mutation)}</p>
        )}
        <BlockingDocumentsNotice blockingDocuments={blockingDocuments} />
        <div className={catalogStyles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Проверка и отмена…'
              : editAfter
                ? 'Отменить проведение и редактировать'
                : 'Отменить проведение'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
