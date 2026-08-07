import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, AlertCircle, RefreshCw, Calendar, Clock, CheckCircle } from 'lucide-react';
import { clinicalEncountersApi } from './api';
import type { ClinicalEncounterDetail } from './types';
import { ApiClientError } from '../../core/api/client';

export function EncounterEditor() {
  const { patientId, encounterId } = useParams<{ patientId: string; encounterId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<ClinicalEncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const fetchEncounter = useCallback(async () => {
    if (!encounterId) return;

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    try {
      setLoading(true);
      setError(null);
      const res = await clinicalEncountersApi.getClinicalEncounter(encounterId);
      if (currentRequestId === requestIdRef.current) {
        setData(res);
      }
    } catch (err: unknown) {
      if (currentRequestId === requestIdRef.current) {
        if (err instanceof ApiClientError && err.status === 403) {
          setError('No tienes permisos para ver el detalle de esta consulta.');
        } else {
          setError('Ocurrió un error al cargar la consulta.');
        }
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [encounterId]);

  useEffect(() => {
    void fetchEncounter();

    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchEncounter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleBack = () => {
    navigate(`/patients/${patientId}`);
  };

  if (error) {
    return (
      <div className="flex flex-col gap-6 animate-slide-up">
        <div>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium group text-sm"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Volver al paciente
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="text-red-500" size={40} />
          <div>
            <h3 className="text-red-800 font-bold text-lg">Error al cargar</h3>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
          <button
            onClick={() => { void fetchEncounter(); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium mt-2"
          >
            <RefreshCw size={18} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-24 h-6 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm h-40"></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm h-64"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Top Bar */}
      <div>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium group text-sm"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Volver al paciente
        </button>
      </div>

      {/* Header Profile */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Consulta clínica</h1>
            <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
              <span>{formatDate(data.occurredAt)}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
              <span>{data.patient.displayName}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:items-end gap-2 shrink-0">
          {data.status === 'FINALIZED' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle size={16} />
              Finalizada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <Clock size={16} />
              Borrador
            </span>
          )}
        </div>
      </div>

      {/* Info Card */}
      {data.status === 'DRAFT' ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-blue-800 text-sm flex items-start gap-3 shadow-sm">
          <FileText className="shrink-0 mt-0.5" size={18} />
          <p>Esta consulta está en borrador. En el siguiente paso podrás capturar la información clínica.</p>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-slate-700 text-sm flex items-start gap-3 shadow-sm">
          <CheckCircle className="shrink-0 mt-0.5 text-slate-500" size={18} />
          <p>Esta consulta está finalizada y es de solo lectura.</p>
        </div>
      )}

      {/* Basic Data Readonly */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Información General</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Paciente</p>
            <p className="text-slate-900 font-medium">{data.patient.displayName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Profesional responsable</p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                {data.professional.displayName.charAt(0)}
              </div>
              <p className="text-slate-900 font-medium">{data.professional.displayName}</p>
            </div>
          </div>

          {data.appointment && (
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Cita vinculada</p>
              <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
                <Calendar size={16} className="text-slate-400" />
                Consulta agendada
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
