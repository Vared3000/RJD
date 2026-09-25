// Поднимаем высоту только при необходимости, не меняя ширину/шрифт макета.
// Консервативная оценка для кириллицы; одинаковая геометрия в Excel и PDF.
export function wrappedTextHeight(sheet, cell, text) {
  const size = Number(cell.font?.size ?? 11);
  const width = Number(sheet.getColumn(cell.col).width ?? 8.43) * 5.25 - 6;
  const capacity = Math.max(1, Math.floor(width / (size * 0.62)));
  let lines = 0;
  for (const paragraph of String(text ?? '').split('\n')) {
    let used = 0;
    lines++;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (used && used + 1 + word.length > capacity) {
        lines++;
        used = 0;
      }
      if (word.length > capacity) {
        lines += Math.floor((word.length - 1) / capacity);
        used = ((word.length - 1) % capacity) + 1;
      } else {
        used += (used ? 1 : 0) + word.length;
      }
    }
  }
  return lines * size * 1.2 + 4;
}

export function fitModelName(sheet, cell, text, minimumHeight = 0) {
  cell.value = text;
  cell.alignment = { ...cell.alignment, wrapText: true, shrinkToFit: false };
  sheet.getRow(cell.row).height = Math.max(
    sheet.getRow(cell.row).height ?? 0,
    minimumHeight,
    wrappedTextHeight(sheet, cell, text),
  );
}
