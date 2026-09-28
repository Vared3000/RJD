export const BUSINESS_UNIT_CODES = Object.freeze([
  { direction: 'Центральная', code: '3530' },
  { direction: 'Октябрьская', code: '4421' },
  { direction: 'Калининградская', code: '4422' },
  { direction: 'Московская', code: '4423' },
  { direction: 'Горьковская', code: '4424' },
  { direction: 'Северная', code: '4425' },
  { direction: 'Северо-Кавказская', code: '4426' },
  { direction: 'Юго-Восточная', code: '4427' },
  { direction: 'Приволжская', code: '4428' },
  { direction: 'Куйбышевская', code: '4429' },
  { direction: 'Свердловская', code: '4430' },
  { direction: 'Южно-Уральская', code: '4431' },
  { direction: 'Западно-Сибирская', code: '4432' },
  { direction: 'Красноярская', code: '4433' },
  { direction: 'Восточно-Сибирская', code: '4434' },
  { direction: 'Забайкальская', code: '4435' },
  { direction: 'Дальневосточная', code: '4436' },
]);

export const BUSINESS_UNIT_CODE_VALUES = Object.freeze(BUSINESS_UNIT_CODES.map(({ code }) => code));

export function isKnownBusinessUnitCode(value) {
  return BUSINESS_UNIT_CODE_VALUES.includes(value);
}
