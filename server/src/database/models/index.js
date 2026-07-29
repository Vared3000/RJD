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
};

export { sequelize };
