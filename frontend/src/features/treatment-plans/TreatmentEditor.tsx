import { useClinicCapabilities } from '../../core/auth/AuthProvider';
import { useState } from 'react';
import { Modal } from '../../shared/components/Modal/Modal';
import { ProfessionalSelector } from '../appointments/components/ProfessionalSelector';
import { FDI_TOOTH_NAMES } from '../odontogram/types';
import type { ToothSurface } from '../odontogram/types';
import { treatmentApi } from './api';
import { treatmentLabels } from './types';
import type { Procedure, Treatment, TreatmentInput, TreatmentStatus } from './types';
import { fieldClass, buttonClass, secondaryButtonClass, surfaceLabels } from './presentation';
export function TreatmentEditor({ patientId, catalog, item, toothNumber, onClose, onSaved }: { patientId: string; catalog: Procedure[]; item?: Treatment; toothNumber?: number; onClose: () => void; onSaved: () => void }) {
  const capabilities = useClinicCapabilities();
  const [form, setForm] = useState<TreatmentInput>(() => item ? {
    procedureId: item.procedureId, name: item.name, description: item.description, price: item.price, toothNumber: item.toothNumber,
    surfaces: item.surfaces, status: item.status, plannedAt: item.plannedAt?.slice(0, 10) || null, completedAt: item.completedAt?.slice(0, 10) || null,
    notes: item.notes, professionalMembershipId: item.professionalMembershipId,
  } : { procedureId: null, name: '', description: null, price: '0', toothNumber: toothNumber ?? null, surfaces: [], status: 'PENDING', plannedAt: null, completedAt: null, notes: null, professionalMembershipId: null });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const change = <K extends keyof TreatmentInput>(key: K, value: TreatmentInput[K]) => setForm(f => ({ ...f, [key]: value }));
  return <Modal onClose={busy ? undefined : onClose} closeOnBackdrop={!busy} closeOnEscape={!busy}>
    <form className="bg-white rounded-2xl p-4 sm:p-6 min-w-0 break-words w-full max-w-2xl space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try { await treatmentApi.save(patientId, form, item); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); } finally { setBusy(false); }
    }}>
      <h2 className="text-xl font-bold text-slate-900">{item ? 'Editar tratamiento' : 'Nuevo tratamiento'}</h2>
      {error && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
      <p className="text-sm text-slate-600">Registra el procedimiento clínico que necesita el paciente.</p><fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">Procedimiento del catálogo<select className={fieldClass} value={form.procedureId || ''} onChange={e => {
          const p = catalog.find(p => p.id === e.target.value);
          setForm(f => ({ ...f, procedureId: p?.id || null, ...(p ? { name: p.name, description: p.description, price: p.defaultPrice } : {}) }));
        }}><option value="">Procedimiento personalizado</option>{catalog.filter(p => p.active || p.id === form.procedureId).map(p => <option key={p.id} value={p.id}>{p.name}{!p.active && ' (inactivo)'}</option>)}</select></label>
        <label className="block text-sm">Tratamiento<input required maxLength={200} className={fieldClass} value={form.name} onChange={e => change('name', e.target.value)} /></label>
        <label className="block text-sm">Descripción<textarea maxLength={2000} className={fieldClass} value={form.description || ''} onChange={e => change('description', e.target.value || null)} /></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm">Precio (MXN)<input required type="number" min="0" max="9999999999.99" step="0.01" className={fieldClass} value={form.price} onChange={e => change('price', e.target.value)} /></label>
          <label className="text-sm">Estado clínico<select className={fieldClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as TreatmentStatus, completedAt: e.target.value === 'COMPLETED' ? f.completedAt : null }))}>{Object.entries(treatmentLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {capabilities?.dentalClinicalTools && <label className="text-sm">Pieza dental<select className={fieldClass} value={form.toothNumber || ''} onChange={e => setForm(f => ({ ...f, toothNumber: Number(e.target.value) || null, surfaces: [] }))}><option value="">Sin pieza específica</option>{Object.entries(FDI_TOOTH_NAMES).map(([n, name]) => <option key={n} value={n}>{n} — {name}</option>)}</select></label>}
          <ProfessionalSelector value={form.professionalMembershipId || ''} onChange={id => change('professionalMembershipId', id || null)} />
          <label className="text-sm">Fecha planeada<input type="date" className={fieldClass} value={form.plannedAt || ''} onChange={e => change('plannedAt', e.target.value || null)} /></label>
          {form.status === 'COMPLETED' && <label className="text-sm">Fecha de realización<input type="date" className={fieldClass} value={form.completedAt || ''} onChange={e => change('completedAt', e.target.value || null)} /></label>}
        </div>
        {capabilities?.dentalClinicalTools && form.toothNumber && <fieldset><legend className="text-sm mb-2">Superficies (opcional)</legend><div className="flex flex-wrap gap-3">{Object.entries(surfaceLabels).filter(([s]) => s !== ((form.toothNumber! % 10 <= 3) ? 'OCCLUSAL' : 'INCISAL')).map(([s, label]) => <label key={s} className="text-sm flex gap-1"><input type="checkbox" checked={form.surfaces.includes(s as ToothSurface)} onChange={e => change('surfaces', e.target.checked ? s === 'WHOLE_TOOTH' ? ['WHOLE_TOOTH'] : [...form.surfaces.filter(v => v !== 'WHOLE_TOOTH'), s as ToothSurface] : form.surfaces.filter(v => v !== s))} />{label}</label>)}</div></fieldset>}
        <label className="block text-sm">Observaciones<textarea maxLength={2000} className={fieldClass} value={form.notes || ''} onChange={e => change('notes', e.target.value || null)} /></label>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className={secondaryButtonClass}>Cancelar</button><button disabled={busy} className={buttonClass}>{busy ? 'Guardando…' : 'Guardar tratamiento'}</button></div>
    </form>
  </Modal>;
}
