import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PatientForm } from './PatientForm';
import { patientsApi } from './api';
import type { PatientFormInput, PatientDetail } from './types';
import { ApiClientError } from '../../core/api/client';
import { UserCircle2, ArrowLeft } from 'lucide-react';

export function PatientEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatient = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const res = await patientsApi.getById(id);
        setPatient(res);
      } catch (err: unknown) {
        if (err instanceof ApiClientError && err.status === 404) {
          setNotFound(true);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error al cargar el paciente.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPatient();
  }, [id]);

  const handleSubmit = async (data: PatientFormInput) => {
    if (!id) return;
    try {
      setSaving(true);
      setSaveError(null);
      // We can send all fields because the backend schema allows updating all editable fields
      await patientsApi.update(id, data);
      navigate(`/patients/${id}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError('Error al actualizar el paciente.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-slide-up">
        <div className="w-20 h-20 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
          <UserCircle2 size={40} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Paciente no encontrado</h2>
        <p className="text-slate-500 mt-2 max-w-md">El paciente que intentas editar no existe o no tienes permisos.</p>
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-slide-up">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Error</h2>
        <p className="text-red-500 mt-2 max-w-md">{error}</p>
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

  if (loading || !patient) {
    return (
      <div className="flex flex-col gap-6 animate-pulse max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
          <div className="h-6 bg-slate-200 rounded w-1/4"></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm h-96"></div>
      </div>
    );
  }

  const initialData: Partial<PatientFormInput> = {
    firstName: patient.firstName,
    lastName: patient.lastName,
    secondLastName: patient.secondLastName || '',
    birthDate: patient.birthDate ? patient.birthDate.split('T')[0] : '', // backend normally returns full ISO string if date is used, wait, schema is YYYY-MM-DD
    // If backend returns YYYY-MM-DD, we just use it directly. Assuming it returns exactly what we sent.
    sexAtBirth: patient.sexAtBirth || '',
    phone: patient.phone || '',
    email: patient.email || '',
    administrativeNotes: patient.administrativeNotes || '',
  };

  // Ensure date format is YYYY-MM-DD for input type="date"
  if (patient.birthDate && patient.birthDate.includes('T')) {
    initialData.birthDate = patient.birthDate.split('T')[0];
  }

  return (
    <PatientForm
      initialData={initialData}
      onSubmit={handleSubmit}
      loading={saving}
      error={saveError}
      title="Editar Paciente"
      subtitle={`Actualizando la información de ${patient.firstName} ${patient.lastName}`}
      onCancel={() => navigate(`/patients/${id}`)}
    />
  );
}
