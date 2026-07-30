import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CatalogFormField } from './CatalogFormField.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Modal } from '../../../shared/ui/Modal.jsx';
import styles from './CatalogPage.module.css';

// Ни одно поле не должно стартовать как undefined: для select (Controller)
// это на первом рендере даёт неуправляемый <select>, а при первом же
// изменении — предупреждение React про переход uncontrolled -> controlled.
// Текстовые/select-поля без явного значения получают '', числовые — undefined
// (там управляет сама zod-схема через coerce).
function withSafeDefaults(fields, defaultValues) {
  return Object.fromEntries(
    fields.map((field) => {
      const provided = defaultValues[field.name];
      const fallback = field.type === 'number' ? undefined : '';
      return [field.name, provided ?? field.defaultValue ?? fallback];
    }),
  );
}

// Общая форма-в-модалке: набор полей (см. CatalogFormField) + zod-схема.
// defaultValues передаются один раз при монтировании (модалка монтируется
// заново при каждом открытии — React сам даёт форме правильные начальные
// значения без императивного form.reset()).
export function EntityFormModal({
  title,
  fields,
  schema,
  defaultValues,
  onSubmit,
  onClose,
  isSaving,
  error,
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: withSafeDefaults(fields, defaultValues),
    shouldUnregister: true,
  });

  return (
    <Modal title={title} onClose={onClose}>
      <form className={styles.form} onSubmit={form.handleSubmit(onSubmit)} noValidate>
        {fields.map((field) => (
          <CatalogFormField key={field.name} field={field} form={form} />
        ))}
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
