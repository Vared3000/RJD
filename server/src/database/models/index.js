import { sequelize } from '../sequelize.js';
import { defineRole } from './role.model.js';
import { definePermission } from './permission.model.js';
import { defineRolePermission } from './role-permission.model.js';
import { defineUser } from './user.model.js';
import { defineRefreshToken } from './refresh-token.model.js';
import { defineUserAdminEvent } from './user-admin-event.model.js';
import { defineOrganization } from './organization.model.js';
import { defineSubdivision } from './subdivision.model.js';
import { definePosition } from './position.model.js';
import { defineWarehouse } from './warehouse.model.js';
import { defineSupplier } from './supplier.model.js';
import { defineSize } from './size.model.js';
import { defineNomenclatureModel } from './nomenclature-model.model.js';
import { defineBatch } from './batch.model.js';
import { defineInstance } from './instance.model.js';
import { defineInstanceEvent } from './instance-event.model.js';
import { defineReceivingDocument } from './receiving-document.model.js';
import { defineReceivingLine } from './receiving-line.model.js';
import { defineStockMovement } from './stock-movement.model.js';
import { defineEmployee } from './employee.model.js';
import { definePositionKitItem } from './position-kit-item.model.js';
import { defineIssuanceDocument } from './issuance-document.model.js';
import { defineIssuanceLine } from './issuance-line.model.js';
import { defineReturnDocument } from './return-document.model.js';
import { defineReturnLine } from './return-line.model.js';
import { defineLaundryDocument } from './laundry-document.model.js';
import { defineLaundryLine } from './laundry-line.model.js';
import { defineRepairDocument } from './repair-document.model.js';
import { defineRepairLine } from './repair-line.model.js';
import { defineTransferDocument } from './transfer-document.model.js';
import { defineTransferLine } from './transfer-line.model.js';
import { defineWriteoffDocument } from './writeoff-document.model.js';
import { defineWriteoffLine } from './writeoff-line.model.js';
import { defineInventoryDocument } from './inventory-document.model.js';
import { defineInventoryLine } from './inventory-line.model.js';
import { defineStockAdjustment } from './stock-adjustment.model.js';
import { defineStockAdjustmentLine } from './stock-adjustment-line.model.js';
import { defineDpo } from './dpo.model.js';
import { defineDpoHistory } from './dpo-history.model.js';
import { defineSourceImportRecord } from './source-import-record.model.js';
import { defineNomenclaturePrice } from './nomenclature-price.model.js';
import { defineEmployeeMeasurement } from './employee-measurement.model.js';
import { definePrintFormParty } from './print-form-party.model.js';
import { defineEmployeeDpoAssignment } from './employee-dpo-assignment.model.js';
import { defineMonthlyRentalAct } from './monthly-rental-act.model.js';
import { defineMonthlyRentalActVersion } from './monthly-rental-act-version.model.js';
import { definePrintFormTemplate } from './print-form-template.model.js';
import { defineDocumentRevision } from './document-revision.model.js';

