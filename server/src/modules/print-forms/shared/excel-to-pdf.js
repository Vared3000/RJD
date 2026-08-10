import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fonts = {
  sans: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
  sansBold: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
  sansItalic: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Oblique.ttf'),
  sansBoldItalic: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-BoldOblique.ttf'),
  serif: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif.ttf'),
  serifBold: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf'),
  serifItalic: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif-Italic.ttf'),
  serifBoldItalic: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSerif-BoldItalic.ttf'),
};

const POINTS_PER_INCH = 72;
const EXCEL_WIDTH_TO_POINTS = 5.25;
const DEFAULT_ROW_HEIGHT = 15;
const PDF_FOOTER_HEIGHT = 9;

function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function parseColumn(columnLetters) {
  return [...columnLetters.toUpperCase()].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
}

function printBounds(sheet) {
  const printArea = String(
    sheet.pageSetup.printArea || `A1:${sheet.lastColumn.letter}${sheet.rowCount}`,
  );
  const firstArea = printArea.split('&&')[0];
  const match = firstArea.match(/\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/i);
  if (!match) {
    return { firstColumn: 1, firstRow: 1, lastColumn: sheet.columnCount, lastRow: sheet.rowCount };
  }
  return {
    firstColumn: parseColumn(match[1]),
    firstRow: Number(match[2]),
    lastColumn: parseColumn(match[3]),
    lastRow: Number(match[4]),
  };
}

function mergeModels(sheet) {
  return Object.values(sheet._merges ?? {}).map((merge) => ({ ...merge.model }));
}

function pageMargins(sheet) {
  const margins = sheet.pageSetup.margins ?? {};
  return {
    top: Number(margins.top ?? 0.35) * POINTS_PER_INCH,
    right: Number(margins.right ?? 0.25) * POINTS_PER_INCH,
    bottom: Number(margins.bottom ?? 0.35) * POINTS_PER_INCH,
    left: Number(margins.left ?? 0.25) * POINTS_PER_INCH,
  };
}

function columnPoints(sheet, columnNumber) {
  const column = sheet.getColumn(columnNumber);
  if (column.hidden) return 0;
  return Number(column.width ?? 8.43) * EXCEL_WIDTH_TO_POINTS;
}

function rowPoints(sheet, rowNumber) {
  const row = sheet.getRow(rowNumber);
  if (row.hidden) return 0;
  return Number(row.height ?? sheet.properties.defaultRowHeight ?? DEFAULT_ROW_HEIGHT);
}

function borderColor(border) {
  const argb = border?.color?.argb;
  return argb && argb.length >= 6 ? `#${argb.slice(-6)}` : '#000000';
}

function borderWidth(border) {
  if (!border?.style) return 0;
  if (['medium', 'mediumDashed', 'mediumDashDot', 'mediumDashDotDot'].includes(border.style)) {
    return 1;
  }
  if (['thick', 'double'].includes(border.style)) return 1.5;
  return 0.45;
}

