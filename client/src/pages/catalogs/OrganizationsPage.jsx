import { z } from 'zod';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';

const schema = z.object({
  name: z.string().min(1, 'Укажите название').max(255),
  fullName: z.string().max(500).optional().or(z.literal('')),
  inn: z.string().max(12).optional().or(z.literal('')),
  kpp: z.string().max(9).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  phone: z.string().max(32).optional().or(z.literal('')),
  email: z.string().email('Некорректный email').max(255).optional().or(z.literal('')),
});

const columns = [
  { key: 'name', label: 'Название' },
  { key: 'inn', label: 'ИНН' },
  { key: 'phone', label: 'Телефон' },
];

const fields = [
  { name: 'name', label: 'Название', type: 'text' },
  { name: 'fullName', label: 'Полное наименование', type: 'text' },
  { name: 'inn', label: 'ИНН', type: 'text' },
  { name: 'kpp', label: 'КПП', type: 'text' },
  { name: 'address', label: 'Адрес', type: 'text' },
  { name: 'phone', label: 'Телефон', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
];

export function OrganizationsPage() {
  return (
    <CatalogPage
      resource="organizations"
      title="Организации"
      columns={columns}
      fields={fields}
      schema={schema}
    />
  );
}
