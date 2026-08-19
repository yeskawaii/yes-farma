import { apiClient } from '../../core/api/client';

interface MessageResponse {
  message: string;
}

export const requestPasswordReset = async (
  email: string,
): Promise<MessageResponse> =>
  apiClient.post<MessageResponse>('/auth/forgot-password', { email });

export const resetPassword = async (
  token: string,
  newPassword: string,
): Promise<MessageResponse> =>
  apiClient.post<MessageResponse>('/auth/reset-password', {
    token,
    newPassword,
  });
