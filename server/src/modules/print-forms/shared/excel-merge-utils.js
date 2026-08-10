export function mergeModels(sheet) {
  return Object.values(sheet._merges ?? {}).map((merge) => ({ ...merge.model }));
}

export function rangeAddress(sheet, model) {
  return `${sheet.getCell(model.top, model.left).address}:${
    sheet.getCell(model.bottom, model.right).address
  }`;
}

export function shiftMerge(model, delta) {
  return {
    ...model,
    top: model.top + delta,
    bottom: model.bottom + delta,
  };
}