const Role = defineRole(sequelize);
const Permission = definePermission(sequelize);
const RolePermission = defineRolePermission(sequelize);
const User = defineUser(sequelize);
const RefreshToken = defineRefreshToken(sequelize);
const UserAdminEvent = defineUserAdminEvent(sequelize);
const Organization = defineOrganization(sequelize);
const Subdivision = defineSubdivision(sequelize);
const Position = definePosition(sequelize);
const Warehouse = defineWarehouse(sequelize);
const Supplier = defineSupplier(sequelize);
const Size = defineSize(sequelize);
const NomenclatureModel = defineNomenclatureModel(sequelize);
const Batch = defineBatch(sequelize);
const Instance = defineInstance(sequelize);
const InstanceEvent = defineInstanceEvent(sequelize);
const ReceivingDocument = defineReceivingDocument(sequelize);
const ReceivingLine = defineReceivingLine(sequelize);
const StockMovement = defineStockMovement(sequelize);
const Employee = defineEmployee(sequelize);
const PositionKitItem = definePositionKitItem(sequelize);
const IssuanceDocument = defineIssuanceDocument(sequelize);
const IssuanceLine = defineIssuanceLine(sequelize);
const ReturnDocument = defineReturnDocument(sequelize);
const ReturnLine = defineReturnLine(sequelize);
const LaundryDocument = defineLaundryDocument(sequelize);
const LaundryLine = defineLaundryLine(sequelize);
const RepairDocument = defineRepairDocument(sequelize);
const RepairLine = defineRepairLine(sequelize);
const TransferDocument = defineTransferDocument(sequelize);
const TransferLine = defineTransferLine(sequelize);
const WriteoffDocument = defineWriteoffDocument(sequelize);
const WriteoffLine = defineWriteoffLine(sequelize);
const InventoryDocument = defineInventoryDocument(sequelize);
const InventoryLine = defineInventoryLine(sequelize);
const StockAdjustment = defineStockAdjustment(sequelize);
const StockAdjustmentLine = defineStockAdjustmentLine(sequelize);
const Dpo = defineDpo(sequelize);
const DpoHistory = defineDpoHistory(sequelize);
const SourceImportRecord = defineSourceImportRecord(sequelize);
const NomenclaturePrice = defineNomenclaturePrice(sequelize);
const EmployeeMeasurement = defineEmployeeMeasurement(sequelize);
const PrintFormParty = definePrintFormParty(sequelize);
const EmployeeDpoAssignment = defineEmployeeDpoAssignment(sequelize);
const MonthlyRentalAct = defineMonthlyRentalAct(sequelize);
const MonthlyRentalActVersion = defineMonthlyRentalActVersion(sequelize);
const PrintFormTemplate = definePrintFormTemplate(sequelize);
const DocumentRevision = defineDocumentRevision(sequelize);

// Role <-> Permission (многие ко многим)
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: 'roleId',
  otherKey: 'permissionId',
  as: 'permissions',
});
Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: 'permissionId',
  otherKey: 'roleId',
  as: 'roles',
});

// Role -> User (один ко многим)
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

// User -> RefreshToken (один ко многим)
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Журнал административных действий над пользователями (задача 6)
User.hasMany(UserAdminEvent, { foreignKey: 'userId', as: 'adminEvents' });
UserAdminEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });
UserAdminEvent.belongsTo(User, { foreignKey: 'performedByUserId', as: 'performedBy' });
UserAdminEvent.belongsTo(Role, { foreignKey: 'fromRoleId', as: 'fromRole' });
UserAdminEvent.belongsTo(Role, { foreignKey: 'toRoleId', as: 'toRole' });

// Organization -> Subdivision / Warehouse (один ко многим)
Organization.hasMany(Subdivision, { foreignKey: 'organizationId', as: 'subdivisions' });
Subdivision.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Warehouse, { foreignKey: 'organizationId', as: 'warehouses' });
Warehouse.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

// Supplier -> Batch (один ко многим)
Supplier.hasMany(Batch, { foreignKey: 'supplierId', as: 'batches' });
Batch.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });

// Номенклатура: Model / Size / Batch / Warehouse -> Instance (один ко многим)
NomenclatureModel.hasMany(Instance, { foreignKey: 'modelId', as: 'instances' });
Instance.belongsTo(NomenclatureModel, { foreignKey: 'modelId', as: 'model' });

Size.hasMany(Instance, { foreignKey: 'sizeId', as: 'instances' });
Instance.belongsTo(Size, { foreignKey: 'sizeId', as: 'size' });
Size.hasMany(Instance, { foreignKey: 'heightSizeId', as: 'heightInstances' });
Instance.belongsTo(Size, { foreignKey: 'heightSizeId', as: 'heightSize' });

Batch.hasMany(Instance, { foreignKey: 'batchId', as: 'instances' });
Instance.belongsTo(Batch, { foreignKey: 'batchId', as: 'batch' });

