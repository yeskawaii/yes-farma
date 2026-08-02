import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, ChevronRight, AlertCircle, RefreshCw, UserCircle2 } from 'lucide-react';
import { patientsApi } from './api';
import type { PatientListItem, PatientStatus, PaginatedResponse } from './types';
import { useDebounce } from '../../shared/hooks/useDebounce';

export function PatientList() {
  const navigate = useNavigate();
  
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PatientStatus | ''>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const debouncedQ = useDebounce(q, 400);

  const [data, setData] = useState<PaginatedResponse<PatientListItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await patientsApi.list({
        q: debouncedQ,
        status: status === '' ? undefined : status,
        page,
        pageSize
      });
      setData(res);
    } catch (err: unknown) {
      setError('Ocurrió un error al cargar los pacientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, [debouncedQ, status, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status]);

  // Stabilize page when total pages change
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQ(e.target.value);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(e.target.value as PatientStatus | '');
  };

  const calculateAge = (birthDate: string | null | undefined) => {
    if (!birthDate) return 'N/A';
    const diff = Date.now() - new Date(birthDate).getTime();
    const age = new Date(diff).getUTCFullYear() - 1970;
    return age;
  };

  const StatusBadge = ({ status }: { status: PatientStatus }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
      {status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
    </span>
  );

  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pacientes</h1>
          <p className="text-slate-500 mt-1">Gestiona el directorio de pacientes de la clínica.</p>
        </div>
        <button 
          onClick={() => navigate('/patients/new')}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm w-full md:w-auto"
        >
          <Plus size={18} />
          <span>Nuevo Paciente</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre, correo o teléfono..."
            value={q}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900 placeholder:text-slate-400"
          />
        </div>
        <div className="relative sm:w-48">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <select
            value={status}
            onChange={handleStatusChange}
            className="w-full pl-10 pr-8 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-900 appearance-none"
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activos</option>
            <option value="INACTIVE">Inactivos</option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="text-red-500" size={40} />
          <div>
            <h3 className="text-red-800 font-bold text-lg">Error al cargar</h3>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
          <button 
            onClick={fetchPatients}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
          >
            <RefreshCw size={18} />
            Intentar de nuevo
          </button>
        </div>
      ) : loading ? (
        // Skeleton
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-slate-100 animate-pulse">
              <div className="w-12 h-12 bg-slate-200 rounded-full shrink-0"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                <div className="h-3 bg-slate-200 rounded w-1/3"></div>
              </div>
              <div className="hidden md:block h-6 bg-slate-200 rounded w-20"></div>
            </div>
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        // Empty State
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center gap-3 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mb-2">
            <UserCircle2 size={32} />
          </div>
          <h3 className="text-slate-900 font-bold text-lg">
            {debouncedQ || status !== '' ? 'No hay resultados' : 'Aún no hay pacientes'}
          </h3>
          <p className="text-slate-500 max-w-sm">
            {debouncedQ || status !== '' 
              ? 'Intenta ajustar los filtros o los términos de búsqueda.' 
              : 'Empieza agregando el primer paciente a la plataforma.'}
          </p>
        </div>
      ) : (
        // List
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500 font-medium">
            Mostrando <span className="font-bold text-slate-700">{data?.items.length}</span> de <span className="font-bold text-slate-700">{data?.total}</span> pacientes
          </p>
          
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-6 py-4">Paciente</th>
                  <th className="px-6 py-4">Contacto</th>
                  <th className="px-6 py-4">Edad</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{p.firstName} {p.lastName} {p.secondLastName || ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-slate-500 text-xs gap-0.5">
                        {p.phone && <span>{p.phone}</span>}
                        {p.email && <span>{p.email}</span>}
                        {!p.phone && !p.email && <span className="italic">Sin contacto</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {calculateAge(p.birthDate)} {p.birthDate && 'años'}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 group-hover:text-blue-600 transition-colors inline-flex p-1.5 rounded-lg hover:bg-blue-50">
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {data?.items.map((p) => (
              <div 
                key={p.id} 
                onClick={() => navigate(`/patients/${p.id}`)}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4 active:scale-[0.98] transition-all cursor-pointer hover:border-blue-300"
              >
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="font-semibold text-slate-900 truncate text-base">{p.firstName} {p.lastName}</h3>
                  <div className="text-xs text-slate-500 mt-1 flex flex-col gap-0.5 truncate">
                    {p.phone && <span>{p.phone}</span>}
                    {p.email && <span>{p.email}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={p.status} />
                  <ChevronRight size={20} className="text-slate-300" />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm mt-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Anterior
              </button>
              <span className="text-sm text-slate-600 font-medium">
                Página {page} de {data.totalPages}
              </span>
              <button 
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
