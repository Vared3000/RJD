import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCatalogApi } from '../api/catalog-api-factory.js';

// Общая пара хуков для любого архивируемого справочника (см. backend
// reference-crud.factory.js). resource — сегмент REST-пути, например
// 'organizations'.
export function createCatalogHooks(resource) {
  const api = createCatalogApi(resource);

  function useList(includeArchived = false, extra = {}, options = {}) {
    const query = useQuery({
      queryKey: [resource, { includeArchived, ...extra }],
      queryFn: () => api.list({ includeArchived, ...extra }),
      ...options,
    });
    return { ...query, data: query.data?.items, meta: query.data?.meta };
  }

  function useCatalogMutations() {
    const queryClient = useQueryClient();
    const invalidate = () => queryClient.invalidateQueries({ queryKey: [resource] });

    const create = useMutation({ mutationFn: api.create, onSuccess: invalidate });
    const update = useMutation({
      mutationFn: ({ id, payload }) => api.update(id, payload),
      onSuccess: invalidate,
    });
    const archive = useMutation({ mutationFn: api.archive, onSuccess: invalidate });
    const restore = useMutation({ mutationFn: api.restore, onSuccess: invalidate });

    return { create, update, archive, restore };
  }

  return { useList, useCatalogMutations };
}
