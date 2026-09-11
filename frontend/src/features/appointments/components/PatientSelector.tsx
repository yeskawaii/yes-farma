import { useState, useEffect, useRef, useId } from 'react';
import { patientsApi } from '../../patients/api';
import type { PatientListItem } from '../../patients/types';

interface PatientSelectorProps {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  initialPatient?: { id: string; firstName: string; lastName: string; secondLastName: string | null };
}

export function PatientSelector({ value, onChange, disabled, initialPatient }: PatientSelectorProps) {
  const inputId = useId();
  const [searchError, setSearchError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; firstName: string; lastName: string; secondLastName: string | null } | null>(initialPatient || null);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setPatients([]);
    setSearchError(false);
    setLoading(Boolean(searchTerm.trim()));
    const timer = setTimeout(() => {
      if (!searchTerm.trim()) return;
      patientsApi.list({ q: searchTerm, status: 'ACTIVE', page: 1, pageSize: 10 })
        .then(res => { if (!cancelled) setPatients(res.items); })
        .catch(() => { if (!cancelled) setSearchError(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
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
      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={inputId}>
        Paciente
      </label>
      {selectedPatient && value ? (
        <div className="flex items-center justify-between gap-3 p-3 border border-blue-200 rounded-lg bg-blue-50">
          <span className="truncate">
            {selectedPatient.firstName} {selectedPatient.lastName} {selectedPatient.secondLastName || ''}
          </span>
          {!disabled && (
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800"
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
            id={inputId}
            type="text"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
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
              ) : searchError ? (
                <div role="alert" className="p-3 text-sm text-red-600">No se pudo buscar. Intenta escribir el nombre de nuevo.</div>
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
