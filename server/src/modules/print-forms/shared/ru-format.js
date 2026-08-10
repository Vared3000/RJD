const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const MONTHS_NOMINATIVE = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const MONTHS_PREPOSITIONAL = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];

export function parseDateOnly(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function formatDate(value) {
  const date = parseDateOnly(value);
  return `${pad2(date.day)}.${pad2(date.month)}.${date.year}`;
}

export function formatQuotedDate(value) {
  const date = parseDateOnly(value);
  return `" ${pad2(date.day)} " ${MONTHS_GENITIVE[date.month - 1]} ${date.year}г.`;
}

export function periodDescription(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  return `в период " ${pad2(start.day)} " ${MONTHS_GENITIVE[start.month - 1]} ${start.year}г. по  " ${pad2(end.day)} " ${MONTHS_GENITIVE[end.month - 1]} ${end.year}г.:`;
}

export function periodTitle(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (start.year === end.year && start.month === end.month) {
    return `${MONTHS_NOMINATIVE[start.month - 1]} ${start.year} года`;
  }
  return `период ${formatDate(from)} - ${formatDate(to)}`;
}

export function periodPrepositional(from, to) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (start.year === end.year && start.month === end.month) {
    return `в ${MONTHS_PREPOSITIONAL[start.month - 1]} ${start.year} года`;
  }
  return `в период с ${formatDate(from)} по ${formatDate(to)}`;
}

export function unitNominative(dpo) {
  const fromFullName = String(dpo.fullName ?? '')
    .split(/\s[-–—]\s/)[0]
    .trim();
  if (fromFullName && /дирекц/i.test(fromFullName)) return fromFullName;
  return String(dpo.name ?? 'ДПО').replace(/\s+ДПО$/i, ' дирекция пассажирских обустройств');
}

function adjectiveGenitive(word) {
  if (/ая$/i.test(word)) return word.replace(/ая$/i, 'ой');
  if (/яя$/i.test(word)) return word.replace(/яя$/i, 'ей');
  return word;
}

export function unitGenitive(dpo) {
  const words = unitNominative(dpo).split(/\s+/);
  if (words.length > 0) words[0] = adjectiveGenitive(words[0]);
  if (words[1]?.toLowerCase() === 'дирекция') words[1] = 'дирекции';
  return words.join(' ');
}

function toGenitiveWord(word, isSurname = false) {
  if (!word) return word;
  if (/ович$|евич$|ич$/i.test(word)) return `${word}а`;
  if (/овна$|евна$|ична$/i.test(word)) return word.replace(/а$/i, 'ы');
  if (/ова$|ева$|ина$|ына$/i.test(word)) return word.replace(/а$/i, 'ой');
  if (/ая$/i.test(word)) return word.replace(/ая$/i, 'ой');
  if (/яя$/i.test(word)) return word.replace(/яя$/i, 'ей');
  if (/ий$/i.test(word)) return word.replace(/ий$/i, 'ия');
  if (/й$/i.test(word)) return word.replace(/й$/i, 'я');
  if (/я$/i.test(word)) return word.replace(/я$/i, 'и');
  if (/а$/i.test(word)) {
    const stem = word.slice(0, -1);
    return `${stem}${/[гкхжчшщ]$/i.test(stem) ? 'и' : 'ы'}`;
  }
  if (isSurname || /[бвгджзклмнпрстфхцчшщ]$/i.test(word)) return `${word}а`;
  return word;
}

export function fullNameGenitive(fullName) {
  const words = String(fullName ?? '')
    .trim()
    .split(/\s+/);
  return words.map((word, index) => toGenitiveWord(word, index === 0)).join(' ');
}

export function initialsFirst(fullName) {
  const [surname = '', first = '', patronymic = ''] = String(fullName ?? '')
    .trim()
    .split(/\s+/);
  return [first, patronymic]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join('')
    .concat(surname ? ` ${surname}` : '');
}

export function surnameInitials(fullName) {
  const [surname = '', first = '', patronymic = ''] = String(fullName ?? '')
    .trim()
    .split(/\s+/);
  const initials = [first, patronymic]
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join('');
  return [surname, initials].filter(Boolean).join(' ');
}