Warehouse.hasMany(Instance, { foreignKey: 'warehouseId', as: 'instances' });
Instance.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });

Instance.hasMany(InstanceEvent, { foreignKey: 'instanceId', as: 'events' });
InstanceEvent.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });
InstanceEvent.belongsTo(Warehouse, { foreignKey: 'fromWarehouseId', as: 'fromWarehouse' });
InstanceEvent.belongsTo(Warehouse, { foreignKey: 'toWarehouseId', as: 'toWarehouse' });
InstanceEvent.belongsTo(Employee, { foreignKey: 'fromEmployeeId', as: 'fromEmployee' });
InstanceEvent.belongsTo(Employee, { foreignKey: 'toEmployeeId', as: 'toEmployee' });
InstanceEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Документ "Поступление": шапка -> строки, ссылки на справочники и партию
ReceivingDocument.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
ReceivingDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
ReceivingDocument.belongsTo(Batch, { foreignKey: 'batchId', as: 'batch' });
ReceivingDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
ReceivingDocument.belongsTo(User, { foreignKey: 'postedByUserId', as: 'postedByUser' });
ReceivingDocument.belongsTo(User, { foreignKey: 'lastRevisedByUserId', as: 'lastRevisedByUser' });

ReceivingDocument.hasMany(ReceivingLine, { foreignKey: 'documentId', as: 'lines' });
ReceivingLine.belongsTo(ReceivingDocument, { foreignKey: 'documentId', as: 'document' });
ReceivingLine.belongsTo(NomenclatureModel, { foreignKey: 'modelId', as: 'model' });
ReceivingLine.belongsTo(Size, { foreignKey: 'sizeId', as: 'size' });
ReceivingLine.belongsTo(Size, { foreignKey: 'heightSizeId', as: 'heightSize' });

// Движения склада: экземпляр + откуда/куда
StockMovement.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });
StockMovement.belongsTo(Warehouse, { foreignKey: 'fromWarehouseId', as: 'fromWarehouse' });
StockMovement.belongsTo(Warehouse, { foreignKey: 'toWarehouseId', as: 'toWarehouse' });

// Работник: организация/подразделение/должность + индивидуальные размеры.
Organization.hasMany(Employee, { foreignKey: 'organizationId', as: 'employees' });
Employee.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Subdivision.hasMany(Employee, { foreignKey: 'subdivisionId', as: 'employees' });
Employee.belongsTo(Subdivision, { foreignKey: 'subdivisionId', as: 'subdivision' });

Position.hasMany(Employee, { foreignKey: 'positionId', as: 'employees' });
Employee.belongsTo(Position, { foreignKey: 'positionId', as: 'position' });

Employee.belongsTo(Size, { foreignKey: 'clothingSizeId', as: 'clothingSize' });
Employee.belongsTo(Size, { foreignKey: 'heightSizeId', as: 'heightSize' });
Employee.belongsTo(Size, { foreignKey: 'shoeSizeId', as: 'shoeSize' });
Employee.belongsTo(Size, { foreignKey: 'headwearSizeId', as: 'headwearSize' });
Employee.belongsTo(Size, { foreignKey: 'beltSizeId', as: 'beltSize' });
Employee.belongsTo(Size, { foreignKey: 'glovesSizeId', as: 'glovesSize' });

// Экземпляр может быть выдан работнику (Этап 8)
Employee.hasMany(Instance, { foreignKey: 'employeeId', as: 'instances' });
Instance.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });

// Комплект по должности (раздел 9 ТЗ): позиция -> список моделей с количеством
Position.hasMany(PositionKitItem, { foreignKey: 'positionId', as: 'kitItems' });
PositionKitItem.belongsTo(Position, { foreignKey: 'positionId', as: 'position' });
PositionKitItem.belongsTo(NomenclatureModel, { foreignKey: 'modelId', as: 'model' });

