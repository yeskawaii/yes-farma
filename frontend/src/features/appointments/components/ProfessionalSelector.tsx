import { useState, useEffect } from 'react';
import { appointmentsApi } from '../api';
import type { AppointmentProfessionalOption } from '../types';

interface ProfessionalSelectorProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  userRole?: string | null;
  userMembershipId?: string | null;
}

export function ProfessionalSelector({ value, onChange, disabled, userRole, userMembershipId }: ProfessionalSelectorProps) {
  const [professionals, setProfessionals] = useState<AppointmentProfessionalOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isProfessionalUser = userRole === 'PROFESSIONAL';

  useEffect(() => {
    appointmentsApi.listProfessionals()
      .then(res => {
        setProfessionals(res);
        // Auto-select for PROFESSIONAL role
        if (isProfessionalUser && userMembershipId) {
          const myself = res.find(p => p.id === userMembershipId);
          if (myself && value !== myself.id) {
            onChange(myself.id);
          }
        }
      })
      .catch(err => {
        console.error('Error fetching professionals', err);
        setError('Error al cargar profesionales.');
      })
      .finally(() => setLoading(false));
  }, [isProfessionalUser, userMembershipId, onChange, value]);

  if (loading) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Profesional</label>
        <div className="p-2 text-sm text-gray-500 border rounded bg-gray-50">Cargando profesionales...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Profesional</label>
        <div className="p-2 text-sm text-red-500 border border-red-200 rounded bg-red-50">{error}</div>
      </div>
    );
  }

  // Si es PROFESSIONAL, mostramos bloqueado su nombre
  if (isProfessionalUser) {
    const prof = professionals.find(p => p.id === userMembershipId);
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Profesional</label>
        <div className="p-2 text-sm bg-gray-100 border rounded text-gray-700">
          {prof ? `${prof.user.firstName} ${prof.user.lastName}` : 'No encontrado'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="professional-selector">
        Profesional
      </label>
      <select
        id="professional-selector"
        className="w-full border rounded p-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Seleccione un profesional</option>
        {professionals.map(p => (
          <option key={p.id} value={p.id}>
            {p.user.firstName} {p.user.lastName}
          </option>
        ))}
      </select>
    </div>
  );
}
