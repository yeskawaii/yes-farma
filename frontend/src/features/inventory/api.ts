import { apiClient } from '../../core/api/client';
import type { Detail, InventoryData, Product, Supplier } from './types';
export const inventoryApi = {
  list: () => apiClient.get<InventoryData>('/inventory'),
  detail: (id: string) => apiClient.get<Detail>(`/inventory/products/${id}`),
  product: (data: unknown, id?: string) => id ? apiClient.patch<Product>(`/inventory/products/${id}`, data) : apiClient.post<Product>('/inventory/products', data),
  supplier: (data: unknown, id?: string) => id ? apiClient.patch<Supplier>(`/inventory/suppliers/${id}`, data) : apiClient.post<Supplier>('/inventory/suppliers', data),
  move: (id: string, data: unknown) => apiClient.post<{ message: string; product: Product }>(`/inventory/products/${id}/movements`, data),
};
