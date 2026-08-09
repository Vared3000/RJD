import { randomUUID } from 'node:crypto';

const VARIANT_SUFFIX = /\s+(мужской|женский)\s+комплект$/iu;

function positionVariant(value) {
  const name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = name.match(VARIANT_SUFFIX);
  if (!match) return null;
  return {
    baseName: name.slice(0, match.index).trim(),
    gender: match[1].toLocaleLowerCase('ru-RU') === 'мужской' ? 'male' : 'female',
  };
}

export async function up({ context: sequelize }) {
  await sequelize.transaction(async (transaction) => {
    const [positions] = await sequelize.query(
      'SELECT id, name, archived_at FROM positions ORDER BY created_at ASC',
      { transaction },
    );
    const positionByName = new Map(positions.map((position) => [position.name, position]));
    const variantByPositionId = new Map();
    for (const position of positions) {
      const variant = positionVariant(position.name);
      if (variant) variantByPositionId.set(position.id, variant);
    }
    let allVariantItems = [];
    if (variantByPositionId.size > 0) {
      [allVariantItems] = await sequelize.query(
        `SELECT position_id, model_id
         FROM position_kit_items
         WHERE position_id IN (:positionIds)`,
        {
          replacements: { positionIds: [...variantByPositionId.keys()] },
          transaction,
        },
      );
    }
    const gendersByBaseModel = new Map();
    for (const item of allVariantItems) {
      const variant = variantByPositionId.get(item.position_id);
      const key = `${variant.baseName}\u0000${item.model_id}`;
      const genders = gendersByBaseModel.get(key) ?? new Set();
      genders.add(variant.gender);
      gendersByBaseModel.set(key, genders);
    }

    for (const source of positions) {
      const variant = positionVariant(source.name);
      if (!variant) continue;

      let target = positionByName.get(variant.baseName);
      if (!target) {
        const [created] = await sequelize.query(
          `INSERT INTO positions (id, name, created_at, updated_at)
           VALUES (:id, :name, NOW(), NOW())
           RETURNING id, name, archived_at`,
          { replacements: { id: randomUUID(), name: variant.baseName }, transaction },
        );
        target = created[0];
        positionByName.set(target.name, target);
      }

      await sequelize.query(
        `UPDATE employees
         SET position_id = :targetId, updated_at = NOW()
         WHERE position_id = :sourceId`,
        { replacements: { sourceId: source.id, targetId: target.id }, transaction },
      );

      const [sourceItems] = await sequelize.query(
        `SELECT id, model_id, season, gender, quantity, service_life_years, archived_at
         FROM position_kit_items
         WHERE position_id = :sourceId
         ORDER BY created_at ASC`,
        { replacements: { sourceId: source.id }, transaction },
      );

      for (const sourceItem of sourceItems) {
        const sourceGenders = gendersByBaseModel.get(
          `${variant.baseName}\u0000${sourceItem.model_id}`,
        );
        const gender = sourceItem.gender ?? (sourceGenders?.size > 1 ? null : variant.gender);
        const [targetItems] = await sequelize.query(
          `SELECT id, quantity, service_life_years, archived_at
           FROM position_kit_items
           WHERE position_id = :targetId
             AND model_id = :modelId
             AND season IS NOT DISTINCT FROM :season
             AND gender IS NOT DISTINCT FROM :gender
           LIMIT 1`,
          {
            replacements: {
              targetId: target.id,
              modelId: sourceItem.model_id,
              season: sourceItem.season,
              gender,
            },
            transaction,
          },
        );
        const targetItem = targetItems[0];

        if (!targetItem) {
          await sequelize.query(
            `UPDATE position_kit_items
             SET position_id = :targetId, gender = :gender, updated_at = NOW()
             WHERE id = :sourceItemId`,
            {
              replacements: { sourceItemId: sourceItem.id, targetId: target.id, gender },
              transaction,
            },
          );
          continue;
        }

        const quantity = Math.max(Number(targetItem.quantity), Number(sourceItem.quantity));
        const serviceLifeYears = Math.max(
          Number(targetItem.service_life_years ?? 0),
          Number(sourceItem.service_life_years ?? 0),
        );
        const archivedAt = targetItem.archived_at && sourceItem.archived_at ? new Date() : null;
        await sequelize.query(
          `UPDATE position_kit_items
           SET quantity = :quantity,
               service_life_years = :serviceLifeYears,
               archived_at = :archivedAt,
               updated_at = NOW()
           WHERE id = :targetItemId`,
          {
            replacements: {
              targetItemId: targetItem.id,
              quantity,
              serviceLifeYears: serviceLifeYears || null,
              archivedAt,
            },
            transaction,
          },
        );
        await sequelize.query(
          `UPDATE position_kit_items
           SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
           WHERE id = :sourceItemId`,
          { replacements: { sourceItemId: sourceItem.id }, transaction },
        );
      }

      await sequelize.query(
        `UPDATE positions
         SET archived_at = COALESCE(archived_at, NOW()), updated_at = NOW()
         WHERE id = :sourceId`,
        { replacements: { sourceId: source.id }, transaction },
      );
      await sequelize.query(
        `UPDATE positions
         SET archived_at = NULL, updated_at = NOW()
         WHERE id = :targetId`,
        { replacements: { targetId: target.id }, transaction },
      );
    }
  });
}

export async function down() {
  // Объединение справочников не раскладывается обратно: исходные файлы импорта сохранены.
}
