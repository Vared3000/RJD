import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { printFormTemplatesApi } from '../api/print-form-templates-api.js';
import { mutationErrorMessage, parseBlobApiError } from '../../../shared/lib/parse-api-error.js';
import { Button } from '../../../shared/ui/Button.jsx';
import { QueryState } from '../../../shared/ui/QueryState.jsx';
import styles from './TemplateVisualEditor.module.css';

const FORM_LABELS = {
  'fpu-26': 'ФПУ-26',
  'appendix-1-5': 'Приложение 1.5',
  'appendix-1-7': 'Приложение 1.7',
  'personal-card': 'Личная карточка работника',
  'preservation-receipt': 'Сохранная расписка',
};

const BORDER_STYLE = { style: 'thin', color: { argb: 'FF64748B' } };

const PAPER_SIZES = [
  { value: 9, label: 'A4 (210×297 мм)' },
  { value: 8, label: 'A3 (297×420 мм)' },
  { value: 11, label: 'A5 (148×210 мм)' },
  { value: 1, label: 'Letter' },
];

const MARKER_GROUPS = [
  { key: 'document', label: 'Документ' },
  { key: 'parties', label: 'Организации и ДПО' },
  { key: 'table', label: 'Строки таблицы' },
  { key: 'totals', label: 'Итоги' },
  { key: 'signatures', label: 'Подписи' },
];

