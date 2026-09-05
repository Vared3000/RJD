function unquote(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

export function fileNameFromContentDisposition(disposition) {
  const value = String(disposition ?? '');
  const extended = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1];
  if (extended) {
    try {
      return decodeURIComponent(unquote(extended));
    } catch {
      // Повреждённый filename* не должен ломать скачивание — ниже есть fallback.
    }
  }
  return unquote(value.match(/filename\s*=\s*("[^"]*"|[^;]+)/i)?.[1]) || null;
}
