import { sequelize } from '../sequelize.js';
import { defineRole } from './role.model.js';
import { definePermission } from './permission.model.js';
import { defineRolePermission } from './role-permission.model.js';
import { defineUser } from './user.model.js';
import { defineRefreshToken } from './refresh-token.model.js';
import { defineOrganization } from './organization.model.js';
import { defineSubdivision } from './subdivision.model.js';
import { definePosition } from './position.model.js';
import { defineWarehouse } from './warehouse.model.js';
import { defineSupplier } from './supplier.model.js';
import { defineSize } from './size.model.js';
import { defineNomenclatureModel } from './nomenclature-model.model.js';
import { defineBatch } from './batch.model.js';
import { defineInstance } from './instance.model.js';
import { defineReceivingDocument } from './receiving-document.model.js';
import { defineReceivingLine } from './receiving-line.model.js';
import { defineStockMovement } from './stock-movement.model.js';

const Role = defineRole(sequelize);
const Permission = definePermission(sequelize);
const RolePermission = defineRolePermission(sequelize);
const User = defineUser(sequelize);
const RefreshToken = defineRefreshToken(sequelize);
const Organization = defineOrganization(sequelize);
const Subdivision = defineSubdivision(sequelize);
const Position = definePosition(sequelize);
const Warehouse = defineWarehouse(sequelize);
const Supplier = defineSupplier(sequelize);
const Size = defineSize(sequelize);
const NomenclatureModel = defineNomenclatureModel(sequelize);
const Batch = defineBatch(sequelize);
const Instance = defineInstance(sequelize);
const ReceivingDocument = defineReceivingDocument(sequelize);
const ReceivingLine = defineReceivingLine(sequelize);
const StockMovement = defineStockMovement(sequelize);

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

Batch.hasMany(Instance, { foreignKey: 'batchId', as: 'instances' });
Instance.belongsTo(Batch, { foreignKey: 'batchId', as: 'batch' });

Warehouse.hasMany(Instance, { foreignKey: 'warehouseId', as: 'instances' });
Instance.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });

// Документ "Поступление": шапка -> строки, ссылки на справочники и партию
ReceivingDocument.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
ReceivingDocument.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
ReceivingDocument.belongsTo(Batch, { foreignKey: 'batchId', as: 'batch' });
ReceivingDocument.belongsTo(User, { foreignKey: 'responsibleUserId', as: 'responsibleUser' });
ReceivingDocument.belongsTo(User, { foreignKey: 'postedByUserId', as: 'postedByUser' });

ReceivingDocument.hasMany(ReceivingLine, { foreignKey: 'documentId', as: 'lines' });
ReceivingLine.belongsTo(ReceivingDocument, { foreignKey: 'documentId', as: 'document' });
ReceivingLine.belongsTo(NomenclatureModel, { foreignKey: 'modelId', as: 'model' });
ReceivingLine.belongsTo(Size, { foreignKey: 'sizeId', as: 'size' });

// Движения склада: экземпляр + откуда/куда
StockMovement.belongsTo(Instance, { foreignKey: 'instanceId', as: 'instance' });
StockMovement.belongsTo(Warehouse, { foreignKey: 'fromWarehouseId', as: 'fromWarehouse' });
StockMovement.belongsTo(Warehouse, { foreignKey: 'toWarehouseId', as: 'toWarehouse' });

export const models = {
  Role,
  Permission,
  RolePermission,
  User,
  RefreshToken,
  Organization,
  Subdivision,
  Position,
  Warehouse,
  Supplier,
  Size,
  NomenclatureModel,
  Batch,
  Instance,
  ReceivingDocument,
  ReceivingLine,
  StockMovement,
};

export { sequelize };
