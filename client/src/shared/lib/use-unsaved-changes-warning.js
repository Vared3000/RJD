import { useEffect } from 'react';

// Предупреждение о несохранённом черновике (задача 20 плана) на уровне
// вкладки браузера — закрытие/обновление/переход по внешней ссылке при
// isDirty=true спросит подтверждение. Не работает для навигации внутри
// самого приложения (React Router): для этого нужен data-router
// (createBrowserRouter + useBlocker), а здесь используется декларативный
// <BrowserRouter>/<Routes> — миграция на data-router вне рамок этой задачи.
export function useUnsavedChangesWarning(isDirty) {
  useEffect(() => {
    if (!isDirty) return undefined;
    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
}
