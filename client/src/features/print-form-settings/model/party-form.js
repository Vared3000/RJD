import { z } from 'zod';

const optional = z.string().trim().optional();

export const partySchema = z.object({
  role: z.enum(['executor', 'customer']),
  effectiveDate: z.string().date('Укажите дату начала действия'),
  fullName: z.string().trim().min(2),
  shortName: z.string().trim().min(2),
  inn: z.string().regex(/^\d{10}(\d{2})?$/, 'ИНН: 10 или 12 цифр'),
  kpp: z
    .string()
    .regex(/^\d{9}$/, 'КПП: 9 цифр')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().min(2),
  okpo: optional,
  directorFullName: z.string().trim().min(2),
  directorPosition: z.string().trim().min(2),
  directorBasis: z.string().trim().min(2),
  bankName: optional,
  bik: optional,
  correspondentAccount: optional,
  settlementAccount: optional,
  contractNumber: optional,
  contractDate: optional,
});

export const partyFields = [
  {
    name: 'role',
    label: 'Сторона',
    type: 'select',
    required: true,
    options: [
      { value: 'executor', label: 'Исполнитель / продавец' },
      { value: 'customer', label: 'Заказчик / покупатель' },
    ],
  },
  { name: 'effectiveDate', label: 'Действует с', type: 'date', required: true },
  { name: 'fullName', label: 'Полное наименование', type: 'text', required: true },
  { name: 'shortName', label: 'Краткое наименование', type: 'text', required: true },
  { name: 'inn', label: 'ИНН', type: 'text', required: true },
  { name: 'kpp', label: 'КПП', type: 'text' },
  { name: 'address', label: 'Юридический адрес', type: 'text', required: true },
  { name: 'okpo', label: 'ОКПО', type: 'text' },
  { name: 'directorFullName', label: 'ФИО руководителя', type: 'text', required: true },
  { name: 'directorPosition', label: 'Должность руководителя', type: 'text', required: true },
  { name: 'directorBasis', label: 'Основание полномочий', type: 'text', required: true },
  { name: 'bankName', label: 'Банк', type: 'text' },
  { name: 'bik', label: 'БИК', type: 'text' },
  { name: 'correspondentAccount', label: 'Корреспондентский счёт', type: 'text' },
  { name: 'settlementAccount', label: 'Расчётный счёт', type: 'text' },
  { name: 'contractNumber', label: 'Номер договора', type: 'text' },
  { name: 'contractDate', label: 'Дата договора', type: 'date' },
];
