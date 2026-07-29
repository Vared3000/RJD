import { forwardRef } from 'react';
import styles from './TextField.module.css';

export const TextField = forwardRef(function TextField({ label, error, id, ...props }, ref) {
  const fieldId = id ?? props.name;
  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        {...props}
      />
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
