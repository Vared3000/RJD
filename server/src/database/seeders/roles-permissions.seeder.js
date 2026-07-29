import { models } from '../models/index.js';
import { PERMISSIONS, ROLE_DEFINITIONS } from '../../config/permissions.js';
import { logger } from '../../utils/logger.js';

export async function seedRolesAndPermissions() {
  const { Role, Permission } = models;

  const permissionByCode = new Map();
  for (const def of PERMISSIONS) {
    const [permission] = await Permission.findOrCreate({
      where: { code: def.code },
      defaults: { description: def.description },
    });
    if (permission.description !== def.description) {
      await permission.update({ description: def.description });
    }
    permissionByCode.set(def.code, permission);
  }

  for (const roleDef of ROLE_DEFINITIONS) {
    const [role] = await Role.findOrCreate({
      where: { code: roleDef.code },
      defaults: { name: roleDef.name, isSystem: roleDef.isSystem ?? false },
    });
    const permissions = roleDef.permissions.map((code) => {
      const permission = permissionByCode.get(code);
      if (!permission) {
        throw new Error(
          `Право "${code}" для роли "${roleDef.code}" не найдено в каталоге PERMISSIONS`,
        );
      }
      return permission;
    });
    await role.setPermissions(permissions);
  }

  logger.info(`Сид ролей и прав: ${ROLE_DEFINITIONS.length} ролей, ${PERMISSIONS.length} прав`);
}