export function contractLine(dpo) {
  const agreement = [
    dpo.additionalAgreementNumber,
    dpo.additionalAgreementDate ? `от ${formatDate(dpo.additionalAgreementDate)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const contract = [
    dpo.contractNumber,
    dpo.contractDate ? `от ${formatDate(dpo.contractDate)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  if (agreement && contract) {
    return `по дополнительному соглашению ${agreement} к договору № ${contract}`;
  }
  return agreement ? `по дополнительному соглашению ${agreement}` : `по договору № ${contract}`;
}

export function dpoWithAddress(dpo) {
  const fullName = dpo.fullName || unitNominative(dpo);
  if (!dpo.address || fullName.includes(dpo.address)) return fullName;
  return `${fullName}, ${dpo.address}`;
}

export function partyWithAddress(party) {
  if (!party.address || party.fullName.includes(party.address)) return party.fullName;
  return `${party.fullName}, ${party.address}`;
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const ONES_MALE = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_FEMALE = ['', 'одна', 'две', ...ONES_MALE.slice(3)];
const TEENS = [
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
];
const TENS = [
  '',
  '',
  'двадцать',
  'тридцать',
  'сорок',
  'пятьдесят',
  'шестьдесят',
  'семьдесят',
  'восемьдесят',
  'девяносто',
];
const HUNDREDS = [
  '',
  'сто',
  'двести',
  'триста',
  'четыреста',
  'пятьсот',
  'шестьсот',
  'семьсот',
  'восемьсот',
  'девятьсот',
];

function pluralForm(value, forms) {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 19) return forms[2];
  const last = value % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function triadWords(value, female = false) {
  const parts = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    if (tens) parts.push(TENS[tens]);
    if (ones) parts.push((female ? ONES_FEMALE : ONES_MALE)[ones]);
  }
  return parts;
}

function numberWords(value) {
  const integer = Math.floor(Math.abs(value));
  if (integer === 0) return 'ноль';
  const parts = [];
  const millions = Math.floor(integer / 1_000_000);
  const thousands = Math.floor((integer % 1_000_000) / 1_000);
  const units = integer % 1_000;
  if (millions) {
    parts.push(...triadWords(millions), pluralForm(millions, ['миллион', 'миллиона', 'миллионов']));
  }
  if (thousands) {
    parts.push(
      ...triadWords(thousands, true),
      pluralForm(thousands, ['тысяча', 'тысячи', 'тысяч']),
    );
  }
  if (units) parts.push(...triadWords(units));
  return parts.join(' ');
}

export function amountInWords(value) {
  const rounded = Math.round(Number(value || 0) * 100);
  const rubles = Math.floor(rounded / 100);
  const kopecks = rounded % 100;
  const words = numberWords(rubles);
  return `${formatMoney(rounded / 100)} (${words[0].toUpperCase()}${words.slice(
    1,
  )}) ${pluralForm(rubles, ['рубль', 'рубля', 'рублей'])} ${pad2(kopecks)} ${pluralForm(kopecks, [
    'копейка',
    'копейки',
    'копеек',
  ])}`;
}

// Общая преамбула для Приложений 1.5 и 1.7 — оба ссылаются на один договор и
// одни и те же стороны, различается только глагол действия ("составили и
// подписали настоящий акт по обеспечению..." / "...акт приема-передачи...").
export function commonNarrative(data, verb) {
  const director = data.dpo.directorFullName || '';
  const contractDate = data.dpo.contractDate ? formatDate(data.dpo.contractDate) : '';
  const executor = data.parties.executor;
  const customer = data.parties.customer;
  return (
    `${customer.fullName}, именуемое в дальнейшем Заказчик, ` +
    `в лице начальника ${unitGenitive(data.dpo)} ${fullNameGenitive(director)}, ` +
    `действующего на основании ${data.dpo.directorBasis || 'доверенности'}, с одной стороны, ` +
    `и ${executor.fullName}, именуемое в дальнейшем «Исполнитель», в лице ${executor.directorPosition} ` +
    `${fullNameGenitive(executor.directorFullName)}, действующего на основании ${executor.directorBasis}, ` +
    `${verb} к договору от ${contractDate} № ${data.dpo.contractNumber || ''}, заключенному между Сторонами, ` +
    'о нижеследующем:'
  );
}
