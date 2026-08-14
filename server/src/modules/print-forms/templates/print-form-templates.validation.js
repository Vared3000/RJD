import { z } from 'zod';

const emptyToUndefined = (value) => (value === '' ? undefined : value);

// dpoId/from/to обязательны и на загрузке, и на превью: вместо синтетических
// тестовых данных валидность шаблона подтверждается пробной генерацией на
// реальных параметрах (см. план задачи 19, раздел «Пробная генерация»).
export const uploadTemplateSchema = z.object({
  dpoId: z.string().uuid('Выберите ДПО'),
  from: z.string().date('Некорректная дата начала'),
  to: z.string().date('Некорректная дата окончания'),
  comment: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
});

export const previewQuerySchema = z.object({
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
  dpoId: z.string().uuid('Выберите ДПО'),
  from: z.string().date('Некорректная дата начала'),
  to: z.string().date('Некорректная дата окончания'),
});

const colorSchema = z
  .object({
    argb: z
      .string()
      .regex(/^[0-9A-F]{8}$/i)
      .optional(),
    theme: z.number().int().min(0).max(20).optional(),
    indexed: z.number().int().min(0).max(255).optional(),
    tint: z.number().min(-1).max(1).optional(),
  })
  .strict();

const borderSideSchema = z
  .object({
    style: z
      .enum([
        'thin',
        'medium',
        'thick',
        'double',
        'dotted',
        'dashed',
        'dashDot',
        'dashDotDot',
        'mediumDashed',
        'mediumDashDot',
        'mediumDashDotDot',
        'slantDashDot',
        'hair',
      ])
      .optional(),
    color: colorSchema.optional(),
  })
  .strict();

const styleSchema = z
  .object({
    numFmt: z.string().max(200).optional(),
    font: z
      .object({
        name: z.string().max(100).optional(),
        size: z.number().min(1).max(100).optional(),
        family: z.number().int().min(0).max(20).optional(),
        charset: z.number().int().min(0).max(255).optional(),
        scheme: z.enum(['major', 'minor', 'none']).optional(),
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        underline: z.union([z.boolean(), z.string().max(30)]).optional(),
        strike: z.boolean().optional(),
        outline: z.boolean().optional(),
        vertAlign: z.enum(['superscript', 'subscript']).optional(),
        color: colorSchema.optional(),
      })
      .strict()
      .optional(),
    alignment: z
      .object({
        horizontal: z
          .enum(['left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed'])
          .optional(),
        vertical: z.enum(['top', 'middle', 'bottom', 'distributed', 'justify']).optional(),
        wrapText: z.boolean().optional(),
        shrinkToFit: z.boolean().optional(),
        indent: z.number().int().min(0).max(250).optional(),
        textRotation: z
          .union([z.number().int().min(-90).max(90), z.literal('vertical')])
          .optional(),
      })
      .strict()
      .optional(),
    protection: z
      .object({ locked: z.boolean().optional(), hidden: z.boolean().optional() })
      .strict()
      .optional(),
    border: z
      .object({
        top: borderSideSchema.optional(),
        right: borderSideSchema.optional(),
        bottom: borderSideSchema.optional(),
        left: borderSideSchema.optional(),
        diagonal: borderSideSchema.optional(),
        diagonalUp: z.boolean().optional(),
        diagonalDown: z.boolean().optional(),
      })
      .strict()
      .optional(),
    fill: z
      .object({
        type: z.enum(['pattern', 'gradient']).optional(),
        pattern: z.string().max(30).optional(),
        fgColor: colorSchema.optional(),
        bgColor: colorSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .strict();

const cellValueSchema = z.union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()]);

const editorLayoutSchema = z
  .object({
    sheetName: z
      .string()
      .trim()
      .min(1)
      .max(31)
      .refine((value) => !/[:*?[\]\\/]/.test(value), 'Недопустимые символы в имени листа'),
    rowCount: z.number().int().min(1).max(250),
    columnCount: z.number().int().min(1).max(50),
    cells: z
      .array(
        z
          .object({
            row: z.number().int().min(1).max(250),
            column: z.number().int().min(1).max(50),
            value: cellValueSchema,
            editable: z.boolean().optional(),
            styleId: z.number().int().min(0).max(499),
          })
          .strict(),
      )
      .max(12500),
    styles: z.array(styleSchema).min(1).max(500),
    rows: z
      .array(
        z
          .object({
            index: z.number().int().min(1).max(250),
            height: z.number().min(2).max(500),
            hidden: z.boolean(),
          })
          .strict(),
      )
      .max(250),
    columns: z
      .array(
        z
          .object({
            index: z.number().int().min(1).max(50),
            width: z.number().min(0).max(150),
            hidden: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    merges: z
      .array(
        z
          .object({
            top: z.number().int().min(1).max(250),
            left: z.number().int().min(1).max(50),
            bottom: z.number().int().min(1).max(250),
            right: z.number().int().min(1).max(50),
          })
          .strict()
          .refine((merge) => merge.top <= merge.bottom && merge.left <= merge.right),
      )
      .max(500),
    pageSetup: z
      .object({
        orientation: z.enum(['portrait', 'landscape']),
        paperSize: z.number().int().min(1).max(200),
        scale: z.number().int().min(10).max(400),
        fitToPage: z.boolean(),
        fitToWidth: z.number().int().min(0).max(20),
        fitToHeight: z.number().int().min(0).max(20),
        horizontalCentered: z.boolean(),
        verticalCentered: z.boolean(),
        printArea: z
          .string()
          .max(100)
          .refine(
            (value) => value === '' || /^\$?[A-Z]{1,2}\$?\d+:\$?[A-Z]{1,2}\$?\d+$/.test(value),
          ),
        printTitlesRow: z
          .string()
          .max(30)
          .refine((value) => value === '' || /^\$?\d+:\$?\d+$/.test(value)),
        margins: z
          .object({
            left: z.number().min(0).max(5),
            right: z.number().min(0).max(5),
            top: z.number().min(0).max(5),
            bottom: z.number().min(0).max(5),
            header: z.number().min(0).max(5),
            footer: z.number().min(0).max(5),
          })
          .strict(),
      })
      .strict(),
    // Справочник нужен только интерфейсу; при сборке Excel сервер его не использует.
    allowedMarkers: z.array(z.string().max(100)).max(200),
  })
  .strict();

export const saveEditorLayoutSchema = z
  .object({
    dpoId: z.string().uuid('Выберите ДПО'),
    from: z.string().date('Некорректная дата начала'),
    to: z.string().date('Некорректная дата окончания'),
    comment: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
    layout: editorLayoutSchema,
  })
  .strict();

export const previewEditorLayoutSchema = saveEditorLayoutSchema.extend({
  format: z.enum(['xlsx', 'pdf']),
});
