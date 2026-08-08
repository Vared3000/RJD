import { z } from 'zod';

const passwordPolicy = z
  .string()
  .min(8, 'Пароль должен быть не короче 8 символов')
  .regex(/[A-Za-zА-Яа-яЁё]/, 'Пароль должен содержать хотя бы одну букву')
  .regex(/[0-9]/, 'Пароль должен содержать хотя бы одну цифру');

export const createUserSchema = z.object({
  login: z
    .string()
    .min(3, 'Логин должен быть не короче 3 символов')
    .max(64)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Логин может содержать только латиницу, цифры, "_", "." и "-"'),
  password: passwordPolicy,
  fullName: z.string().min(1, 'Укажите ФИО').max(255),
  roleId: z.string().uuid('Выберите роль'),
});

export const createUserFields = [
  { name: 'login', label: 'Логин', type: 'text', required: true },
  { name: 'password', label: 'Пароль', type: 'password', required: true },
  { name: 'fullName', label: 'ФИО', type: 'text', required: true },
  {
    name: 'roleId',
    label: 'Роль',
    type: 'select',
    optionsResource: 'admin/roles',
    optionValue: 'id',
    optionLabel: 'name',
    required: true,
  },
];

export const updateUserSchema = z.object({
  fullName: z.string().min(1, 'Укажите ФИО').max(255),
  roleId: z.string().uuid('Выберите роль'),
});

export const updateUserFields = [
  { name: 'fullName', label: 'ФИО', type: 'text', required: true },
  {
    name: 'roleId',
    label: 'Роль',
    type: 'select',
    optionsResource: 'admin/roles',
    optionValue: 'id',
    optionLabel: 'name',
    required: true,
  },
];

export const resetPasswordSchema = z.object({ password: passwordPolicy });

export const resetPasswordFields = [
  { name: 'password', label: 'Новый пароль', type: 'password', required: true },
];
