import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().min(1, 'Укажите логин'),
  password: z.string().min(1, 'Укажите пароль'),
});
