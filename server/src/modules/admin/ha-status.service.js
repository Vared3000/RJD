import { resolveHaFence } from '../../config/ha-fence.js';

export const haStatusService = {
  async read() {
    try {
      const fence = await resolveHaFence();
      if (!fence.enabled) {
        return {
          mode: 'disabled',
          status: 'disabled',
          message: 'Автоматическое переключение выключено до физической приёмки',
          nodes: [],
        };
      }
      return {
        mode: fence.mode,
        status: fence.writable ? 'primary' : 'replica',
        message: fence.writable
          ? 'Этот узел подтверждён как текущий primary'
          : `Запись принимает узел ${fence.leaderNodeId}`,
        clusterId: fence.clusterId,
        nodeId: fence.nodeId,
        leaderNodeId: fence.leaderNodeId,
        stableUrl: fence.stableUrl,
        quorumNodeIds: fence.quorumNodeIds,
        nodes: fence.members,
      };
    } catch {
      return {
        mode: process.env.WORKWEAR_HA_MODE?.trim() || 'disabled',
        status: 'error',
        message: 'HA-кворум не подтверждён; изменяющие операции заблокированы',
        nodes: [],
      };
    }
  },
};