// Документ "Выдача": шапка -> строки (модель+размер+количество, экземпляры
// подбираются при проведении), ссылки на работника/склад/партию нет — есть
// у экземпляра через employeeId после проведения.
IssuanceDocument.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });
IssuanceDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
IssuanceDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
IssuanceDocument.belongsTo(User, { foreignKey: 'postedByUserId', as: 'postedByUser' });
IssuanceDocument.belongsTo(User, { foreignKey: 'lastRevisedByUserId', as: 'lastRevisedByUser' });

IssuanceDocument.hasMany(IssuanceLine, { foreignKey: 'documentId', as: 'lines' });
IssuanceLine.belongsTo(IssuanceDocument, { foreignKey: 'documentId', as: 'document' });
IssuanceLine.belongsTo(NomenclatureModel, { foreignKey: 'modelId', as: 'model' });
IssuanceLine.belongsTo(Size, { foreignKey: 'sizeId', as: 'size' });
IssuanceLine.belongsTo(Size, { foreignKey: 'heightSizeId', as: 'heightSize' });
IssuanceLine.belongsTo(NomenclaturePrice, { foreignKey: 'priceSourceId', as: 'priceSource' });

// Документ "Возврат": шапка -> строки (конкретный экземпляр + состояние при
// возврате), в отличие от "Выдачи" — по экземплярам, не по модели/размеру,
// т.к. на возврате уже известно, какой именно экземпляр возвращается.
ReturnDocument.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });
ReturnDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
ReturnDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
ReturnDocument.belongsTo(User, { foreignKey: 'postedByUserId', as: 'postedByUser' });
ReturnDocument.belongsTo(User, { foreignKey: 'lastRevisedByUserId', as: 'lastRevisedByUser' });

ReturnDocument.hasMany(ReturnLine, { foreignKey: 'documentId', as: 'lines' });
ReturnLine.belongsTo(ReturnDocument, { foreignKey: 'documentId', as: 'document' });
ReturnLine.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });

// Документы "Стирка"/"Ремонт" (Этап 9) — шапка -> строки (конкретный
// экземпляр, как у Возврата), двухфазное проведение через
// server/src/modules/service-documents/.
LaundryDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
LaundryDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
LaundryDocument.belongsTo(User, { foreignKey: 'sentByUserId', as: 'sentByUser' });
LaundryDocument.belongsTo(User, { foreignKey: 'completedByUserId', as: 'completedByUser' });

LaundryDocument.hasMany(LaundryLine, { foreignKey: 'documentId', as: 'lines' });
LaundryLine.belongsTo(LaundryDocument, { foreignKey: 'documentId', as: 'document' });
LaundryLine.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });

RepairDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
RepairDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
RepairDocument.belongsTo(User, { foreignKey: 'sentByUserId', as: 'sentByUser' });
RepairDocument.belongsTo(User, { foreignKey: 'completedByUserId', as: 'completedByUser' });

RepairDocument.hasMany(RepairLine, { foreignKey: 'documentId', as: 'lines' });
RepairLine.belongsTo(RepairDocument, { foreignKey: 'documentId', as: 'document' });
RepairLine.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });

// Документ "Перемещение" (Этап 10) — шапка -> строки (конкретный
// экземпляр), draft/posted в одну транзакцию, как Поступление/Выдача.
// Единственный документ, где у StockMovement заполнены оба склада.
TransferDocument.belongsTo(Warehouse, { foreignKey: 'fromWarehouseId', as: 'fromWarehouse' });
TransferDocument.belongsTo(Warehouse, { foreignKey: 'toWarehouseId', as: 'toWarehouse' });
TransferDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
TransferDocument.belongsTo(User, { foreignKey: 'postedByUserId', as: 'postedByUser' });

TransferDocument.hasMany(TransferLine, { foreignKey: 'documentId', as: 'lines' });
TransferLine.belongsTo(TransferDocument, { foreignKey: 'documentId', as: 'document' });
TransferLine.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });

