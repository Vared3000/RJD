import { Controller } from 'react-hook-form';
import {
  ALL_WEAR_MONTHS,
  SUMMER_WEAR_MONTHS,
  WEAR_MONTHS,
  WINTER_WEAR_MONTHS,
  normalizeWearMonths,
} from '../model/wear-months.js';
import styles from './WearMonthsField.module.css';

const PRESETS = [
  { label: 'Круглый год', value: ALL_WEAR_MONTHS },
  { label: 'Летнее', value: SUMMER_WEAR_MONTHS },
  { label: 'Зимнее', value: WINTER_WEAR_MONTHS },
  { label: 'Очистить', value: [] },
];

export function WearMonthsField({ field, form, error }) {
  return (
    <Controller
      name={field.name}
      control={form.control}
      render={({ field: controllerField }) => {
        const selected = normalizeWearMonths(controllerField.value);
        const selectedSet = new Set(selected);

        function toggleMonth(month) {
          controllerField.onChange(
            selectedSet.has(month)
              ? selected.filter((value) => value !== month)
              : normalizeWearMonths([...selected, month]),
          );
        }

        return (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{field.label}</legend>
            <p className={styles.hint}>
              Отметьте месяцы, когда изделие носится и должно учитываться в арендных документах.
            </p>
            <div className={styles.presets} aria-label="Готовые периоды">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className={styles.presetButton}
                  type="button"
                  onClick={() => controllerField.onChange([...preset.value])}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className={styles.monthGrid}>
              {WEAR_MONTHS.map((month) => {
                const active = selectedSet.has(month.value);
                return (
                  <button
                    key={month.value}
                    className={`${styles.monthButton} ${active ? styles.monthButtonActive : ''}`}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${month.label}: ${active ? 'выбран' : 'не выбран'}`}
                    onClick={() => toggleMonth(month.value)}
                  >
                    {month.label}
                  </button>
                );
              })}
            </div>
            <p className={styles.selection}>
              Выбрано месяцев: <strong>{selected.length}</strong>
            </p>
            {error && <p className={styles.error}>{error}</p>}
          </fieldset>
        );
      }}
    />
  );
}
