import React, { useState } from 'react';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import type { PatientFormInput } from './types';
import { useNavigate } from 'react-router-dom';

interface PatientFormProps {
  initialData?: Partial<PatientFormInput>;
  onSubmit: (data: PatientFormInput) => Promise<void>;
  loading: boolean;
  error: string | null;
  onCancel?: () => void;
  title: string;
  subtitle: string;
}

export function PatientForm({ initialData, onSubmit, loading, error, onCancel, title, subtitle }: PatientFormProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<PatientFormInput>({
    firstName: initialData?.firstName || '',
    lastName: initialData?.lastName || '',
    secondLastName: initialData?.secondLastName || '',
    birthDate: initialData?.birthDate || '',
    sexAtBirth: initialData?.sexAtBirth || '',
    phone: initialData?.phone || '',
    email: initialData?.email || '',
    administrativeNotes: initialData?.administrativeNotes || '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PatientFormInput, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof PatientFormInput, string>> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'El nombre es obligatorio.';
    } else if (formData.firstName.trim().length > 100) {
      newErrors.firstName = 'No debe exceder los 100 caracteres.';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'El apellido es obligatorio.';
    } else if (formData.lastName.trim().length > 100) {
      newErrors.lastName = 'No debe exceder los 100 caracteres.';
    }

    if (formData.secondLastName && formData.secondLastName.trim().length > 100) {
      newErrors.secondLastName = 'No debe exceder los 100 caracteres.';
    }

    if (formData.birthDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.birthDate)) {
        newErrors.birthDate = 'Formato inválido (YYYY-MM-DD).';
      } else {
        const d = new Date(formData.birthDate);
        if (isNaN(d.getTime()) || d > new Date()) {
          newErrors.birthDate = 'Fecha inválida o futura.';
        }
      }
    }

    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone && (cleanPhone.length < 7 || cleanPhone.length > 20)) {
        newErrors.phone = 'Debe contener entre 7 y 20 dígitos.';
      }
    }

    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        newErrors.email = 'Correo electrónico inválido.';
      } else if (formData.email.length > 254) {
        newErrors.email = 'No debe exceder los 254 caracteres.';
      }
    }

    if (formData.administrativeNotes && formData.administrativeNotes.length > 2000) {
      newErrors.administrativeNotes = 'No debe exceder los 2000 caracteres.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof PatientFormInput]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else navigate(-1);
  };

  return (
    <div className="flex flex-col gap-6 animate-slide-up max-w-4xl mx-auto w-full">
      <div className="flex items-center gap-4">
        <button 
          type="button"
          onClick={handleCancel}
          className="text-slate-500 hover:text-slate-900 transition-colors bg-white border border-slate-200 p-2 rounded-lg shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="text-slate-500 mt-1">{subtitle}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Datos Personales</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="firstName" className="text-sm font-semibold text-slate-700">Nombre(s) <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                disabled={loading}
                className={`w-full px-4 py-2.5 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 ${errors.firstName ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              />
              {errors.firstName && <span className="text-red-500 text-xs font-medium">{errors.firstName}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="lastName" className="text-sm font-semibold text-slate-700">Primer Apellido <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                disabled={loading}
                className={`w-full px-4 py-2.5 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 ${errors.lastName ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              />
              {errors.lastName && <span className="text-red-500 text-xs font-medium">{errors.lastName}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="secondLastName" className="text-sm font-semibold text-slate-700">Segundo Apellido</label>
              <input
                type="text"
                id="secondLastName"
                name="secondLastName"
                value={formData.secondLastName}
                onChange={handleChange}
                disabled={loading}
                className={`w-full px-4 py-2.5 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 ${errors.secondLastName ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              />
              {errors.secondLastName && <span className="text-red-500 text-xs font-medium">{errors.secondLastName}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="birthDate" className="text-sm font-semibold text-slate-700">Fecha de Nacimiento</label>
              <input
                type="date"
                id="birthDate"
                name="birthDate"
                value={formData.birthDate}
                onChange={handleChange}
                disabled={loading}
                className={`w-full px-4 py-2.5 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 ${errors.birthDate ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              />
              {errors.birthDate && <span className="text-red-500 text-xs font-medium">{errors.birthDate}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="sexAtBirth" className="text-sm font-semibold text-slate-700">Sexo asignado al nacer</label>
              <select
                id="sexAtBirth"
                name="sexAtBirth"
                value={formData.sexAtBirth}
                onChange={handleChange}
                disabled={loading}
                className={`w-full px-4 py-2.5 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 ${errors.sexAtBirth ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              >
                <option value="">Seleccionar...</option>
                <option value="FEMALE">Femenino</option>
                <option value="MALE">Masculino</option>
                <option value="INTERSEX">Intersexual</option>
                <option value="UNKNOWN">No especificado</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Datos de Contacto</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-sm font-semibold text-slate-700">Teléfono</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                disabled={loading}
                placeholder="Ej. 5512345678"
                className={`w-full px-4 py-2.5 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 ${errors.phone ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              />
              {errors.phone && <span className="text-red-500 text-xs font-medium">{errors.phone}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-slate-700">Correo Electrónico</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                placeholder="ejemplo@correo.com"
                className={`w-full px-4 py-2.5 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 ${errors.email ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
              />
              {errors.email && <span className="text-red-500 text-xs font-medium">{errors.email}</span>}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Información Adicional</h2>
          
          <div className="flex flex-col gap-1.5">
            <label htmlFor="administrativeNotes" className="text-sm font-semibold text-slate-700">Notas Administrativas</label>
            <p className="text-xs text-slate-500 mb-1">
              Útil para indicar preferencia de contacto, nombre del tutor, horario recomendado o indicaciones de recepción. La información clínica se registrará posteriormente en el expediente médico.
            </p>
            <textarea
              id="administrativeNotes"
              name="administrativeNotes"
              value={formData.administrativeNotes}
              onChange={handleChange}
              disabled={loading}
              rows={4}
              placeholder="Preferencia de contacto, nombre del tutor..."
              className={`w-full px-4 py-3 rounded-lg border bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all text-slate-900 resize-none ${errors.administrativeNotes ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-blue-500'}`}
            />
            {errors.administrativeNotes && <span className="text-red-500 text-xs font-medium">{errors.administrativeNotes}</span>}
          </div>
        </div>

        <div className="flex justify-end pt-2 pb-8">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <Save size={20} />
            )}
            {loading ? 'Guardando...' : 'Guardar Paciente'}
          </button>
        </div>
      </form>
    </div>
  );
}
