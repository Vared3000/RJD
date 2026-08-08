import { Op } from 'sequelize';
import { models } from '../../database/models/index.js';

const { User, Role, Permission, UserAdminEvent } = models;

// passwordHash никогда не должен попасть в ответ API (задача 6, правило
// "не возвращать passwordHash") — исключаем на уровне запроса, а не только
// сериализацией в контроллере, чтобы не полагаться на дисциплину каждого места.
const SAFE_ATTRIBUTES = { exclude: ['passwordHash'] };

const roleInclude = { model: Role, as: 'role' };

export const adminRepository = {
  list({ search, roleId, isActive } = {}) {
    const where = {};
    if (search) {
      where[Op.or] = [
        { login: { [Op.iLike]: `%${search}%` } },
        { fullName: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (roleId) where.roleId = roleId;
    if (isActive !== undefined) where.isActive = isActive;

    return User.findAll({
      where,
      attributes: SAFE_ATTRIBUTES,
      include: [roleInclude],
      order: [['fullName', 'ASC']],
    });
  },

  findById(id, { transaction } = {}) {
    return User.findByPk(id, {
      attributes: SAFE_ATTRIBUTES,
      include: [roleInclude],
      transaction,
    });
  },

  findByLogin(login, { transaction } = {}) {
    return User.findOne({ where: { login }, transaction });
  },

  // Без include: блокировка через FOR UPDATE поверх JOIN на роль/права
  // недопустима в Postgres так же, как для документов (см.
  // docs/architecture.md, "Блокировка на проведении"). Роль с правами
  // читается отдельным запросом ниже, уже внутри той же транзакции.
  findByIdForUpdate(id, { transaction }) {
    return User.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  },

  findRoleWithPermissions(roleId, { transaction } = {}) {
    return Role.findByPk(roleId, {
      include: [{ model: Permission, as: 'permissions', attributes: ['code'] }],
      transaction,
    });
  },

  // Роли, дающие право администрирования — используется для правила "не
  // отключить последнего активного администратора".
  async findAdminRoleIds({ transaction } = {}) {
    const roles = await Role.findAll({
      include: [
        { model: Permission, as: 'permissions', where: { code: 'admin.manage' }, attributes: [] },
      ],
      attributes: ['id'],
      transaction,
    });
    return roles.map((role) => role.id);
  },

  countActiveUsersInRoles(roleIds, { excludeUserId, transaction } = {}) {
    const where = { roleId: roleIds, isActive: true, archivedAt: null };
    if (excludeUserId) where.id = { [Op.ne]: excludeUserId };
    return User.count({ where, transaction });
  },

  create(data, { transaction } = {}) {
    return User.create(data, { transaction });
  },

  async updateById(id, data, { transaction } = {}) {
    const [count] = await User.update(data, { where: { id }, transaction });
    return count > 0;
  },

  listRoles() {
    return Role.findAll({ order: [['name', 'ASC']] });
  },

  listPermissions() {
    return Permission.findAll({ order: [['code', 'ASC']] });
  },

  createEvent(data, { transaction } = {}) {
    return UserAdminEvent.create(data, { transaction });
  },

  listEvents(userId) {
    return UserAdminEvent.findAll({
      where: { userId },
      include: [
        { model: models.User, as: 'performedBy', attributes: ['id', 'fullName'] },
        { model: Role, as: 'fromRole', attributes: ['id', 'name'] },
        { model: Role, as: 'toRole', attributes: ['id', 'name'] },
      ],
      order: [
        ['occurredAt', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
  },
};
