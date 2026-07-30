import { resolvePreset, PERIOD_PRESETS } from '../model/period-presets.js';
import { Button } from '../../../shared/ui/Button.jsx';
import styles from './PeriodFilter.module.css';

// from/to — строки 'YYYY-MM-DD'; onChange({ from, to }).
export function PeriodFilter({ from, to, onChange }) {
  return (
    <div className={styles.bar}>
      <div className={styles.presets}>
        {PERIOD_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            variant="secondary"
            type="button"
            onClick={() => onChange(resolvePreset(preset.value))}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className={styles.range}>
        <label className={styles.field}>
          С
          <input
            type="date"
            value={from}
            onChange={(event) => onChange({ from: event.target.value, to })}
          />
        </label>
        <label className={styles.field}>
          По
          <input
            type="date"
            value={to}
            onChange={(event) => onChange({ from, to: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
