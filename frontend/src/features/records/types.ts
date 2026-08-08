export interface ClinicalEncounterRecordItem {
  id: string;
  occurredAt: string;
  status: "DRAFT" | "FINALIZED";
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  patient: {
    id: string;
    displayName: string;
  };
  professional: {
    membershipId: string;
    displayName: string;
  };
  appointment: {
    id: string;
    startAt: string;
    endAt: string;
    status:
      | "SCHEDULED"
      | "CONFIRMED"
      | "IN_PROGRESS"
      | "COMPLETED"
      | "CANCELLED"
      | "NO_SHOW";
  } | null;
}

export interface ClinicalEncounterRecordsResponse {
  items: ClinicalEncounterRecordItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
