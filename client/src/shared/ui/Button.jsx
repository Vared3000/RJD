import styles from './Button.module.css';

const VARIANT_CLASS = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
};

export function Button({ variant = 'primary', type = 'button', className = '', ...props }) {
  const variantClass = VARIANT_CLASS[variant] ?? styles.primary;
  return (
    <button type={type} className={`${styles.button} ${variantClass} ${className}`} {...props} />
  );
}
