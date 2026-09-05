/**
 * Импорт матрицы «Доп заказ» (листы ЖЕНЩИНЫ / МУЖЧИНЫ):
 * — полный размерный ряд в каталоге размеров;
 * — номенклатура по колонкам таблицы;
 * — без поступлений и экземпляров (остатки на складе = 0).
 *
 * Usage: pnpm --filter @workwear/server import:order-matrix -- <path-to.xlsx>
 */
import fs from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { models, sequelize } from './models/index.js';

const inputPath = process.argv.slice(2).find((argument) => argument !== '--');
if (!inputPath) {
  console.error('Usage: pnpm --filter @workwear/server import:order-matrix -- <path-to.xlsx>');
  process.exit(2);
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'object' && 'result' in value) return normalizeText(value.result);
  if (typeof value === 'object' && 'text' in value) return normalizeText(value.text);
  return normalizeText(value);
}

function parseCompoundSize(text) {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(normalizeText(text));
  if (!match) return null;
  return { clothing: match[1], height: match[2] };
}

function extractTu(text) {
  const match = /ТУ\s*[\d.]+-\d+/.exec(normalizeText(text));
  return match ? match[0].replace(/\s+/g, ' ') : null;
}

function inferSizeType(name) {
  const value = normalizeText(name).toLowerCase();
  if (/ремень|ремни|ту\s*14\.19/.test(value)) return 'belt';
  return 'clothing';
}

async function findOrCreateSize(type, value, transaction) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const sortOrder = Number.parseInt(normalized, 10) || 0;
  const [size, created] = await models.Size.findOrCreate({
    where: { type, value: normalized },
    defaults: { type, value: normalized, sortOrder },
    transaction,
  });
  return { size, created };
}

async function findOrCreateModel(spec, transaction) {
  const name = normalizeText(spec.name);
  if (!name) return { model: null, created: false };
  const existing = await models.NomenclatureModel.findOne({
    where: { name },
    transaction,
  });
  if (existing) return { model: existing, created: false };

  const model = await models.NomenclatureModel.create(
    {
      name,
      article: spec.article,
      unit: 'шт',
      sizeType: spec.sizeType,
      requiresHeightSize: spec.requiresHeightSize,
      genderCategory: spec.genderCategory,
      rentalPrice: 0,
      rentalVatRate: 5,
      description: spec.description,
    },
    { transaction },
  );
  return { model, created: true };
}

function parseSheet(sheet, genderCategory) {
  const clothingSizes = new Set();
  const heightSizes = new Set();
  const beltSizes = new Set();
  const products = new Map();

  const maxCol = sheet.columnCount || 30;
  const beltColumns = new Set();

  for (let column = 3; column <= maxCol; column += 1) {
    const row6 = cellText(sheet.getCell(6, column));
    if (row6.toUpperCase().includes('РЕМНИ')) beltColumns.add(column);
  }

  for (let row = 6; row <= sheet.rowCount; row += 1) {
    const compound = parseCompoundSize(cellText(sheet.getCell(row, 2)));
    if (compound) {
      clothingSizes.add(compound.clothing);
      heightSizes.add(compound.height);
    }
    for (const column of beltColumns) {
      const beltValue = cellText(sheet.getCell(row, column));
      if (/^\d{2,3}$/.test(beltValue)) beltSizes.add(beltValue);
    }
  }

  for (let column = 3; column <= maxCol; column += 1) {
    const header = cellText(sheet.getCell(2, column));
    if (!header || header === 'Размеры') continue;

    const row6 = cellText(sheet.getCell(6, column));
    const row7 = cellText(sheet.getCell(7, column));
    const isBelt = row6.toUpperCase().includes('РЕМНИ') || inferSizeType(header) === 'belt';

    let name = header;
    if (isBelt) {
      name = row7 ? `Ремень ${row7}` : 'Ремень';
    }

    const tu = extractTu(name) ?? extractTu(row7);
    const key = `${genderCategory}:${tu ?? name.toLowerCase()}`;
    if (products.has(key)) continue;

    products.set(key, {
      name: normalizeText(name),
      article: tu,
      sizeType: isBelt ? 'belt' : 'clothing',
      requiresHeightSize: !isBelt,
      genderCategory,
      description: `Импорт матрицы заказа (${sheet.name})`,
    });
  }

  return {
    clothingSizes: [...clothingSizes].sort((a, b) => Number(a) - Number(b)),
    heightSizes: [...heightSizes].sort((a, b) => Number(a) - Number(b)),
    beltSizes: [...beltSizes].sort((a, b) => Number(a) - Number(b)),
    products: [...products.values()],
  };
}

async function main() {
  const buffer = await fs.readFile(inputPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets = [
    { name: 'ЖЕНЩИНЫ', genderCategory: 'female' },
    { name: 'МУЖЧИНЫ', genderCategory: 'male' },
  ];

  const parsed = sheets
    .map((meta) => {
      const sheet = workbook.getWorksheet(meta.name);
      if (!sheet) return null;
      return { ...meta, data: parseSheet(sheet, meta.genderCategory) };
    })
    .filter(Boolean);

  if (parsed.length === 0) {
    throw new Error('Не найдены листы «ЖЕНЩИНЫ» и «МУЖЧИНЫ»');
  }

  const stats = {
    sizesCreated: 0,
    modelsCreated: 0,
    sizes: { clothing: 0, height: 0, belt: 0 },
    models: 0,
  };

  await sequelize.transaction(async (transaction) => {
    const allClothing = new Set();
    const allHeight = new Set();
    const allBelt = new Set();
    const allProducts = [];

    for (const sheet of parsed) {
      sheet.data.clothingSizes.forEach((v) => allClothing.add(v));
      sheet.data.heightSizes.forEach((v) => allHeight.add(v));
      sheet.data.beltSizes.forEach((v) => allBelt.add(v));
      allProducts.push(...sheet.data.products);
    }

    for (const value of allClothing) {
      const { created } = await findOrCreateSize('clothing', value, transaction);
      if (created) stats.sizesCreated += 1;
      stats.sizes.clothing += 1;
    }
    for (const value of allHeight) {
      const { created } = await findOrCreateSize('height', value, transaction);
      if (created) stats.sizesCreated += 1;
      stats.sizes.height += 1;
    }
    for (const value of allBelt) {
      const { created } = await findOrCreateSize('belt', value, transaction);
      if (created) stats.sizesCreated += 1;
      stats.sizes.belt += 1;
    }

    for (const product of allProducts) {
      const { created } = await findOrCreateModel(product, transaction);
      if (created) stats.modelsCreated += 1;
      stats.models += 1;
    }
  });

  console.log('Импорт матрицы заказа завершён.');
  console.log(`Файл: ${inputPath}`);
  console.log(
    `Размеры: одежда ${stats.sizes.clothing}, рост ${stats.sizes.height}, ремень ${stats.sizes.belt} (новых ${stats.sizesCreated})`,
  );
  console.log(`Номенклатура: ${stats.models} позиций (новых ${stats.modelsCreated})`);
  console.log('Поступления не создавались — остатки на складе остаются нулевыми.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => sequelize.close());
