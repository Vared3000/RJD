import { models } from '../../../database/models/index.js';
import { createReferenceRepository } from '../reference-crud.factory.js';
import { literal } from 'sequelize';

const valueColumn = '"Size"."value"';
const numericValuePattern = `${valueColumn} ~ '^[[:space:]]*[0-9]+([.,][0-9]+)?[[:space:]]*$'`;

function buildSizeOrder({ sort, order }) {
  if (sort !== 'value')
    return [
      [sort, order],
      ['id', 'ASC'],
    ];

  return [
    [literal(`CASE WHEN ${numericValuePattern} THEN 0 ELSE 1 END`), 'ASC'],
    [
      literal(
        `CASE WHEN ${numericValuePattern} THEN REPLACE(BTRIM(${valueColumn}), ',', '.')::numeric END`,
      ),
      order,
    ],
    [literal(`LOWER(TRANSLATE(${valueColumn}, 'Ёё', 'Ее'))`), order],
    ['id', 'ASC'],
  ];
}

export const sizeRepository = createReferenceRepository(models.Size, {
  searchFields: ['value'],
  sortFields: ['value', 'type', 'sortOrder', 'createdAt'],
  defaultSort: 'value',
  orderBuilder: buildSizeOrder,
});
