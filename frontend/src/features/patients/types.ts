export type PatientStatus = 'ACTIVE' | 'INACTIVE';

export interface PatientListItem {
  id: string;
  firstName: string;
  lastName: string;
  secondLastName?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  status: PatientStatus;
  createdAt: string;
}

export interface PatientDetail {
  id: string;
  firstName: string;
  lastName: string;
  secondLastName?: string | null;
  birthDate?: string | null;
  sexAtBirth?: 'FEMALE' | 'MALE' | 'INTERSEX' | 'UNKNOWN' | null;
  email?: string | null;
  phone?: string | null;
  administrativeNotes?: string | null;
  status: PatientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PatientsFilters {
  q?: string;
  status?: PatientStatus;
  page: number;
  pageSize: number;
}

// Error handling for possible duplicate if the backend implements it in the future
export interface ApiError {
  code?: string;
  message: string;
}
