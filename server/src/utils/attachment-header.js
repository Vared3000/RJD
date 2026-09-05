import { sanitizeExportFileName } from './export-file-name.js';

// RFC 6266/5987: filename* передаёт пользователю русское имя, а filename
// остаётся безопасным резервом для старых клиентов.
export function attachmentHeader(fileName) {
  const safeFileName = sanitizeExportFileName(fileName);
  const fallback = safeFileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download';
  const encoded = encodeURIComponent(safeFileName).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
