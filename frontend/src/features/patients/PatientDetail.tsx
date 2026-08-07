import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserCircle2, Mail, Phone, Calendar, AlertCircle, RefreshCw, Clock, Edit2, Ban, AlertTriangle, X, CheckCircle } from 'lucide-react';
import { patientsApi } from './api';
import { ApiClientError } from '../../core/api/client';
import type { PatientDetail as PatientDetailType } from './types';
import { useAuth } from '../../core/auth/AuthProvider';
import { EncounterList } from '../clinical-encounters/EncounterList';

export function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<PatientDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const { activeRole } = useAuth();
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const canDeactivate = data?.status === 'ACTIVE' && (activeRole === 'OWNER' || activeRole === 'PROFESSIONAL');
  const canReactivate = data?.status === 'INACTIVE' && (activeRole === 'OWNER' || activeRole === 'PROFESSIONAL');

  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const [reactivateSuccess, setReactivateSuccess] = useState(false);

  const handleDeactivate = async () => {
    if (!id) return;
    try {
      setDeactivating(true);
      setDeactivateError(null);
      await patientsApi.deactivate(id);
      setData(prev => prev ? { ...prev, status: 'INACTIVE' } : null);
      setShowDeactivateDialog(false);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 403) {
        setDeactivateError('No tienes permisos para realizar esta acción.');
      } else if (err instanceof ApiClientError || err instanceof Error) {
        setDeactivateError(err.message || 'Error al desactivar el paciente.');
      } else {
        setDeactivateError('Error al desactivar el paciente.');
      }
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async () => {
    if (!id) return;
    try {
      setReactivating(true);
      setReactivateError(null);
      setReactivateSuccess(false);
      const updatedPatient = await patientsApi.reactivate(id);
      setData(updatedPatient);
      setShowReactivateDialog(false);
      setReactivateSuccess(true);
      setTimeout(() => setReactivateSuccess(false), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 404) {
        setShowReactivateDialog(false);
        setNotFound(true);
      } else if (err instanceof ApiClientError && err.status === 403) {
        setReactivateError('No tienes permisos para realizar esta acción.');
      } else if (err instanceof ApiClientError || err instanceof Error) {
        setReactivateError(err.message || 'Error al reactivar el paciente.');
      } else {
        setReactivateError('Error al reactivar el paciente.');
      }
    } finally {
      setReactivating(false);
    }
  };

  const fetchPatient = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      setNotFound(false);
      const res = await patientsApi.getById(id);
      setData(res);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 404) {
        setNotFound(true);
      } else if (err instanceof ApiClientError || err instanceof Error) {
        setError(err.message || 'Error al cargar el detalle del paciente.');
      } else {
        setError('Error al cargar el detalle del paciente.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatient();
  }, [id]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-slide-up">
        <div className="w-20 h-20 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
          <UserCircle2 size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Paciente no encontrado</h2>
        <p className="text-slate-500 mt-2 max-w-md">El paciente que buscas no existe o no tienes permisos para acceder a este registro en esta clínica.</p>
        <button
          onClick={() => navigate('/patients')}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ArrowLeft size={18} />
          Volver al directorio
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3 animate-slide-up">
        <AlertCircle className="text-red-500" size={40} />
        <div>
          <h3 className="text-red-800 font-bold text-lg">Error al cargar</h3>
          <p className="text-red-600 mt-1">{error}</p>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => navigate('/patients')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-medium"
          >
            <ArrowLeft size={18} />
            Volver
          </button>
          <button
            onClick={fetchPatient}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
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
          <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
          <div className="h-6 bg-slate-200 rounded w-1/4"></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm h-64"></div>
      </div>
    );
  }

  const fullName = `${data.firstName} ${data.lastName} ${data.secondLastName || ''}`.trim();
  const initials = `${data.firstName[0]}${data.lastName[0]}`;

  const calculateAge = (birthDate: string | null | undefined) => {
    if (!birthDate) return 'N/A';
    const diff = Date.now() - new Date(birthDate).getTime();
    const age = new Date(diff).getUTCFullYear() - 1970;
    return age;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const sexDisplay = {
    'FEMALE': 'Femenino',
    'MALE': 'Masculino',
    'INTERSEX': 'Intersexual',
    'UNKNOWN': 'No especificado'
  };

  return (
    <div className="flex flex-col gap-6 animate-slide-up">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/patients')}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium group text-sm"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Volver a pacientes
        </button>
        <button
          onClick={() => navigate(`/patients/${id}/edit`)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium shadow-sm text-sm"
        >
          <Edit2 size={16} />
          Editar Paciente
        </button>
      </div>

      {/* Header Profile */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-3xl shadow-sm shrink-0">
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{fullName}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${data.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
              {data.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          {reactivateSuccess && (
            <p className="text-emerald-600 mt-2 text-sm font-medium flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
              <CheckCircle size={16} />
              Paciente reactivado con éxito
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info Column */}
        <div className="md:col-span-2 flex flex-col gap-6">
          {/* General Data */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <UserCircle2 className="text-blue-500" size={20} />
              Datos Personales
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Fecha de nacimiento</p>
                <p className="text-slate-900 font-medium">
                  {data.birthDate ? formatDate(data.birthDate) : 'No registrada'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Edad</p>
                <p className="text-slate-900 font-medium">{data.birthDate ? `${calculateAge(data.birthDate)} años` : 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Sexo asignado al nacer</p>
                <p className="text-slate-900 font-medium">{data.sexAtBirth ? sexDisplay[data.sexAtBirth] : 'No especificado'}</p>
              </div>
            </div>
          </div>

          {/* Contact Data */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Phone className="text-teal-500" size={20} />
              Contacto
            </h2>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Teléfono</p>
                  <p className="text-slate-900 font-medium">{data.phone || 'No registrado'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Correo electrónico</p>
                  <p className="text-slate-900 font-medium">{data.email || 'No registrado'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Administrative Notes */}
          {data.administrativeNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-amber-900 mb-2">Notas Administrativas</h2>
              <p className="text-amber-800 text-sm leading-relaxed whitespace-pre-wrap">{data.administrativeNotes}</p>
            </div>
          )}

          {/* Clinical Encounters */}
          {id && <EncounterList patientId={id} />}
        </div>

        {/* Sidebar Column */}
        <div className="flex flex-col gap-6">
          {/* Meta Info */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Clock className="text-slate-400" size={16} />
              Registro en sistema
            </h2>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Fecha de creación</p>
                <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                  <Calendar size={14} className="text-slate-400" />
                  {formatDate(data.createdAt)}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Última actualización</p>
                <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                  <Calendar size={14} className="text-slate-400" />
                  {formatDate(data.updatedAt)}
                </div>
              </div>
            </div>
          </div>

          {canDeactivate && (
            <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-bold text-red-700 flex items-center gap-2">
                  <Ban size={16} />
                  Zona de Peligro
                </h2>
                <p className="text-xs text-slate-500 mt-1">Desactiva este paciente para que no aparezca en las búsquedas principales. No se eliminará físicamente.</p>
              </div>
              <button
                onClick={() => setShowDeactivateDialog(true)}
                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
              >
                Desactivar Paciente
              </button>
            </div>
          )}

          {canReactivate && (
            <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
                  <CheckCircle size={16} />
                  Reactivar
                </h2>
                <p className="text-xs text-slate-500 mt-1">Vuelve a habilitar este paciente para que aparezca en el listado activo.</p>
              </div>
              <button
                onClick={() => setShowReactivateDialog(true)}
                className="w-full inline-flex justify-center items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors font-medium text-sm"
              >
                Reactivar Paciente
              </button>
            </div>
          )}
        </div>
      </div>

      {showDeactivateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Desactivar Paciente</h3>
                </div>
                <button
                  onClick={() => setShowDeactivateDialog(false)}
                  disabled={deactivating}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-4 text-slate-600 text-sm space-y-3">
                <p>
                  ¿Estás seguro de que deseas desactivar a <strong>{fullName}</strong>?
                </p>
                <p>
                  Esta acción <strong>no eliminará</strong> físicamente el registro (se mantiene para auditoría e historial clínico), pero el paciente pasará a estado inactivo y no aparecerá en las búsquedas activas.
                </p>
                {deactivateError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mt-4 text-xs font-medium">
                    {deactivateError}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeactivateDialog(false)}
                disabled={deactivating}
                className="px-4 py-2 font-medium text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="px-4 py-2 font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm inline-flex items-center gap-2"
              >
                {deactivating && <RefreshCw size={16} className="animate-spin" />}
                {deactivating ? 'Desactivando...' : 'Sí, desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReactivateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Reactivar Paciente</h3>
                </div>
                <button
                  onClick={() => setShowReactivateDialog(false)}
                  disabled={reactivating}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="mt-4 text-slate-600 text-sm space-y-3">
                <p>
                  ¿Estás seguro de que deseas reactivar a <strong>{fullName}</strong>?
                </p>
                <p>
                  El paciente volverá a aparecer entre los pacientes activos del directorio y su información completa estará disponible para operaciones.
                </p>
                {reactivateError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mt-4 text-xs font-medium">
                    {reactivateError}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowReactivateDialog(false)}
                disabled={reactivating}
                className="px-4 py-2 font-medium text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleReactivate}
                disabled={reactivating}
                className="px-4 py-2 font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm inline-flex items-center gap-2"
              >
                {reactivating && <RefreshCw size={16} className="animate-spin" />}
                {reactivating ? 'Reactivando...' : 'Sí, reactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