// Документ "Списание" (Этап 10) — шапка -> строки (экземпляр + причина),
// draft/posted, переводит экземпляр в status='write_off' окончательно.
WriteoffDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
WriteoffDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
WriteoffDocument.belongsTo(User, { foreignKey: 'postedByUserId', as: 'postedByUser' });
WriteoffDocument.belongsTo(User, {
  foreignKey: 'lastRevisedByUserId',
  as: 'lastRevisedByUser',
});

WriteoffDocument.hasMany(WriteoffLine, { foreignKey: 'documentId', as: 'lines' });
WriteoffLine.belongsTo(WriteoffDocument, { foreignKey: 'documentId', as: 'document' });
WriteoffLine.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });

// Документ "Инвентаризация" (Этап 10) — сверка, не складская операция: см.
// комментарий в миграции 0037. draft/completed, без движений склада.
InventoryDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
InventoryDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
InventoryDocument.belongsTo(User, { foreignKey: 'completedByUserId', as: 'completedByUser' });

InventoryDocument.hasMany(InventoryLine, { foreignKey: 'documentId', as: 'lines' });
InventoryLine.belongsTo(InventoryDocument, { foreignKey: 'documentId', as: 'document' });
InventoryLine.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });

// Документ "Корректировка" (задача 7 docs/IMPROVEMENT_PLAN.md) — 4 типа строк
// (surplus/shortage/relocate/condition), draft/posted. Может опираться на
// завершённую Инвентаризацию (ссылка на построчном уровне — inventoryDocumentId
// у конкретной строки, не у шапки, т.к. документ может сочетать строки из
// инвентаризации и добавленные вручную).
StockAdjustment.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
StockAdjustment.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
StockAdjustment.belongsTo(User, { foreignKey: 'postedByUserId', as: 'postedByUser' });

StockAdjustment.hasMany(StockAdjustmentLine, { foreignKey: 'documentId', as: 'lines' });
StockAdjustmentLine.belongsTo(StockAdjustment, { foreignKey: 'documentId', as: 'document' });
StockAdjustmentLine.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });
StockAdjustmentLine.belongsTo(NomenclatureModel, { foreignKey: 'modelId', as: 'model' });
StockAdjustmentLine.belongsTo(Size, { foreignKey: 'sizeId', as: 'size' });
StockAdjustmentLine.belongsTo(Size, { foreignKey: 'heightSizeId', as: 'heightSize' });
StockAdjustmentLine.belongsTo(Warehouse, { foreignKey: 'toWarehouseId', as: 'toWarehouse' });
StockAdjustmentLine.belongsTo(InventoryDocument, {
  foreignKey: 'inventoryDocumentId',
  as: 'inventoryDocument',
});

// ДПО заказчика (раздел 10 ТЗ) — работник может быть привязан к ДПО;
// история изменений ДПО — отдельная таблица (см. dpo-history.model.js).
Dpo.hasMany(Employee, { foreignKey: 'dpoId', as: 'employees' });
Employee.belongsTo(Dpo, { foreignKey: 'dpoId', as: 'dpo' });

Dpo.hasMany(DpoHistory, { foreignKey: 'dpoId', as: 'history' });
DpoHistory.belongsTo(Dpo, { foreignKey: 'dpoId', as: 'dpo' });
DpoHistory.belongsTo(User, { foreignKey: 'changedByUserId', as: 'changedBy' });

