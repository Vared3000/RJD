import { Controller } from 'react-hook-form';
import { TextField } from '../../../shared/ui/TextField.jsx';
import { Select } from '../../../shared/ui/Select.jsx';
import { createCatalogHooks } from '../model/use-catalog-queries.js';

// field: { name, label, type: 'text'|'email'|'number'|'select', required,
//          options?: [{value,label}] — для статичного select,
//          optionsResource?, optionValue?, optionLabel? — для select со
//          списком из другого справочника (например, организация). }
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

  return (
    <TextField
      label={field.label}
      type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
      error={error}
      {...register(field.name, field.type === 'number' ? { valueAsNumber: true } : {})}
    />
  );
}

function SelectField({ field, control, error }) {
  const resourceHooks = field.optionsResource ? createCatalogHooks(field.optionsResource) : null;
  // Для select со связанным справочником всегда подгружаем только активные записи.
  const { data: fetchedItems } = resourceHooks ? resourceHooks.useList(false) : { data: null };

  const options = field.optionsResource
    ? (fetchedItems ?? []).map((item) => ({
        value: item[field.optionValue],
        label: item[field.optionLabel],
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