function fillColor(cell) {
  const color = cell.fill?.fgColor;
  const argb = color?.argb;
  if (argb && argb !== '00000000' && argb !== 'FFFFFFFF') return `#${argb.slice(-6)}`;
  if (color?.theme !== 4) return null;
  const base = [0x5b, 0x9b, 0xd5];
  const tint = Number(color.tint ?? 0);
  const tinted = base.map((channel) =>
    Math.round(tint >= 0 ? channel + (255 - channel) * tint : channel * (1 + tint)),
  );
  return `#${tinted.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function numberText(cell, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  const decimalMatch = String(cell.numFmt ?? '').match(/\.(0+)/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;
  return number.toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function cellText(cell) {
  if (cell.value == null) return '';
  if (typeof cell.value === 'object') {
    if (Array.isArray(cell.value.richText)) {
      return cell.value.richText.map((part) => part.text).join('');
    }
    if ('result' in cell.value && cell.value.result != null) {
      const result = cell.value.result;
      if (typeof result === 'number') return numberText(cell, result);
      if (typeof result === 'object') return result.error ?? '';
      return String(result);
    }
    if ('text' in cell.value && cell.value.text != null) return String(cell.value.text);
  }
  if (typeof cell.value === 'number') return numberText(cell, cell.value);
  return cell.text ?? String(cell.value);
}

function fontName(cell) {
  const family = /times|serif/i.test(cell.font?.name ?? '') ? 'Serif' : 'Sans';
  const bold = Boolean(cell.font?.bold);
  const italic = Boolean(cell.font?.italic);
  if (bold && italic) return `${family}BoldItalic`;
  if (bold) return `${family}Bold`;
  if (italic) return `${family}Italic`;
  return family;
}

function horizontalAlignment(cell) {
  const alignment = cell.alignment?.horizontal;
  if (alignment === 'center' || alignment === 'centerContinuous') return 'center';
  if (alignment === 'right') return 'right';
  if (alignment === 'justify' || alignment === 'distributed') return 'justify';
  return 'left';
}

function verticalTextY(doc, text, y, height, options, vertical) {
  if (vertical !== 'middle' && vertical !== 'bottom') return y;
  const measured = Math.min(height, doc.heightOfString(text, options));
  return vertical === 'bottom' ? y + height - measured : y + (height - measured) / 2;
}

function drawBorder(doc, x1, y1, x2, y2, border) {
  const width = borderWidth(border);
  if (!width) return;
  doc
    .save()
    .strokeColor(borderColor(border))
    .lineWidth(width)
    .moveTo(x1, y1)
    .lineTo(x2, y2)
    .stroke()
    .restore();
}

function registerFonts(doc) {
  doc.registerFont('Sans', fonts.sans);
  doc.registerFont('SansBold', fonts.sansBold);
  doc.registerFont('SansItalic', fonts.sansItalic);
  doc.registerFont('SansBoldItalic', fonts.sansBoldItalic);
  doc.registerFont('Serif', fonts.serif);
  doc.registerFont('SerifBold', fonts.serifBold);
  doc.registerFont('SerifItalic', fonts.serifItalic);
  doc.registerFont('SerifBoldItalic', fonts.serifBoldItalic);
}

function printTitleRows(sheet) {
  const match = String(sheet.pageSetup.printTitlesRow ?? '').match(/\$?(\d+):\$?(\d+)/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

function rowPages(sheet, bounds, availableHeight, scale, titles) {
  const pages = [];
  let start = bounds.firstRow;
  let used = 0;
  for (let rowNumber = bounds.firstRow; rowNumber <= bounds.lastRow; rowNumber += 1) {
    const height = rowPoints(sheet, rowNumber) * scale;
    if (rowNumber > start && used + height > availableHeight) {
      pages.push({ start, end: rowNumber - 1, repeatTitles: pages.length > 0 });
      start = rowNumber;
      used = titles ? heightBetween(sheet, titles.start, titles.end, scale) : 0;
    }
    used += height;
  }
  pages.push({ start, end: bounds.lastRow, repeatTitles: pages.length > 0 });
  return pages;
}

function positionMaps(sheet, bounds, scale) {
  const columnWidths = new Map();
  const columnX = new Map();
  let x = 0;
  for (let column = bounds.firstColumn; column <= bounds.lastColumn; column += 1) {
    columnX.set(column, x);
    const width = columnPoints(sheet, column) * scale;
    columnWidths.set(column, width);
    x += width;
  }
  return { columnWidths, columnX, totalWidth: x };
}

function widthBetween(columnWidths, from, to) {
  let width = 0;
  for (let column = from; column <= to; column += 1) width += columnWidths.get(column) ?? 0;
  return width;
}

function heightBetween(sheet, from, to, scale) {
  let height = 0;
  for (let row = from; row <= to; row += 1) height += rowPoints(sheet, row) * scale;
  return height;
}

function mergeAt(merges, row, column) {
  return merges.find(
    (merge) =>
      row >= merge.top && row <= merge.bottom && column >= merge.left && column <= merge.right,
  );
}

function drawCell({
  doc,
  cell,
  x,
  y,
  width,
  height,
  scale,
  borders,
  showText,
  textX = x,
  textBoxWidth = width,
}) {
  const background = fillColor(cell);
  if (background) doc.save().fillColor(background).rect(x, y, width, height).fill().restore();

  drawBorder(doc, x, y, x + width, y, borders.top);
  drawBorder(doc, x, y + height, x + width, y + height, borders.bottom);
  drawBorder(doc, x, y, x, y + height, borders.left);
  drawBorder(doc, x + width, y, x + width, y + height, borders.right);
  if (!showText) return;

  const text = cellText(cell);
  if (!text) return;
  const padding = Math.max(0.8, 1.8 * scale);
  const textWidth = Math.max(1, textBoxWidth - padding * 2);
  const textHeight = Math.max(1, height - padding * 2);
  const size = Math.max(3.8, Number(cell.font?.size ?? 10) * scale);
  const wrapText = cell.alignment?.wrapText === true || text.includes('\n');
  doc.font(fontName(cell)).fontSize(size);
  const measuredWidth = doc.widthOfString(text.replace(/\n/g, ' '));
  const fittedSize =
    !wrapText && measuredWidth > textWidth
      ? Math.max(3.8, size * (textWidth / measuredWidth) * 0.98)
      : size;
  const options = {
    width: textWidth,
    height: textHeight,
    align: horizontalAlignment(cell),
    lineBreak: wrapText,
    ellipsis: false,
  };
  doc.font(fontName(cell)).fontSize(fittedSize).fillColor('#000000');
  const textY = verticalTextY(
    doc,
    text,
    y + padding,
    textHeight,
    options,
    cell.alignment?.vertical,
  );
  doc.text(text, textX + padding, textY, options);
}

function hasVisibleBorder(cell) {
  return Object.values(cell.border ?? {}).some((border) => border?.style);
}

function overflowColumns(sheet, bounds, merges, row, column, cell) {
  if (!cellText(cell) || cell.alignment?.wrapText || hasVisibleBorder(cell)) {
    return { left: column, right: column };
  }
  let left = column;
  let right = column;
  if (horizontalAlignment(cell) === 'center') {
    while (left > bounds.firstColumn) {
      const candidateColumn = left - 1;
      const candidate = sheet.getCell(row, candidateColumn);
      if (
        mergeAt(merges, row, candidateColumn) ||
        cellText(candidate) ||
        hasVisibleBorder(candidate)
      ) {
        break;
      }
      left = candidateColumn;
    }
  }
  while (right < bounds.lastColumn) {
    const candidateColumn = right + 1;
    const candidate = sheet.getCell(row, candidateColumn);
    if (
      mergeAt(merges, row, candidateColumn) ||
      cellText(candidate) ||
      hasVisibleBorder(candidate)
    ) {
      break;
    }
    right = candidateColumn;
  }
  return { left, right };
}

function drawPage({
  doc,
  sheet,
  bounds,
  pageRows,
  merges,
  scale,
  originX,
  originY,
  columnWidths,
  columnX,
}) {
  const rowY = new Map();
  let yCursor = originY;
  for (let row = pageRows.start; row <= pageRows.end; row += 1) {
    rowY.set(row, yCursor);
    yCursor += rowPoints(sheet, row) * scale;
  }

  for (let row = pageRows.start; row <= pageRows.end; row += 1) {
    for (let column = bounds.firstColumn; column <= bounds.lastColumn; column += 1) {
      if (!columnWidths.get(column)) continue;
      const merge = mergeAt(merges, row, column);
      if (merge) {
        const visibleTop = Math.max(merge.top, pageRows.start);
        const visibleBottom = Math.min(merge.bottom, pageRows.end);
        const visibleLeft = Math.max(merge.left, bounds.firstColumn);
        const visibleRight = Math.min(merge.right, bounds.lastColumn);
        if (row !== visibleTop || column !== visibleLeft) continue;
        const master = sheet.getCell(merge.top, merge.left);
        const x = originX + (columnX.get(visibleLeft) ?? 0);
        const y = rowY.get(visibleTop);
        drawCell({
          doc,
          cell: master,
          x,
          y,
          width: widthBetween(columnWidths, visibleLeft, visibleRight),
          height: heightBetween(sheet, visibleTop, visibleBottom, scale),
          scale,
          borders: master.border ?? {},
          showText: merge.top >= pageRows.start,
        });
        continue;
      }

      const cell = sheet.getCell(row, column);
      const overflow = overflowColumns(sheet, bounds, merges, row, column, cell);
      drawCell({
        doc,
        cell,
        x: originX + (columnX.get(column) ?? 0),
        y: rowY.get(row),
        width: columnWidths.get(column),
        height: rowPoints(sheet, row) * scale,
        scale,
        borders: cell.border ?? {},
        showText: true,
        textX: originX + (columnX.get(overflow.left) ?? 0),
        textBoxWidth: widthBetween(columnWidths, overflow.left, overflow.right),
      });
    }
  }
}

// Рендерит уже заполненный Excel-лист (шаблонный акт или собранный "с нуля"
// вроде ежемесячного акта аренды) в PDF, копируя размеры колонок/строк,
// объединения, границы, заливку и перенос текста, с постраничной разбивкой
// и повтором строки заголовка на каждой странице.
export async function generatePdfFromExcel(excelBuffer, data) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelBuffer);
  const sheet = workbook.worksheets[0];
  const bounds = printBounds(sheet);
  const margins = pageMargins(sheet);
  const layout = sheet.pageSetup.orientation === 'landscape' ? 'landscape' : 'portrait';
  const doc = new PDFDocument({
    size: 'A4',
    layout,
    margins,
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
  });
  registerFonts(doc);
  const output = collectPdf(doc);

  const pageWidth = layout === 'landscape' ? 841.89 : 595.28;
  const pageHeight = layout === 'landscape' ? 595.28 : 841.89;
  const naturalWidth = Array.from(
    { length: bounds.lastColumn - bounds.firstColumn + 1 },
    (_, index) => columnPoints(sheet, bounds.firstColumn + index),
  ).reduce((sum, width) => sum + width, 0);
  const availableWidth = pageWidth - margins.left - margins.right;
  // Keep the generated-at footer inside PDFKit's writable area. Drawing it below
  // the bottom margin makes PDFKit silently append an otherwise empty page.
  const availableHeight = pageHeight - margins.top - margins.bottom - PDF_FOOTER_HEIGHT;
  const configuredScale = Number(sheet.pageSetup.scale);
  const naturalHeight = Array.from({ length: bounds.lastRow - bounds.firstRow + 1 }, (_, index) =>
    rowPoints(sheet, bounds.firstRow + index),
  ).reduce((sum, height) => sum + height, 0);
  const scale = Math.min(
    Number.isFinite(configuredScale) && configuredScale > 0 ? configuredScale / 100 : 1,
    availableWidth / naturalWidth,
    data.form === 'personal-card' ? availableHeight / naturalHeight : 1,
  );
  const positions = positionMaps(sheet, bounds, scale);
  const titles = printTitleRows(sheet);
  const pages = rowPages(sheet, bounds, availableHeight, scale, titles);
  const merges = mergeModels(sheet);

  for (const [pageIndex, pageRows] of pages.entries()) {
    doc.addPage({ size: 'A4', layout, margins });
    const originX = margins.left + Math.max(0, (availableWidth - positions.totalWidth) / 2);
    let originY = margins.top;
    if (pageRows.repeatTitles && titles) {
      drawPage({
        doc,
        sheet,
        bounds,
        pageRows: titles,
        merges,
        scale,
        originX,
        originY,
        columnWidths: positions.columnWidths,
        columnX: positions.columnX,
      });
      originY += heightBetween(sheet, titles.start, titles.end, scale);
    }
    drawPage({
      doc,
      sheet,
      bounds,
      pageRows,
      merges,
      scale,
      originX,
      originY,
      columnWidths: positions.columnWidths,
      columnX: positions.columnX,
    });
    doc
      .font('Sans')
      .fontSize(5)
      .fillColor('#555')
      .text(
        `Страница ${pageIndex + 1} из ${pages.length} · сформировано ${new Date(data.generatedAt).toLocaleString('ru-RU')} · источники: ${(data.dataSources ?? []).join(', ') || 'расчётные данные'}`,
        margins.left,
        pageHeight - margins.bottom - PDF_FOOTER_HEIGHT,
        { width: pageWidth - margins.left - margins.right, align: 'right', lineBreak: false },
      );
  }

  doc.end();
  return output;
}
