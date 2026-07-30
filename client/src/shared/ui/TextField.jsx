import { forwardRef } from 'react';
import styles from './TextField.module.css';

export const TextField = forwardRef(function TextField(
  { label, error, hint, required, id, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        {...props}
      />
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
