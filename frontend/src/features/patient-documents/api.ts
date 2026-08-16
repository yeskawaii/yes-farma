import { apiClient } from '../../core/api/client';
import type {
  PatientDocument,
  UploadDocumentInput,
  UploadUrlResponse,
  DownloadUrlResponse,
} from './types';

export const patientDocumentsApi = {
  listDocuments: async (patientId: string): Promise<PatientDocument[]> => {
    return apiClient.get<PatientDocument[]>(`/patient-documents?patientId=${patientId}`);
  },

  createUploadUrl: async (input: UploadDocumentInput): Promise<UploadUrlResponse> => {
    return apiClient.post<UploadUrlResponse>('/patient-documents/uploads', input);
  },

  completeUpload: async (id: string): Promise<PatientDocument> => {
    return apiClient.post<PatientDocument>(`/patient-documents/${id}/complete`);
  },

  getDownloadUrl: async (id: string): Promise<DownloadUrlResponse> => {
    return apiClient.get<DownloadUrlResponse>(`/patient-documents/${id}/download`);
  },

  deleteDocument: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/patient-documents/${id}`);
  },

  uploadToR2: async (uploadUrl: string, file: File): Promise<void> => {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error(`Error uploading file to R2: ${response.statusText}`);
    }
  },
};
