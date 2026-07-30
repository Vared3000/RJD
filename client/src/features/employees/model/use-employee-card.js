import { useQuery } from '@tanstack/react-query';
import { employeeApi } from '../api/employee-api.js';

export function useEmployee(id) {
  return useQuery({
    queryKey: ['employees', id],
    queryFn: () => employeeApi.getById(id),
    enabled: Boolean(id),
  });
}

export function useEmployeeProperty(id) {
  return useQuery({
    queryKey: ['employees', id, 'property'],
    queryFn: () => employeeApi.getProperty(id),
    enabled: Boolean(id),
  });
}