const MARKER_META = {
  TABLE_START: { label: 'Начало строк таблицы', group: 'table' },
  TABLE_END: { label: 'Конец строк таблицы', group: 'table' },
  CUSTOMER_NAME: { label: 'Заказчик: название и адрес', group: 'parties' },
  CUSTOMER_OKPO: { label: 'ОКПО заказчика', group: 'parties' },
  DPO_NAME: { label: 'Краткое название ДПО', group: 'parties' },
  DPO_FULL_NAME: { label: 'Полное название ДПО', group: 'parties' },
  DPO_LINE: { label: 'Строка подразделения ДПО', group: 'parties' },
  BUSINESS_UNIT_CODE: { label: 'Код подразделения', group: 'parties' },
  EXECUTOR_NAME: { label: 'Исполнитель: название', group: 'parties' },
  EXECUTOR_ADDRESS: { label: 'Адрес исполнителя', group: 'parties' },
  EXECUTOR_OKPO: { label: 'ОКПО исполнителя', group: 'parties' },
  EXECUTOR_LINE: { label: 'Строка исполнителя', group: 'parties' },
  PERIOD_END: { label: 'Дата окончания периода', group: 'document' },
  PERIOD_DESCRIPTION: { label: 'Описание периода', group: 'document' },
  ACT_TITLE: { label: 'Название акта', group: 'document' },
  ACT_DATE: { label: 'Дата акта', group: 'document' },
  ACT_NARRATIVE: { label: 'Вводный текст акта', group: 'document' },
  RECEIPT_DATE: { label: 'Дата расписки', group: 'document' },
  OPENED_DATE: { label: 'Дата открытия карточки', group: 'document' },
  EMPLOYEE_LINE: { label: 'Работник и должность', group: 'document' },
  CLOTHING_SIZE_LINE: { label: 'Размер одежды и рост', group: 'document' },
  GLOVES_SIZE_LINE: { label: 'Размер перчаток', group: 'document' },
  HEADWEAR_SIZE_LINE: { label: 'Размер головного убора', group: 'document' },
  BELT_SIZE_LINE: { label: 'Размер ремня', group: 'document' },
  HIRE_DATE: { label: 'Дата приёма', group: 'document' },
  TERMINATION_DATE: { label: 'Дата увольнения', group: 'document' },
  CONTRACT_LINE: { label: 'Договор', group: 'document' },
  SIGNATURE_CONTRACT_LINE: { label: 'Договор у подписей', group: 'signatures' },
  EXECUTOR_SIGNATORY: { label: 'Подписант исполнителя', group: 'signatures' },
  EXECUTOR_BASIS: { label: 'Основание полномочий исполнителя', group: 'signatures' },
  DPO_HEAD_TITLE: { label: 'Должность начальника ДПО', group: 'signatures' },
  DPO_HEAD_SIGNATURE_LABEL: { label: 'Подпись начальника ДПО', group: 'signatures' },
  DPO_DIRECTOR_NAME: { label: 'ФИО руководителя ДПО', group: 'signatures' },
  DPO_DIRECTOR_BASIS: { label: 'Основание полномочий руководителя', group: 'signatures' },
  DPO_DIRECTOR_SIGNATURE: { label: 'Фамилия и инициалы руководителя', group: 'signatures' },
  GRAND_TOTAL_COST: { label: 'Итого без НДС', group: 'totals' },
  GRAND_TOTAL_VAT: { label: 'Итого НДС', group: 'totals' },
  GRAND_TOTAL: { label: 'Итого с НДС', group: 'totals' },
  GRAND_TOTAL_COST_REPEAT: { label: 'Итого без НДС — повтор', group: 'totals' },
  GRAND_TOTAL_VAT_REPEAT: { label: 'Итого НДС — повтор', group: 'totals' },
  GRAND_TOTAL_REPEAT: { label: 'Итого с НДС — повтор', group: 'totals' },
  TOTAL_VAT: { label: 'Итого НДС', group: 'totals' },
  TOTAL_WITH_VAT: { label: 'Итого с НДС', group: 'totals' },
  AMOUNT_IN_WORDS: { label: 'Сумма прописью', group: 'totals' },
  CUSTOMER_SIGNATURE: { label: 'Подпись заказчика', group: 'signatures' },
  'ROW.SEQUENCE_NUMBER': { label: '№ строки', group: 'table' },
  'ROW.EMPLOYEE_NAME': { label: 'ФИО работника', group: 'table' },
  'ROW.PERSONNEL_NUMBER': { label: 'Табельный номер', group: 'table' },
  'ROW.POSITION_NAME': { label: 'Должность', group: 'table' },
  'ROW.MODEL_NAME': { label: 'Наименование одежды', group: 'table' },
  'ROW.INVENTORY_NUMBER': { label: 'Инвентарный номер', group: 'table' },
  'ROW.UNIT': { label: 'Единица измерения', group: 'table' },
  'ROW.QUANTITY': { label: 'Количество', group: 'table' },
  'ROW.NORM_QUANTITY': { label: 'Количество по норме', group: 'table' },
  'ROW.COVERAGE_DAYS': { label: 'Дни обеспечения', group: 'table' },
  'ROW.SERVICE_LIFE_YEARS': { label: 'Срок использования', group: 'table' },
  'ROW.ISSUED_QUANTITY': { label: 'Выдано: количество', group: 'table' },
  'ROW.ISSUED_DATE': { label: 'Выдано: дата', group: 'table' },
  'ROW.RETURNED_QUANTITY': { label: 'Возвращено: количество', group: 'table' },
  'ROW.RETURNED_DATE': { label: 'Возвращено: дата', group: 'table' },
  'ROW.PRICE_WITHOUT_VAT': { label: 'Расчётная цена без НДС', group: 'table' },
  'ROW.DISPLAYED_PRICE_WITHOUT_VAT': { label: 'Цена без НДС в документе', group: 'table' },
  'ROW.COST_WITHOUT_VAT': { label: 'Стоимость без НДС', group: 'table' },
  'ROW.TOTAL_WITHOUT_VAT': { label: 'Итого без НДС', group: 'table' },
  'ROW.VAT_AMOUNT': { label: 'Сумма НДС', group: 'table' },
  'ROW.TOTAL_WITH_VAT': { label: 'Стоимость с НДС', group: 'table' },
  'ROW.SIGNATURE': { label: 'Подпись работника', group: 'signatures' },
};

function markerMeta(marker) {
  return (
    MARKER_META[marker] ?? {
      label: marker
        .replace(/^ROW\./, '')
        .replaceAll('_', ' ')
        .toLocaleLowerCase('ru-RU'),
      group: marker.startsWith('ROW.') ? 'table' : 'document',
    }
  );
}

