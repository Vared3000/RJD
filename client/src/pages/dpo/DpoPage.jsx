import { z } from 'zod';
import { Link } from 'react-router-dom';
import { CatalogPage } from '../../features/catalogs/ui/CatalogPage.jsx';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';

const optionalText = (max) => z.string().max(max).optional().or(z.literal(''));

const schema = z.object({
  name: z.string().min(1, 'Укажите краткое наименование').max(255),
  fullName: z.string().min(1, 'Укажите полное наименование').max(500),
  code: optionalText(32),
  region: optionalText(255),
  address: optionalText(500),
  okpo: optionalText(16),
  businessUnitCode: optionalText(32),
  directorFullName: optionalText(255),
  directorFullNameGenitive: optionalText(255),
  directorBasis: optionalText(500),
  contractNumber: optionalText(128),
  contractDate: z.string().optional().or(z.literal('')),
  additionalAgreementNumber: optionalText(128),
  additionalAgreementDate: z.string().optional().or(z.literal('')),
});

const columns = [
  {
    key: 'name',
    label: 'Наименование',
    render: (item) => (
      <Link to={`/dpo/${item.id}/history`} className={catalogStyles.linkButton}>
        {item.name}
      </Link>
    ),
  },
  { key: 'code', label: 'Код' },
  { key: 'region', label: 'Регион', render: (item) => item.region ?? '—' },
  { key: 'directorFullName', label: 'Начальник ДПО' },
  { key: 'contractNumber', label: 'Договор №' },
  { key: 'additionalAgreementNumber', label: 'Доп. соглашение №' },
];

const fields = [
  { name: 'name', label: 'Краткое наименование', type: 'text' },
  { name: 'fullName', label: 'Полное наименование', type: 'text' },
  { name: 'code', label: 'Код', type: 'text' },
  { name: 'region', label: 'Регион', type: 'text' },
  { name: 'address', label: 'Адрес', type: 'text' },
  { name: 'okpo', label: 'ОКПО', type: 'text' },
  { name: 'businessUnitCode', label: 'Код бизнес-единицы (БЕ)', type: 'text' },
  { name: 'directorFullName', label: 'Начальник ДПО (ФИО)', type: 'text' },
  {
    name: 'directorFullNameGenitive',
    label: 'Начальник ДПО — ФИО в родительном падеже',
    type: 'text',
    placeholder: 'Иванова Ивана Ивановича',
  },
  { name: 'directorBasis', label: 'Основание полномочий', type: 'text' },
  { name: 'contractNumber', label: 'Номер договора', type: 'text' },
  { name: 'contractDate', label: 'Дата договора', type: 'date' },
  { name: 'additionalAgreementNumber', label: 'Номер доп. соглашения', type: 'text' },
  { name: 'additionalAgreementDate', label: 'Дата доп. соглашения', type: 'date' },
];

export function DpoPage() {
  return (
    <CatalogPage
      resource="dpo"
      title="ДПО"
      columns={columns}
      fields={fields}
      schema={schema}
      viewPermission="dpo.manage"
      managePermission="dpo.manage"
      searchable
    />
  );
}
