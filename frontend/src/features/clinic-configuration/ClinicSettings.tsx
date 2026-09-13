import { useState } from 'react';
import { useAuth } from '../../core/auth/AuthProvider';
import type { Membership } from '../../core/auth/AuthProvider';
import { apiClient } from '../../core/api/client';

export function ClinicSettings() {
  const { memberships, activeClinicId, activeRole, clinicalSpecialties } = useAuth();
  const active = memberships.find(m => m.clinicId === activeClinicId);
  const [specialty, setSpecialty] = useState(active?.clinicalSpecialty ?? 'DENTISTRY');
  const [clinicId, setClinicId] = useState(activeClinicId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = 'block w-full border border-slate-300 rounded-lg p-3 mt-2';
  const perform = async (operation: () => Promise<unknown>, destination: string) => {
    setBusy(true); setError('');
    try { await operation(); window.location.assign(destination); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); setBusy(false); }
  };
  return <div className="space-y-6 max-w-xl">
    <h1 className="text-2xl font-bold">Configuración de clínica</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <p>{active?.clinicName}</p>
    {memberships.length > 1 && <form className="bg-white p-6 rounded-xl space-y-4" onSubmit={e => { e.preventDefault(); void perform(() => apiClient.post('/auth/active-clinic', { clinicId }), '/dashboard'); }}>
      <label>Clínica activa<select className={field} value={clinicId} disabled={busy} onChange={e => setClinicId(e.target.value)}>{memberships.map(m => <option key={m.clinicId} value={m.clinicId}>{m.clinicName}</option>)}</select></label>
      <button disabled={busy || clinicId === activeClinicId} className="bg-blue-600 text-white rounded-lg p-3 disabled:opacity-50">Cambiar clínica</button>
    </form>}
    <form className="bg-white p-6 rounded-xl space-y-4" onSubmit={e => { e.preventDefault(); void perform(() => apiClient.patch('/clinic-configuration', { clinicalSpecialty: specialty, expectedSpecialty: active?.clinicalSpecialty }), '/settings'); }}>
      <label>Especialidad principal de la clínica<select className={field} disabled={busy || activeRole !== 'OWNER'} value={specialty} onChange={e => setSpecialty(e.target.value as Membership['clinicalSpecialty'])}>{clinicalSpecialties?.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}</select></label>
      <p className="text-sm text-slate-600">La especialidad determina las herramientas clínicas para todo el equipo. Los registros existentes se conservan.</p>
      {activeRole === 'OWNER' ? <button disabled={busy || specialty === active?.clinicalSpecialty} className="bg-blue-600 text-white rounded-lg p-3 disabled:opacity-50">Guardar especialidad</button> : <p className="text-sm">El propietario administra esta configuración.</p>}
    </form>
  </div>;
}
