import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../core/auth/AuthProvider';
import { recordsApi } from './api';
import type { ClinicalEncounterRecordsResponse } from './types';
import { Search, FileText, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Filter, Calendar, Users, CheckCircle2, Clock } from 'lucide-react';

export function RecordsPage() {
  const { activeRole, status: authStatus } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Defend the route against unauthorized access
  useEffect(() => {
    if (authStatus === 'authenticated' && activeRole !== 'OWNER' && activeRole !== 'PROFESSIONAL') {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatus, activeRole, navigate]);

  const [data, setData] = useState<ClinicalEncounterRecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real active parameters safely parsed
  const activeQ = searchParams.get('q') || '';
  const rawStatus = searchParams.get('status');
  const activeStatus = rawStatus === 'DRAFT' || rawStatus === 'FINALIZED' ? rawStatus : null;

  const rawMine = searchParams.get('mine');
  const activeMine = activeRole === 'PROFESSIONAL' && rawMine === '1' ? 1 : 0;

  const rawPage = Number(searchParams.get('page') || '1');
  const activePage = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize = 20;

  // Search input state (local to avoid typing lag)
  const [searchInput, setSearchInput] = useState(activeQ);

  const requestCounter = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);

  const fetchRecords = useCallback(async () => {
    if (activeRole !== 'OWNER' && activeRole !== 'PROFESSIONAL') return; // Guard
    const currentRequestId = ++requestCounter.current;

    setLoading(true);
    setError(null);

    try {
      const res = await recordsApi.list({
        status: activeStatus || undefined,
        q: activeQ || undefined,
        mine: activeMine === 1 ? 1 : undefined,
        page: activePage,
        pageSize,
      });

      if (currentRequestId === requestCounter.current) {
        setData(res);
        setLoading(false);
      }
    } catch {
      if (currentRequestId === requestCounter.current) {
        setError('Error al cargar los expedientes.');
        setLoading(false);
      }
    }
  }, [activeStatus, activeQ, activeMine, activePage, activeRole]);

  useEffect(() => {
    if (authStatus === 'authenticated' && (activeRole === 'OWNER' || activeRole === 'PROFESSIONAL')) {
      fetchRecords();
    }
  }, [fetchRecords, authStatus, activeRole]);

  const updateParams = useCallback((newParams: Record<string, string | null>) => {
    setSearchParams(current => {
      const updated = new URLSearchParams(current);

      // Always reset to page 1 when changing filters, unless page itself is changed
      if (!('page' in newParams)) {
        updated.set('page', '1');
      }

      Object.entries(newParams).forEach(([key, value]) => {
        if (value === null || value === '') {
          updated.delete(key);
        } else {
          updated.set(key, value);
        }
      });

      return updated;
    });
  }, [setSearchParams]);

  // Sync external URL changes back to local input
  useEffect(() => {
    setSearchInput(activeQ);
  }, [activeQ]);

  // Prevent form submission reload
  const handleSearchSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
  };

  useEffect(() => {
    // Debounce the search input
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchInput !== activeQ) {
      searchTimeoutRef.current = window.setTimeout(() => {
        updateParams({ q: searchInput });
      }, 500);
    }

    return () => {
      if (searchTimeoutRef.current !== null) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput, activeQ, updateParams]);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(d);
    } catch {
      return '--';
    }
  };

  const getEmptyMessage = () => {
    if (activeQ) return 'No se encontraron expedientes con esa búsqueda.';
    if (activeStatus === 'DRAFT') return 'No hay borradores pendientes.';
    if (activeStatus === 'FINALIZED') return 'No hay expedientes finalizados.';
    return 'No hay expedientes registrados.';
  };

  // Prevent rendering if not allowed
  if (authStatus !== 'authenticated' || (activeRole !== 'OWNER' && activeRole !== 'PROFESSIONAL')) {
    return null; // Will navigate out soon
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            Expedientes
          </h1>
          <p className="text-slate-500 mt-1">Consulta y continúa los expedientes clínicos de la clínica.</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por paciente..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </form>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
          <div className="flex items-center bg-slate-100 rounded-lg p-1 shrink-0">
            <button
              type="button"
              onClick={() => updateParams({ status: null })}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!activeStatus ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => updateParams({ status: 'DRAFT' })}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeStatus === 'DRAFT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Borradores
            </button>
            <button
              type="button"
              onClick={() => updateParams({ status: 'FINALIZED' })}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeStatus === 'FINALIZED' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Finalizados
            </button>
          </div>

          {activeRole === 'PROFESSIONAL' && (
            <button
              type="button"
              onClick={() => updateParams({ mine: activeMine === 1 ? null : '1' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors shrink-0 ${activeMine === 1 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              <Filter size={14} />
              Solo míos
            </button>
          )}
        </div>
      </div>

      {/* Content State */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="text-red-500" size={40} />
          <div>
            <h3 className="text-red-800 font-bold text-lg">Error</h3>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchRecords}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
          >
            <RefreshCw size={18} />
            Reintentar
          </button>
        </div>
      ) : loading || !data ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl h-24 border border-slate-200 shadow-sm animate-pulse flex items-center p-4 gap-4">
              <div className="w-12 h-12 bg-slate-200 rounded-lg shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-4 bg-slate-200 rounded w-1/3" />
                <div className="h-3 bg-slate-200 rounded w-1/4" />
              </div>
              <div className="w-24 h-6 bg-slate-200 rounded-full" />
            </div>
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-4">
            <FileText size={32} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{getEmptyMessage()}</h3>
          <p className="text-slate-500 mt-2 max-w-sm">Intenta ajustar los filtros o la búsqueda para encontrar el expediente.</p>
          {(activeQ || activeStatus || activeMine === 1) && (
            <button
              type="button"
              onClick={() => updateParams({ q: null, status: null, mine: null })}
              className="mt-6 px-4 py-2 text-blue-600 font-medium hover:bg-blue-50 rounded-lg transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => navigate(`/patients/${encodeURIComponent(item.patient.id)}/encounters/${encodeURIComponent(item.id)}`)}
              className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow group text-left active:scale-[0.99] w-full"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-colors ${item.status === 'DRAFT' ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'}`}>
                {item.status === 'DRAFT' ? <Clock size={24} /> : <CheckCircle2 size={24} />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-bold text-slate-900 truncate pr-2">
                    {item.patient.displayName}
                  </h3>
                  <div className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wide shrink-0 ${item.status === 'DRAFT' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {item.status === 'DRAFT' ? 'BORRADOR' : 'FINALIZADO'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} className="shrink-0" />
                    <span>{formatDate(item.occurredAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="shrink-0" />
                    <span className="truncate max-w-[150px]">{item.professional.displayName}</span>
                  </div>
                </div>
              </div>

              <ChevronRight className="hidden sm:block text-slate-300 group-hover:text-blue-500 shrink-0" size={20} />
            </button>
          ))}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-sm text-slate-600 font-medium">
                Página {data.page} de {data.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => updateParams({ page: (data.page - 1).toString() })}
                  className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  disabled={data.page >= data.totalPages}
                  onClick={() => updateParams({ page: (data.page + 1).toString() })}
                  className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  aria-label="Página siguiente"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
