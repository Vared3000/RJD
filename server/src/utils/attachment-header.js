// RFC 6266/5987: браузеры, не понимающие filename*=UTF-8'', используют
// ASCII-fallback filename=; кириллица (номера документов, ФИО и т.п.) не
// проходит напрямую в HTTP-заголовок и валит запрос ошибкой на уровне
// Node/Express ("Invalid character in header content"). Раньше эта функция
// была продублирована в нескольких контроллерах печатных форм — вынесена
// сюда как единственная точка.
export function attachmentHeader(fileName) {
  const fallback = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
