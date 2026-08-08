import { apiClient } from '../../core/api/client';
import type { DashboardResponse } from './types';

export const dashboardApi = {
  get: () => apiClient.get<DashboardResponse>('/dashboard'),
};
