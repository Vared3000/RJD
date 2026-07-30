import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './SearchableSelect.module.css';

const MAX_VISIBLE_OPTIONS = 40;

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ru');
}

export const SearchableSelect = forwardRef(function SearchableSelect(
  {
    label,
    error,
    hint,
    options = [],
    placeholder = 'Начните вводить название…',
    id,
    value,
    onChange,
    onBlur,
    name,
    required,
    disabled,
  },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? name ?? generatedId;
  const listboxId = `${fieldId}-options`;
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) setQuery(selected?.label ?? '');
  }, [isOpen, selected?.label]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const filteredOptions = useMemo(() => {
    const needle = normalize(query);
    if (!needle || selected?.label === query) return options;
    const words = needle.split(/\s+/).filter(Boolean);
    return options.filter((option) => {
      const label = normalize(option.label);
      return words.every((word) => label.includes(word));
    });
  }, [options, query, selected?.label]);

  const visibleOptions = filteredOptions.slice(0, MAX_VISIBLE_OPTIONS);

  const choose = (option) => {
    onChange(option.value);
    setQuery(option.label);
    setIsOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, visibleOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && isOpen && visibleOptions[activeIndex]) {
      event.preventDefault();
      choose(visibleOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setQuery(selected?.label ?? '');
    }
  };

  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <div className={styles.control}>
        <input
          ref={ref}
          id={fieldId}
          name={name}
          className={`${styles.input} ${error ? styles.inputError : ''}`}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-invalid={Boolean(error)}
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onFocus={(event) => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            setIsOpen(true);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            onBlur?.();
            closeTimerRef.current = setTimeout(() => {
              setIsOpen(false);
              setQuery(selected?.label ?? '');
            }, 0);
          }}
        />
        <span className={styles.searchIcon} aria-hidden="true">
          ⌕
        </span>
        {isOpen && (
          <div className={styles.dropdown} id={listboxId} role="listbox">
            {visibleOptions.length === 0 ? (
              <div className={styles.empty}>Ничего не найдено</div>
            ) : (
              visibleOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`${styles.option} ${
                    index === activeIndex ? styles.optionActive : ''
                  } ${option.value === value ? styles.optionSelected : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  {option.label}
                </button>
              ))
            )}
            {filteredOptions.length > MAX_VISIBLE_OPTIONS && (
              <div className={styles.more}>Уточните запрос — найдено {filteredOptions.length}</div>
            )}
          </div>
        )}
      </div>
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
});
