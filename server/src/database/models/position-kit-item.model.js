import { DataTypes } from 'sequelize';
import { GENDERS } from './employee.model.js';

export { GENDERS as KIT_GENDERS };

// Сезон позиции комплекта (раздел 9 ТЗ): при подборе комплекта на выдаче
// пользователь выбирает Летний/Зимний, и в документ попадают только позиции
// нужного сезона. Строго 2 значения по решению пользователя — для вещей,
// нужных круглый год (ремень, перчатки и т.п.), заводится 2 строки (по одной
// на сезон), не общая категория "круглогодично". Существующие (импортированные
// из архива) позиции комплектов сезон не имеют (season = null) — считаются
// нужными в обоих сезонах, пока администратор не уточнит их через форму.
export const KIT_SEASONS = ['summer', 'winter'];

export function definePositionKitItem(sequelize) {
  return sequelize.define(
    'PositionKitItem',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      positionId: { type: DataTypes.UUID, allowNull: false, field: 'position_id' },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      season: { type: DataTypes.STRING(16), allowNull: true },
      // Пол позиции комплекта (Employee.gender, см. employee.model.js) — для
      // унисекс-вещей (бейдж, галстук, ремень и т.п.) null, попадает в подбор
      // независимо от пола работника; так же, как и при неизвестном поле
      // работника (gender === null) — фильтр по полу не применяется ни в
      // одну сторону, см. applyKit/previewKit в issuance.service.js.
      gender: { type: DataTypes.STRING(16), allowNull: true },
      serviceLifeYears: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'service_life_years',
      },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'position_kit_items' },
  );
}
