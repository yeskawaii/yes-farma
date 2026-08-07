import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, AlertCircle, RefreshCw, Calendar, CheckCircle, Clock } from 'lucide-react';
import { clinicalEncountersApi } from './api';
import type { ClinicalEncounterListItem, ClinicalEncounterStatus } from './types';

interface EncounterListProps {
  patientId: string;
}

export function EncounterList({ patientId }: EncounterListProps) {
  const [encounters, setEncounters] = useState<ClinicalEncounterListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const fetchEncounters = useCallback(async () => {
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    try {
      setLoading(true);
      setError(null);
      const res = await clinicalEncountersApi.listClinicalEncounters({
        patientId,
        page: 1,
        pageSize: 20
      });
      if (currentRequestId === requestIdRef.current) {
        setEncounters(res);
      }
    } catch {
      if (currentRequestId === requestIdRef.current) {
        setError('Ocurrió un error al cargar el expediente clínico.');
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [patientId]);

  useEffect(() => {
    void fetchEncounters();

    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchEncounters]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const StatusBadge = ({ status }: { status: ClinicalEncounterStatus }) => {
    if (status === 'FINALIZED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle size={12} />
          Finalizada
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <Clock size={12} />
        Borrador
      </span>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <FileText className="text-blue-500" size={20} />
          Expediente clínico
        </h2>
        <p className="text-sm text-slate-500">Historial de consultas y notas clínicas.</p>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="text-red-500" size={32} />
          <p className="text-red-700 font-medium text-sm">{error}</p>
          <button
            onClick={() => { void fetchEncounters(); }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium text-sm mt-1"
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : encounters.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 flex flex-col items-center justify-center text-center mt-2">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm text-slate-300">
            <FileText size={24} />
          </div>
          <p className="text-slate-600 font-medium">Aún no hay consultas registradas para este paciente.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {encounters.map(encounter => (
            <div
              key={encounter.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {formatDate(encounter.occurredAt)}
                  </span>
                  <StatusBadge status={encounter.status} />
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                      {encounter.professional.displayName.charAt(0)}
                    </span>
                    {encounter.professional.displayName}
                  </span>

                  {encounter.appointment && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Calendar size={14} />
                        Consulta agendada
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
