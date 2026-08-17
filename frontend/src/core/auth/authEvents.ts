export const AUTH_INVALIDATED_EVENT = 'yes-farma:auth-invalidated';

export interface AuthInvalidatedDetail {
  status: number;
  code?: string;
}

export function notifyAuthInvalidated(detail: AuthInvalidatedDetail) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<AuthInvalidatedDetail>(AUTH_INVALIDATED_EVENT, {
      detail,
    }),
  );
}
