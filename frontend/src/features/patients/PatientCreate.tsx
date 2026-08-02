import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatientForm } from './PatientForm';
import { patientsApi } from './api';
import type { PatientFormInput } from './types';
import { ApiClientError } from '../../core/api/client';
import { AlertTriangle, X } from 'lucide-react';

export function PatientCreate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingData, setPendingData] = useState<PatientFormInput | null>(null);

  const handleSubmit = async (data: PatientFormInput, confirmDuplicate = false) => {
    try {
      setLoading(true);
      setError(null);
      const dataToSend = { ...data, confirmPossibleDuplicate: confirmDuplicate };
      const newPatient = await patientsApi.create(dataToSend);
      navigate(`/patients/${newPatient.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 409 && err.code === 'POSSIBLE_DUPLICATE') {
        setPendingData(data);
        setShowDuplicateDialog(true);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error al crear el paciente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmDuplicate = () => {
    if (pendingData) {
      setShowDuplicateDialog(false);
      handleSubmit(pendingData, true);
    }
  };

  const cancelDuplicate = () => {
    setShowDuplicateDialog(false);
    setPendingData(null);
  };

  return (
    <>
      <PatientForm
        onSubmit={(data) => handleSubmit(data, false)}
        loading={loading}
        error={error}
        title="Nuevo Paciente"
        subtitle="Registra los datos para un nuevo expediente clínico."
      />

      {showDuplicateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Posible Duplicado</h3>
                </div>
                <button onClick={cancelDuplicate} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={20} />
                </button>
              </div>
              <div className="mt-4 text-slate-600 text-sm">
                <p>
                  Ya existe un paciente registrado con los mismos datos (nombre, fecha de nacimiento o contacto) en esta clínica.
                </p>
                <p className="mt-2 font-medium">¿Estás seguro de que deseas crear un nuevo registro?</p>
              </div>
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={cancelDuplicate}
                disabled={loading}
                className="px-4 py-2 font-medium text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
              >
                Revisar datos
              </button>
              <button
                onClick={confirmDuplicate}
                disabled={loading}
                className="px-4 py-2 font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm"
              >
                {loading ? 'Creando...' : 'Crear de todas formas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
