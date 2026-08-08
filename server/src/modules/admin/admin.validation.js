import { z } from 'zod';

// Требования к сложности пароля (задача 6 docs/IMPROVEMENT_PLAN.md): не
// короче 8 символов, хотя бы одна буква и хотя бы одна цифра — минимальный
// разумный барьер для локальной сети предприятия, без внешних сервисов
// проверки паролей (раздел 4 ТЗ — работа без интернета).
export const passwordPolicy = z
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

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  roleId: z.string().uuid('Выберите роль').optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordPolicy,
});
