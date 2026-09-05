import { forwardRef } from 'react';
import styles from './Select.module.css';

export const Select = forwardRef(function Select(
  {
    label,
    error,
    hint,
    required,
    options = [],
    optionGroups = [],
    placeholder = 'Выберите…',
    id,
    ...props
  },
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
        {optionGroups.map((group) => (
          <optgroup key={group.value ?? group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
