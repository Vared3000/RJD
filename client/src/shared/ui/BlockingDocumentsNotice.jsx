import { Link } from 'react-router-dom';
import { DOCUMENT_PATHS } from '../lib/document-type-labels.js';
import styles from './BlockingDocumentsNotice.module.css';

// Задача 22: список документов, блокирующих редактирование проведённого
// поступления/выдачи (см. ApiError.conflict(message, { blockingDocuments })
// в instance-dependency-check.js). blockingDocuments — details 409-ответа,
// читаются страницей через apiErrorDetails(mutation.error)?.blockingDocuments.
export function BlockingDocumentsNotice({ blockingDocuments }) {
  if (!blockingDocuments?.length) return null;
  return (
    <div className={styles.notice}>
      <p className={styles.title}>
        Изменение невозможно — сначала отмените или скорректируйте эти документы, начиная с самого
        позднего:
      </p>
      <ul className={styles.list}>
        {blockingDocuments.map((doc) => {
          const path = DOCUMENT_PATHS[doc.documentType];
          const label = `${doc.label ?? doc.documentType} ${doc.number ?? doc.documentId}`;
          return (
            <li key={`${doc.documentType}:${doc.documentId}`}>
              {path ? <Link to={`${path}/${doc.documentId}`}>{label}</Link> : label}
              {doc.instanceInventoryNumbers?.length > 0 &&
                ` — экз. ${doc.instanceInventoryNumbers.join(', ')}`}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
