import { sequelize } from '../sequelize.js';
import { defineRole } from './role.model.js';
import { definePermission } from './permission.model.js';
import { defineRolePermission } from './role-permission.model.js';
import { defineUser } from './user.model.js';
import { defineRefreshToken } from './refresh-token.model.js';

const Role = defineRole(sequelize);
const Permission = definePermission(sequelize);
const RolePermission = defineRolePermission(sequelize);
const User = defineUser(sequelize);
const RefreshToken = defineRefreshToken(sequelize);

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

export const models = {
  Role,
  Permission,
  RolePermission,
  User,
  RefreshToken,
};

export { sequelize };
