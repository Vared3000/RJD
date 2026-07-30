import { Controller, useWatch } from 'react-hook-form';
import { TextField } from '../../../shared/ui/TextField.jsx';
import { Select } from '../../../shared/ui/Select.jsx';
import { createCatalogHooks } from '../model/use-catalog-queries.js';
import styles from './CatalogFormField.module.css';

const INPUT_TYPES = { number: 'number', email: 'email', date: 'date' };

// field: { name, label, type: 'text'|'email'|'number'|'date'|'select'|'checkbox', required,
//          options?: [{value,label}] — для статичного select,
//          optionsResource?, optionValue?, optionLabel? — для select со
//          списком из другого справочника (например, организация);
//          optionsFilter?(item) — сузить список загруженных записей
//          (например, размеры только одного типа);
//          optionsSort?(a, b) — задать удобный порядок значений. }
export function CatalogFormField({ field, form }) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const error = errors[field.name]?.message;

  if (field.type === 'select') {
    return <SelectField field={field} control={control} error={error} />;
  }

  if (field.type === 'checkbox') {
    return (
      <label className={styles.checkboxField}>
        <input type="checkbox" {...register(field.name)} />
        <span>{field.label}</span>
        {error && <span className={styles.error}>{error}</span>}
      </label>
    );
  }

  return (
    <TextField
      label={field.label}
      type={INPUT_TYPES[field.type] ?? 'text'}
      placeholder={field.placeholder}
      error={error}
      // Специально без valueAsNumber: RHF конвертировал бы пустое значение в
      // NaN ещё до zod-схемы, из-за чего preprocess для опциональных числовых
      // полей (см. instance.validation.js) не успевал бы увидеть пустую строку.
      // Строка -> число приводит сама zod-схема (z.coerce.number()).
      {...register(field.name)}
    />
  );
}

function resolveAccessor(accessor, item) {
  return typeof accessor === 'function' ? accessor(item) : item[accessor];
}

function SelectField({ field, control, error }) {
  const resourceHooks = field.optionsResource ? createCatalogHooks(field.optionsResource) : null;
  const filterResourceHooks = field.optionsFilterResource
    ? createCatalogHooks(field.optionsFilterResource)
    : null;
  // Для select со связанным справочником всегда подгружаем только активные записи.
  const { data: fetchedItems } = resourceHooks ? resourceHooks.useList(false) : { data: null };
  const { data: filterItems } = filterResourceHooks
    ? filterResourceHooks.useList(false)
    : { data: null };
  const formValues = useWatch({ control });

  const options = field.optionsResource
    ? (fetchedItems ?? [])
        .filter((item) =>
          field.optionsFilter
            ? field.optionsFilter(item, {
                values: formValues,
                relatedItems: filterItems ?? [],
              })
            : true,
        )
        .sort((left, right) => (field.optionsSort ? field.optionsSort(left, right) : 0))
        .map((item) => ({
          value: resolveAccessor(field.optionValue, item),
          label: resolveAccessor(field.optionLabel, item),
        }))
    : (field.options ?? []);

  return (
    <Controller
      name={field.name}
      control={control}
      render={({ field: controllerField }) => (
        <Select label={field.label} error={error} options={options} {...controllerField} />
      )}
    />
  );
}
