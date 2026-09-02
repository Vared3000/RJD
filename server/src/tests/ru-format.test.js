import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commonNarrative } from '../modules/print-forms/shared/ru-format.js';

function fixture(dpoOverrides = {}) {
  return {
    dpo: {
      name: 'Московское ДПО',
      fullName: 'Московская дирекция пассажирских обустройств',
      directorFullName: 'Иванов Иван Иванович',
      directorFullNameGenitive: 'Заданного Родительного ФИО',
      directorBasis: 'доверенности',
      contractNumber: '123',
      contractDate: '2026-09-01',
      ...dpoOverrides,
    },
    parties: {
      customer: { fullName: 'Заказчик' },
      executor: {
        fullName: 'Исполнитель',
        directorPosition: 'директора',
        directorFullName: 'Петров Пётр Петрович',
        directorBasis: 'устава',
      },
    },
  };
}

test('общая преамбула 1.5/1.7: номер договора перед датой и заданный родительный падеж', () => {
  const narrative = commonNarrative(fixture(), 'составили настоящий акт');
  assert.match(narrative, /Заданного Родительного ФИО/);
  assert.match(narrative, /к договору № 123 от 01\.09\.2026, заключенному/);
  assert.doesNotMatch(narrative, /к договору от .* №/);
});

test('общая преамбула: fallback ФИО и неполные реквизиты договора не ломают текст', () => {
  const withoutNumber = commonNarrative(
    fixture({ directorFullNameGenitive: null, contractNumber: null }),
    'составили настоящий акт',
  );
  assert.match(withoutNumber, /Иванова Ивана Ивановича/);
  assert.match(withoutNumber, /к договору от 01\.09\.2026, заключенному/);

  const withoutDate = commonNarrative(fixture({ contractDate: null }), 'составили настоящий акт');
  assert.match(withoutDate, /к договору № 123, заключенному/);
});
