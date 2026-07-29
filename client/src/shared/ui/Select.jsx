import { forwardRef } from 'react';
import styles from './Select.module.css';

export const Select = forwardRef(function Select(
  { label, error, options = [], placeholder = 'Выберите…', id, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        className={`${styles.select} ${error ? styles.selectError : ''}`}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