function clone(value) {
  return structuredClone(value);
}

function keyOf(row, column) {
  return `${row}:${column}`;
}

function columnName(index) {
  let value = index;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function normalizedSelection(selection) {
  return {
    top: Math.min(selection.anchor.row, selection.focus.row),
    left: Math.min(selection.anchor.column, selection.focus.column),
    bottom: Math.max(selection.anchor.row, selection.focus.row),
    right: Math.max(selection.anchor.column, selection.focus.column),
  };
}

function inSelection(cell, selection) {
  return (
    cell.row >= selection.top &&
    cell.row <= selection.bottom &&
    cell.column >= selection.left &&
    cell.column <= selection.right
  );
}

function containingMerge(merges, row, column) {
  return merges.find(
    (merge) =>
      row >= merge.top && row <= merge.bottom && column >= merge.left && column <= merge.right,
  );
}

function colorToHex(color, fallback) {
  const argb = color?.argb;
  return typeof argb === 'string' && argb.length === 8 ? `#${argb.slice(2)}` : fallback;
}

function colorFromHex(value) {
  return { argb: `FF${value.replace('#', '').toUpperCase()}` };
}

function cellCss(style = {}) {
  const border = style.border ?? {};
  const borderCss = (side) =>
    border[side]?.style ? `1px solid ${colorToHex(border[side].color, '#64748b')}` : undefined;
  return {
    fontFamily: style.font?.name,
    fontSize: style.font?.size ? `${style.font.size}px` : undefined,
    fontWeight: style.font?.bold ? 700 : undefined,
    fontStyle: style.font?.italic ? 'italic' : undefined,
    textDecoration: style.font?.underline ? 'underline' : undefined,
    color: colorToHex(style.font?.color, undefined),
    backgroundColor:
      style.fill?.type === 'pattern' ? colorToHex(style.fill?.fgColor, undefined) : undefined,
    textAlign: style.alignment?.horizontal,
    verticalAlign: style.alignment?.vertical === 'middle' ? 'middle' : style.alignment?.vertical,
    whiteSpace: style.alignment?.wrapText ? 'pre-wrap' : 'pre',
    borderTop: borderCss('top'),
    borderRight: borderCss('right'),
    borderBottom: borderCss('bottom'),
    borderLeft: borderCss('left'),
  };
}

function internStyle(layout, nextStyle) {
  const encoded = JSON.stringify(nextStyle);
  const existing = layout.styles.findIndex((style) => JSON.stringify(style) === encoded);
  if (existing >= 0) return existing;
  layout.styles.push(nextStyle);
  return layout.styles.length - 1;
}

function ToolbarButton({ active = false, children, ...props }) {
  return (
    <button
      type="button"
      className={`${styles.toolButton} ${active ? styles.toolButtonActive : ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

function LoadedTemplateVisualEditor({
  version,
  dpoId,
  employeeId,
  from,
  to,
  onClose,
  onSaved,
  loadedLayout,
  isNew = false,
}) {
  const queryClient = useQueryClient();
  const [layout, setLayout] = useState(() => clone(loadedLayout));
  const [initialLayout] = useState(() => clone(loadedLayout));
  const [selection, setSelection] = useState({
    anchor: { row: 1, column: 1 },
    focus: { row: 1, column: 1 },
  });
  const [comment, setComment] = useState('');
  const [localError, setLocalError] = useState('');
  const [previewing, setPreviewing] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        layout,
        dpoId,
        employeeId,
        from,
        to,
        comment,
      };
      return isNew
        ? printFormTemplatesApi.saveNewLayout(version.formType, payload)
        : printFormTemplatesApi.saveLayout(version.id, payload);
    },
    onSuccess: async (savedVersion) => {
      await queryClient.invalidateQueries({
        queryKey: ['print-form-templates', version.formType],
      });
      onSaved(savedVersion);
    },
    meta: { successMessage: 'Макет сохранён как новая версия' },
  });

  const bounds = useMemo(() => normalizedSelection(selection), [selection]);
  const activeCell = layout?.cells.find(
    (cell) => cell.row === selection.focus.row && cell.column === selection.focus.column,
  );
  const activeStyle = layout?.styles[activeCell?.styleId] ?? {};
  const dirty = Boolean(
    layout && initialLayout && JSON.stringify(layout) !== JSON.stringify(initialLayout),
  );
  const selectedLabel = `${columnName(bounds.left)}${bounds.top}${
    bounds.top !== bounds.bottom || bounds.left !== bounds.right
      ? `:${columnName(bounds.right)}${bounds.bottom}`
      : ''
  }`;
  const markerGroups = MARKER_GROUPS.map((group) => ({
    ...group,
    markers: layout.allowedMarkers.filter((marker) => markerMeta(marker).group === group.key),
  })).filter((group) => group.markers.length > 0);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function changeLayout(mutator) {
    setLayout((current) => {
      const next = clone(current);
      mutator(next);
      return next;
    });
  }

  function applyStyle(change) {
    changeLayout((next) => {
      for (const cell of next.cells.filter((item) => inSelection(item, bounds))) {
        const style = clone(next.styles[cell.styleId] ?? {});
        change(style);
        cell.styleId = internStyle(next, style);
      }
    });
  }

  function setCellValue(value) {
    if (!activeCell?.editable) return;
    changeLayout((next) => {
      const cell = next.cells.find(
        (item) => item.row === activeCell.row && item.column === activeCell.column,
      );
      cell.value = value;
    });
  }

  function insertMarker(marker) {
    if (!activeCell?.editable) return;
    const current = activeCell.value == null ? '' : String(activeCell.value);
    setCellValue(`${current}{{${marker}}}`);
  }

  function mergeSelection() {
    if (bounds.top === bounds.bottom && bounds.left === bounds.right) return;
    const intersects = layout.merges.some(
      (merge) =>
        !(
          merge.bottom < bounds.top ||
          merge.top > bounds.bottom ||
          merge.right < bounds.left ||
          merge.left > bounds.right
        ),
    );
    if (intersects) {
      setLocalError('Сначала разъедините ячейки, пересекающие выбранную область');
      return;
    }
    setLocalError('');
    changeLayout((next) => {
      next.merges.push(bounds);
      for (const cell of next.cells) {
        if (inSelection(cell, bounds)) {
          cell.editable = cell.row === bounds.top && cell.column === bounds.left;
        }
      }
    });
  }

  function unmergeSelection() {
    const merge = containingMerge(layout.merges, selection.focus.row, selection.focus.column);
    if (!merge) return;
    changeLayout((next) => {
      next.merges = next.merges.filter(
        (item) =>
          item !==
          next.merges.find(
            (candidate) =>
              candidate.top === merge.top &&
              candidate.left === merge.left &&
              candidate.bottom === merge.bottom &&
              candidate.right === merge.right,
          ),
      );
      for (const cell of next.cells) {
        if (inSelection(cell, merge)) cell.editable = true;
      }
    });
  }

  function closeEditor() {
    if (dirty && !window.confirm('Есть несохранённые изменения. Закрыть редактор?')) return;
    onClose();
  }

  function submitSave() {
    setLocalError('');
    if (version.formType === 'personal-card' ? !employeeId : !dpoId) {
      setLocalError(
        version.formType === 'personal-card'
          ? 'Перед открытием редактора выберите работника на странице конструктора'
          : 'Перед открытием редактора выберите ДПО на странице конструктора',
      );
      return;
    }
    save.mutate();
  }

  async function preview(format) {
    setLocalError('');
    if (version.formType === 'personal-card' ? !employeeId : !dpoId) {
      setLocalError(
        version.formType === 'personal-card'
          ? 'Перед открытием редактора выберите работника на странице конструктора'
          : 'Перед открытием редактора выберите ДПО на странице конструктора',
      );
      return;
    }
    setPreviewing(format);
    try {
      const payload = {
        layout,
        format,
        dpoId,
        employeeId,
        from,
        to,
      };
      if (isNew) {
        await printFormTemplatesApi.previewNewLayout(version.formType, payload);
      } else {
        await printFormTemplatesApi.previewLayout(version.id, payload);
      }
    } catch (error) {
      setLocalError(await parseBlobApiError(error));
    } finally {
      setPreviewing('');
    }
  }

  return (
    <div className={styles.editorPage}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Визуальный редактор</p>
          <h1>
            {FORM_LABELS[version.formType] ?? version.formType} ·{' '}
            {isNew ? 'новый собственный макет' : `версия ${version.versionNumber}`}
          </h1>
          <p>
            {isNew
              ? 'Соберите документ на чистом листе. Сохранение создаст новую версию.'
              : 'Изменения сохраняются отдельной версией и не затрагивают действующий макет.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={closeEditor}>
            Назад к версиям
          </Button>
          <Button
            variant="secondary"
            onClick={() => preview('xlsx')}
            disabled={!layout || Boolean(previewing) || save.isPending}
          >
            {previewing === 'xlsx' ? 'Формирование…' : 'Предпросмотр Excel'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => preview('pdf')}
            disabled={!layout || Boolean(previewing) || save.isPending}
          >
            {previewing === 'pdf' ? 'Формирование…' : 'Предпросмотр PDF'}
          </Button>
          <Button onClick={submitSave} disabled={!layout || save.isPending || !dirty}>
            {save.isPending ? 'Проверка и сохранение…' : 'Сохранить новую версию'}
          </Button>
        </div>
      </header>

      {layout && (
        <>
          <section className={styles.toolbar} aria-label="Форматирование макета">
            <div className={styles.toolbarGroup}>
              <span className={styles.selectionName}>{selectedLabel}</span>
              <input
                className={styles.valueInput}
                value={activeCell?.value ?? ''}
                onChange={(event) => setCellValue(event.target.value)}
                disabled={!activeCell?.editable}
                aria-label="Содержимое выбранной ячейки"
                title={
                  !activeCell?.editable
                    ? 'Формулу или подчинённую объединённую ячейку нельзя менять'
                    : undefined
                }
              />
            </div>

            <div className={styles.toolbarGroup}>
              <select
                value={activeStyle.font?.name ?? 'Arial'}
                onChange={(event) =>
                  applyStyle((style) => {
                    style.font = { ...style.font, name: event.target.value };
                  })
                }
                aria-label="Шрифт"
              >
                {['Arial', 'Calibri', 'Times New Roman', 'DejaVu Sans'].map((font) => (
                  <option key={font}>{font}</option>
                ))}
              </select>
              <input
                className={styles.numberInput}
                type="number"
                min="6"
                max="72"
                value={activeStyle.font?.size ?? 10}
                onChange={(event) =>
                  applyStyle((style) => {
                    style.font = { ...style.font, size: Number(event.target.value) };
                  })
                }
                aria-label="Размер шрифта"
              />
              <ToolbarButton
                active={Boolean(activeStyle.font?.bold)}
                onClick={() =>
                  applyStyle((style) => {
                    style.font = { ...style.font, bold: !style.font?.bold };
                  })
                }
                title="Полужирный"
              >
                Ж
              </ToolbarButton>
              <ToolbarButton
                active={Boolean(activeStyle.font?.italic)}
                onClick={() =>
                  applyStyle((style) => {
                    style.font = { ...style.font, italic: !style.font?.italic };
                  })
                }
                title="Курсив"
              >
                <em>К</em>
              </ToolbarButton>
              <label className={styles.colorControl} title="Цвет текста">
                A
                <input
                  type="color"
                  value={colorToHex(activeStyle.font?.color, '#111827')}
                  onChange={(event) =>
                    applyStyle((style) => {
                      style.font = { ...style.font, color: colorFromHex(event.target.value) };
                    })
                  }
                />
              </label>
              <label className={styles.colorControl} title="Цвет заливки">
                ▰
                <input
                  type="color"
                  value={colorToHex(activeStyle.fill?.fgColor, '#ffffff')}
                  onChange={(event) =>
                    applyStyle((style) => {
                      style.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: colorFromHex(event.target.value),
                      };
                    })
                  }
                />
              </label>
            </div>

            <div className={styles.toolbarGroup}>
              {[
                ['left', 'По левому краю', '≡'],
                ['center', 'По центру', '≣'],
                ['right', 'По правому краю', '≡'],
              ].map(([value, title, icon]) => (
                <ToolbarButton
                  key={value}
                  active={activeStyle.alignment?.horizontal === value}
                  onClick={() =>
                    applyStyle((style) => {
                      style.alignment = { ...style.alignment, horizontal: value };
                    })
                  }
                  title={title}
                >
                  {icon}
                </ToolbarButton>
              ))}
              <ToolbarButton
                active={Boolean(activeStyle.alignment?.wrapText)}
                onClick={() =>
                  applyStyle((style) => {
                    style.alignment = {
                      ...style.alignment,
                      wrapText: !style.alignment?.wrapText,
                    };
                  })
                }
                title="Перенос текста"
              >
                ↵
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  applyStyle((style) => {
                    style.border = {
                      top: BORDER_STYLE,
                      right: BORDER_STYLE,
                      bottom: BORDER_STYLE,
                      left: BORDER_STYLE,
                    };
                  })
                }
              >
                Все границы
              </ToolbarButton>
              <ToolbarButton
                onClick={() =>
                  applyStyle((style) => {
                    delete style.border;
                  })
                }
              >
                Без границ
              </ToolbarButton>
            </div>

            <div className={styles.toolbarGroup}>
              <label>
                Высота строки
                <input
                  className={styles.numberInput}
                  type="number"
                  min="2"
                  max="500"
                  value={layout.rows[selection.focus.row - 1]?.height ?? 15}
                  onChange={(event) =>
                    changeLayout((next) => {
                      for (let row = bounds.top; row <= bounds.bottom; row += 1) {
                        next.rows[row - 1].height = Number(event.target.value);
                      }
                    })
                  }
                />
              </label>
              <label>
                Ширина столбца
                <input
                  className={styles.numberInput}
                  type="number"
                  min="0"
                  max="150"
                  value={layout.columns[selection.focus.column - 1]?.width ?? 8.43}
                  onChange={(event) =>
                    changeLayout((next) => {
                      for (let column = bounds.left; column <= bounds.right; column += 1) {
                        next.columns[column - 1].width = Number(event.target.value);
                      }
                    })
                  }
                />
              </label>
              <ToolbarButton onClick={mergeSelection}>Объединить</ToolbarButton>
              <ToolbarButton onClick={unmergeSelection}>Разъединить</ToolbarButton>
            </div>

            <div className={styles.toolbarGroup}>
              <label>
                Формат листа
                <select
                  value={layout.pageSetup.paperSize}
                  onChange={(event) =>
                    changeLayout((next) => {
                      next.pageSetup.paperSize = Number(event.target.value);
                    })
                  }
                >
                  {PAPER_SIZES.map((paper) => (
                    <option key={paper.value} value={paper.value}>
                      {paper.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ориентация
                <select
                  value={layout.pageSetup.orientation}
                  onChange={(event) =>
                    changeLayout((next) => {
                      next.pageSetup.orientation = event.target.value;
                    })
                  }
                >
                  <option value="portrait">Книжная</option>
                  <option value="landscape">Альбомная</option>
                </select>
              </label>
              <label>
                Масштаб, %
                <input
                  className={styles.numberInput}
                  type="number"
                  min="10"
                  max="400"
                  value={layout.pageSetup.scale}
                  onChange={(event) =>
                    changeLayout((next) => {
                      next.pageSetup.scale = Number(event.target.value);
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section className={styles.markerBar}>
            <div>
              <strong>Поля документа</strong>
              <span>Выберите ячейку и нажмите понятное название нужного поля.</span>
            </div>
            <div className={styles.markerGroups}>
              {markerGroups.map((group) => (
                <div className={styles.markerGroup} key={group.key}>
                  <span className={styles.markerGroupTitle}>{group.label}</span>
                  <div className={styles.markerList}>
                    {group.markers.map((marker) => (
                      <button
                        key={marker}
                        type="button"
                        title={`Техническое поле: {{${marker}}}`}
                        onClick={() => insertMarker(marker)}
                      >
                        {markerMeta(marker).label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {isNew && (
            <p className={styles.draftHint}>
              Сначала разместите «Начало строк таблицы», «Конец строк таблицы» и нужные поля строки.
              Черновик с ошибками можно сохранить, но предпросмотр и активация станут доступны
              только после заполнения обязательных полей.
            </p>
          )}

          <div className={styles.workspace}>
            <table className={styles.sheet}>
              <colgroup>
                <col className={styles.rowNumbersColumn} />
                {layout.columns.map((column) => (
                  <col
                    key={column.index}
                    style={{ width: `${Math.max(32, column.width * 7)}px` }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className={styles.corner} />
                  {layout.columns.map((column) => (
                    <th key={column.index}>{columnName(column.index)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {layout.rows.map((row) => (
                  <tr key={row.index} style={{ height: `${Math.max(20, row.height * 1.33)}px` }}>
                    <th>{row.index}</th>
                    {layout.cells
                      .filter((cell) => cell.row === row.index)
                      .map((cell) => {
                        const merge = containingMerge(layout.merges, cell.row, cell.column);
                        if (merge && (merge.top !== cell.row || merge.left !== cell.column))
                          return null;
                        const selected = inSelection(cell, bounds);
                        return (
                          <td
                            key={keyOf(cell.row, cell.column)}
                            rowSpan={merge ? merge.bottom - merge.top + 1 : undefined}
                            colSpan={merge ? merge.right - merge.left + 1 : undefined}
                            className={`${selected ? styles.selectedCell : ''} ${!cell.editable ? styles.lockedCell : ''}`}
                            style={cellCss(layout.styles[cell.styleId])}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              const point = { row: cell.row, column: cell.column };
                              setSelection((current) => ({
                                anchor: event.shiftKey ? current.anchor : point,
                                focus: point,
                              }));
                            }}
                            title={
                              !cell.editable
                                ? 'Защищённая формула или часть объединённой ячейки'
                                : undefined
                            }
                          >
                            {cell.value == null ? '' : String(cell.value)}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className={styles.settingsPanel}>
            <label>
              Имя листа
              <input
                value={layout.sheetName}
                onChange={(event) =>
                  changeLayout((next) => {
                    next.sheetName = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Область печати
              <input
                placeholder="A1:L45"
                value={layout.pageSetup.printArea}
                onChange={(event) =>
                  changeLayout((next) => {
                    next.pageSetup.printArea = event.target.value.toUpperCase();
                  })
                }
              />
            </label>
            <label className={styles.commentField}>
              Комментарий к новой версии
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Что изменили в макете"
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => setLayout(clone(initialLayout))}
              disabled={!dirty}
            >
              Сбросить изменения
            </Button>
          </section>

          {(localError || save.isError) && (
            <p className={styles.error}>{localError || mutationErrorMessage(save)}</p>
          )}
        </>
      )}
    </div>
  );
}

export function TemplateVisualEditor(props) {
  const isNew = Boolean(props.version.isNew);
  const layoutQuery = useQuery({
    queryKey: [
      isNew ? 'print-form-template-new-layout' : 'print-form-template-layout',
      isNew ? props.version.formType : props.version.id,
    ],
    queryFn: () =>
      isNew
        ? printFormTemplatesApi.newLayout(props.version.formType)
        : printFormTemplatesApi.layout(props.version.id),
  });

  return (
    <QueryState query={layoutQuery} loadingText="Открываем Excel-макет…">
      {layoutQuery.data?.layout && (
        <LoadedTemplateVisualEditor
          key={isNew ? `new:${props.version.formType}` : props.version.id}
          {...props}
          isNew={isNew}
          loadedLayout={layoutQuery.data.layout}
        />
      )}
    </QueryState>
  );
}
