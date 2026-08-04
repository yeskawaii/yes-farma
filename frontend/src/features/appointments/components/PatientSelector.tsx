import { useState, useEffect, useRef } from 'react';
import { patientsApi } from '../../patients/api';
import type { PatientListItem } from '../../patients/types';

interface PatientSelectorProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  initialPatient?: { id: string; firstName: string; lastName: string; secondLastName: string | null };
}

export function PatientSelector({ value, onChange, disabled, initialPatient }: PatientSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; firstName: string; lastName: string; secondLastName: string | null } | null>(initialPatient || null);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.trim() === '') {
        setPatients([]);
        return;
      }

      setLoading(true);
      patientsApi.list({ q: searchTerm, status: 'ACTIVE', page: 1, pageSize: 10 })
        .then(res => {
          setPatients(res.items);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="patient-selector">
        Paciente
      </label>
      {selectedPatient && value ? (
        <div className="flex items-center justify-between p-2 border rounded bg-gray-50">
          <span className="truncate">
            {selectedPatient.firstName} {selectedPatient.lastName} {selectedPatient.secondLastName || ''}
          </span>
          {!disabled && (
            <button
              type="button"
              className="text-sm text-red-500 hover:text-red-700 focus:outline-none"
              onClick={() => {
                onChange('');
                setSelectedPatient(null);
                setSearchTerm('');
              }}
            >
              Cambiar
            </button>
          )}
        </div>
      ) : (
        <div>
          <input
            id="patient-selector"
            type="text"
            className="w-full border rounded p-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Buscar paciente por nombre..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            disabled={disabled}
            autoComplete="off"
          />
          {isOpen && searchTerm.trim() !== '' && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-60 overflow-y-auto">
              {loading ? (
                <div className="p-2 text-sm text-gray-500 text-center">Buscando...</div>
              ) : patients.length > 0 ? (
                patients.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left p-2 hover:bg-blue-50 text-sm border-b last:border-b-0 focus:outline-none focus:bg-blue-100"
                    onClick={() => {
                      setSelectedPatient({ ...p, secondLastName: p.secondLastName ?? null });
                      onChange(p.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                  >
                    {p.firstName} {p.lastName} {p.secondLastName || ''}
                  </button>
                ))
              ) : (
                <div className="p-2 text-sm text-gray-500 text-center">No se encontraron pacientes activos</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
