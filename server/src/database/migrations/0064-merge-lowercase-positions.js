const POSITION_NAME_CORRECTIONS = new Map([
  ['дежурный по по выдаче справок', 'Дежурный по выдаче справок'],
]);

function normalizePositionName(value) {
  const name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return name;
  const corrected = POSITION_NAME_CORRECTIONS.get(name.toLocaleLowerCase('ru-RU')) ?? name;
  return corrected[0].toLocaleUpperCase('ru-RU') + corrected.slice(1);
}

function startsWithLowercase(value) {
  return /^\p{Ll}/u.test(String(value ?? ''));
}

export async function up({ context: sequelize }) {
  await sequelize.transaction(async (transaction) => {
    const [positions] = await sequelize.query(
      'SELECT id, name, archived_at FROM positions ORDER BY created_at ASC',
      { transaction },
    );
    const positionByName = new Map(positions.map((position) => [position.name, position]));

    for (const source of positions.filter((position) => startsWithLowercase(position.name))) {
      const targetName = normalizePositionName(source.name);
      const target = positionByName.get(targetName);

      if (!target || target.id === source.id) {
        await sequelize.query(
          `UPDATE positions
           SET name = :targetName, archived_at = NULL, updated_at = NOW()
           WHERE id = :sourceId`,
          { replacements: { sourceId: source.id, targetName }, transaction },
        );
        positionByName.set(targetName, { ...source, name: targetName, archived_at: null });
        continue;
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
              gender: sourceItem.gender,
            },
            transaction,
          },
        );
        const targetItem = targetItems[0];

        if (!targetItem) {
          await sequelize.query(
            `UPDATE position_kit_items
             SET position_id = :targetId, updated_at = NOW()
             WHERE id = :sourceItemId`,
            {
              replacements: { sourceItemId: sourceItem.id, targetId: target.id },
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
  // Объединение справочных записей не раскладывается обратно: исходные файлы
  // импорта сохранены, а откат предыдущих миграций всё равно удаляет таблицы.
}
