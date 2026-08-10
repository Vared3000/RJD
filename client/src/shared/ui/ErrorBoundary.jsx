import { Component } from 'react';
import { Button } from './Button.jsx';
import styles from './ErrorBoundary.module.css';

// React Error Boundary можно реализовать только классом — хуковой замены
// в самом React нет. Ловит ошибки рендера в поддереве, не даёт им уронить
// всё приложение до пустого белого экрана.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Необработанная ошибка интерфейса', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.wrap}>
          <h1 className={styles.title}>Что-то пошло не так</h1>
          <p className={styles.text}>
            Произошла непредвиденная ошибка интерфейса. Попробуйте обновить страницу — если проблема
            повторится, сообщите администратору.
          </p>
          <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
