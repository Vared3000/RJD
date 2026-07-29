import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLogin } from '../model/use-login.js';
import { loginSchema } from '../model/login-schema.js';
import { TextField } from '../../../shared/ui/TextField.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import styles from './LoginForm.module.css';

export function LoginForm() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values) => login.mutate(values);

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextField
        label="Логин"
        autoComplete="username"
        autoFocus
        error={errors.login?.message}
        {...register('login')}
      />
      <TextField
        label="Пароль"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      {login.isError && (
        <p className={styles.formError}>
          {login.error?.response?.data?.error?.message || 'Не удалось войти. Попробуйте ещё раз.'}
        </p>
      )}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Вход…' : 'Войти'}
      </Button>
    </form>
  );
}
