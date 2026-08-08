import { apiClient } from '../../core/api/client';
import type { ClinicalEncounterRecordsResponse } from './types';

export const recordsApi = {
  list: async (params: {
    status?: 'DRAFT' | 'FINALIZED';
    q?: string;
    mine?: 0 | 1;
    page?: number;
    pageSize?: number;
  }): Promise<ClinicalEncounterRecordsResponse> => {
    const searchParams = new URLSearchParams();
    if (params.status) searchParams.append('status', params.status);
    if (params.q) searchParams.append('q', params.q);
    if (params.mine !== undefined) searchParams.append('mine', params.mine.toString());
    if (params.page !== undefined) searchParams.append('page', params.page.toString());
    if (params.pageSize !== undefined) searchParams.append('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    const url = qs ? `/clinical-encounters/records?${qs}` : '/clinical-encounters/records';
    return apiClient.get(url);
  }
};