// Источник импорта хранит исходную строку/страницу целиком; нормализованная цена
// ссылается на неё, чтобы любое значение можно было проследить до акта.
NomenclatureModel.hasMany(NomenclaturePrice, { foreignKey: 'modelId', as: 'prices' });
NomenclaturePrice.belongsTo(NomenclatureModel, { foreignKey: 'modelId', as: 'model' });
Dpo.hasMany(NomenclaturePrice, { foreignKey: 'dpoId', as: 'nomenclaturePrices' });
NomenclaturePrice.belongsTo(Dpo, { foreignKey: 'dpoId', as: 'dpo' });
SourceImportRecord.hasOne(NomenclaturePrice, {
  foreignKey: 'sourceRecordId',
  as: 'nomenclaturePrice',
});
NomenclaturePrice.belongsTo(SourceImportRecord, {
  foreignKey: 'sourceRecordId',
  as: 'sourceRecord',
});
Employee.hasMany(EmployeeMeasurement, { foreignKey: 'employeeId', as: 'measurements' });
EmployeeMeasurement.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });
SourceImportRecord.hasMany(EmployeeMeasurement, {
  foreignKey: 'sourceRecordId',
  as: 'employeeMeasurements',
});

PrintFormParty.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdByUser' });
Employee.hasMany(EmployeeDpoAssignment, { foreignKey: 'employeeId', as: 'dpoAssignments' });
EmployeeDpoAssignment.belongsTo(Employee, { foreignKey: 'employeeId', as: 'employee' });
Dpo.hasMany(EmployeeDpoAssignment, { foreignKey: 'dpoId', as: 'employeeAssignments' });
EmployeeDpoAssignment.belongsTo(Dpo, { foreignKey: 'dpoId', as: 'dpo' });
EmployeeDpoAssignment.belongsTo(User, { foreignKey: 'changedByUserId', as: 'changedByUser' });
Dpo.hasMany(MonthlyRentalAct, { foreignKey: 'dpoId', as: 'monthlyRentalActs' });
MonthlyRentalAct.belongsTo(Dpo, { foreignKey: 'dpoId', as: 'dpo' });
MonthlyRentalAct.belongsTo(User, { foreignKey: 'generatedByUserId', as: 'generatedByUser' });
MonthlyRentalAct.hasMany(MonthlyRentalActVersion, { foreignKey: 'actId', as: 'versions' });
MonthlyRentalActVersion.belongsTo(MonthlyRentalAct, { foreignKey: 'actId', as: 'act' });
MonthlyRentalActVersion.belongsTo(User, {
  foreignKey: 'generatedByUserId',
  as: 'generatedByUser',
});
MonthlyRentalActVersion.belongsTo(PrintFormTemplate, {
  foreignKey: 'templateId',
  as: 'template',
});

// document_revisions — полиморфный журнал редакций проведённых документов
// (задача 22), по образцу document_id у stock_movements/instance_events —
// без FK на сам документ, только на пользователя.
DocumentRevision.belongsTo(User, { foreignKey: 'revisedByUserId', as: 'revisedByUser' });
EmployeeMeasurement.belongsTo(SourceImportRecord, {
  foreignKey: 'sourceRecordId',
  as: 'sourceRecord',
});

PrintFormTemplate.belongsTo(User, { foreignKey: 'uploadedByUserId', as: 'uploadedByUser' });

export const models = {
  Role,
  Permission,
  RolePermission,
  User,
  RefreshToken,
  UserAdminEvent,
  Organization,
  Subdivision,
  Position,
  Warehouse,
  Supplier,
  Size,
  NomenclatureModel,
  Batch,
  Instance,
  InstanceEvent,
  ReceivingDocument,
  ReceivingLine,
  StockMovement,
  Employee,
  PositionKitItem,
  IssuanceDocument,
  IssuanceLine,
  ReturnDocument,
  ReturnLine,
  LaundryDocument,
  LaundryLine,
  RepairDocument,
  RepairLine,
  TransferDocument,
  TransferLine,
  WriteoffDocument,
  WriteoffLine,
  InventoryDocument,
  InventoryLine,
  StockAdjustment,
  StockAdjustmentLine,
  Dpo,
  DpoHistory,
  SourceImportRecord,
  NomenclaturePrice,
  EmployeeMeasurement,
  PrintFormParty,
  EmployeeDpoAssignment,
  MonthlyRentalAct,
  MonthlyRentalActVersion,
  PrintFormTemplate,
  DocumentRevision,
};

export { sequelize };
