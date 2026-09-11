import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../core/auth/AuthProvider';
import { Modal } from '../../shared/components/Modal/Modal';
import { prescriptionsApi as api } from './api';
import { directions, emptyItem, itemLabels, labels } from './types';
import type { Prescription, PrescriptionItem, PrescriberProfile, ProfessionalFields } from './types';
import { prescriptionPrintHtml } from './prescriptionPrint';
const button = 'px-4 py-2 min-h-11 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50';
const primary = 'px-4 py-2 min-h-11 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50';
const input = 'w-full border border-slate-300 rounded-lg p-2 min-h-11 bg-white';
const profileLabels: Record<keyof ProfessionalFields, string> = { professionalLicense: 'Cédula profesional', specialtyCode: 'Especialidad (opcional)', specialtyLicense: 'Cédula de especialidad (opcional)', professionalAddress: 'Domicilio profesional / consultorio', professionalPhone: 'Teléfono profesional (opcional)' };
export function PrescriptionSection({ patientId, patientName, encounterId, readOnly = false }: { patientId: string; patientName?: string; encounterId?: string; readOnly?: boolean }) {
  const { memberships, activeClinicId, activeRole } = useAuth();
  const membershipId = memberships.find(m => m.clinicId === activeClinicId)?.id;
  const [rows, setRows] = useState<Prescription[]>([]);
  const [profile, setProfile] = useState<PrescriberProfile>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ record?: Prescription }>();
  const [detail, setDetail] = useState<Prescription>();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfessionalFields>({ professionalLicense: '', specialtyCode: '', specialtyLicense: '', professionalAddress: '', professionalPhone: '' });
  const [items, setItems] = useState<PrescriptionItem[]>([emptyItem()]);
  const [general, setGeneral] = useState('');
  const [reason, setReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [modalError, setModalError] = useState('');
  const allowed = activeRole === 'OWNER' || activeRole === 'PROFESSIONAL';
  const load = useCallback(async () => {
    try { const [r, p] = await Promise.all([api.list(patientId), api.profile()]); setRows(r); setProfile(p); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar las recetas.'); }
    finally { setLoading(false); }
  }, [patientId]);
  useEffect(() => { if (allowed) void load(); }, [load, allowed]);
  async function perform(fn: () => Promise<void>) { setBusy(true); setModalError(''); setError(''); try { await fn(); } catch (e) { const message = e instanceof Error ? e.message : 'No se pudo completar la operación.'; setModalError(message); setError(message); } finally { setBusy(false); } }
  function edit(record?: Prescription) {
    setModalError(''); setDetail(undefined); setItems(record ? record.items.map(i => Object.fromEntries(Object.keys(itemLabels).map(k => [k, i[k as keyof PrescriptionItem]])) as unknown as PrescriptionItem) : [emptyItem()]); setGeneral(record?.generalInstructions || ''); setEditor({ record });
  }
  async function print(record: Prescription) {
    const win = window.open('', '_blank');
    if (!win) { setModalError('Permite las ventanas emergentes para imprimir.'); return; }
    win.opener = null;
    await perform(async () => { try { const fresh = await api.get(patientId, record.id); const html = prescriptionPrintHtml(fresh); win.document.open(); win.document.write(html); win.document.close(); } catch (e) { win.close(); throw e; } });
  }
  if (!allowed) return null;
  return <section className="space-y-4 min-w-0">
    <header className="flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-xl font-bold">Recetas</h2><p className="text-slate-600">Receta clínica ordinaria para impresión y firma física.</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !profile} onClick={() => { setModalError(''); setProfileForm(Object.fromEntries(Object.keys(profileLabels).map(k => [k, profile?.profile?.[k as keyof ProfessionalFields] || ''])) as unknown as ProfessionalFields); setProfileOpen(true); }}>Mis datos profesionales</button><button className={primary} disabled={readOnly || busy || loading || !!error} onClick={() => edit()}>Nueva receta</button></div></header>
    {error && <p role="alert" className="bg-red-50 text-red-800 p-3 rounded-lg">{error} <button className={button} onClick={() => void load()}>Recargar</button></p>}
    {loading ? <p>Cargando recetas…</p> : rows.length === 0 ? <p className="p-6 bg-white border rounded-xl text-slate-500">Este paciente todavía no tiene recetas.</p> : rows.filter(r => !encounterId || r.encounterId === encounterId).map(r => <article key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 break-words"><div className="flex flex-wrap gap-3 justify-between"><strong>{r.folio || 'Borrador sin folio'}</strong><span className={r.status === 'CANCELLED' ? 'font-bold text-red-700' : 'text-blue-700'}>{labels[r.status]}</span></div><p>{new Date(r.issuedAt || r.createdAt).toLocaleDateString('es-MX', { timeZone: r.snapshot?.clinic.timeZone || 'America/Mexico_City' })} · {r.snapshot?.professional.name || `${r.prescriber.user.firstName} ${r.prescriber.user.lastName}`}</p><p className="text-slate-600">{r.items.map(i => i.medication || 'Medicamento pendiente').join(' · ')}</p><button className={button} disabled={busy} onClick={() => void perform(async () => { setDetail(await api.get(patientId, r.id)); setCancelOpen(false); })}>Ver receta</button></article>)}
    {editor && <Modal aria-label="Editar receta" onClose={() => !busy && setEditor(undefined)} closeOnBackdrop={false} closeOnEscape={!busy}><form className="bg-white rounded-2xl w-full max-w-4xl p-6 space-y-5" onSubmit={e => { e.preventDefault(); void perform(async () => { const saved = await api.save(patientId, { items, generalInstructions: general, encounterId: editor.record?.encounterId ?? encounterId ?? null, ...(editor.record ? { expectedVersion: editor.record.version } : {}) }, editor.record?.id); setEditor(undefined); setDetail(saved); await load(); }); }}>
      <h2 className="text-xl font-bold">{editor.record ? 'Editar borrador' : 'Nueva receta'}</h2><p>Paciente: <strong>{patientName || 'Paciente de esta consulta'}</strong><br/>Profesional: <strong>{profile?.name}</strong> · {profile?.clinic}<br/>Cédula: {profile?.profile?.professionalLicense || 'Pendiente de completar'}</p>
      <p className="text-sm text-slate-600">El profesional selecciona y confirma todos los medicamentos. Este flujo no admite recetarios especiales oficiales.</p>
      {items.map((item, index) => <fieldset key={index} className="border rounded-xl p-4 space-y-3"><legend className="font-semibold">Medicamento {index + 1}</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{Object.entries(itemLabels).map(([key, label]) => <label key={key} className="text-sm space-y-1"><span>{label}</span><input className={input} maxLength={key === 'instructions' ? 1000 : ['concentration', 'form', 'route', 'quantity'].includes(key) ? 100 : 200} value={item[key as keyof PrescriptionItem]} onChange={e => setItems(prev => prev.map((v, n) => n === index ? { ...v, [key]: e.target.value } : v))}/></label>)}</div><p className="bg-slate-50 rounded p-3 text-sm">Modo de uso: {directions(item)}</p><button type="button" className={button} onClick={() => setItems(items.filter((_, n) => n !== index))}>Eliminar medicamento</button></fieldset>)}
      <button type="button" className={button} disabled={items.length >= 30} onClick={() => setItems([...items, emptyItem()])}>Agregar medicamento</button><label className="block space-y-1">Indicaciones generales<textarea className={input} rows={4} maxLength={4000} value={general} onChange={e => setGeneral(e.target.value)}/></label>
      {modalError && <p role="alert" className="text-red-700">{modalError}</p>}<div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => setEditor(undefined)}>Cerrar</button><button className={primary} disabled={busy}>Guardar borrador y revisar</button></div>
    </form></Modal>}
    {detail && <Modal aria-label="Detalle de receta" onClose={() => !busy && setDetail(undefined)} closeOnBackdrop={false} closeOnEscape={!busy}><div className="bg-white rounded-2xl w-full max-w-3xl p-6 space-y-4 break-words">
      <h2 className="text-xl font-bold">{detail.folio || 'Revisión de borrador'}</h2><p className={detail.status === 'CANCELLED' ? 'text-red-700 text-xl font-bold border-2 border-red-700 p-3' : 'font-semibold'}>{detail.status === 'CANCELLED' ? 'RECETA ANULADA' : labels[detail.status]}</p>
      <p>Paciente: {detail.snapshot?.patient.name || patientName || 'Paciente de esta consulta'}<br/>Profesional: {detail.snapshot?.professional.name || `${detail.prescriber.user.firstName} ${detail.prescriber.user.lastName}`}</p>
      {detail.snapshot && <p>Cédula: {detail.snapshot.professional.license}<br/>Fecha de emisión: {new Date(detail.snapshot.issuedAt).toLocaleDateString('es-MX', { timeZone: detail.snapshot.clinic.timeZone })}</p>}
      {(detail.snapshot?.items || detail.items).map((i, n) => <div key={n} className="border-b pb-3"><strong>Rp. {i.medication} {i.concentration} {i.brand && `(${i.brand})`}</strong><p>{i.form}</p><p>{directions(i)}</p><p>Cantidad: {i.quantity}</p><p className="whitespace-pre-wrap">{i.instructions}</p></div>)}<p className="whitespace-pre-wrap">{detail.snapshot?.generalInstructions ?? detail.generalInstructions}</p>
      {detail.status === 'DRAFT' && <p className="bg-amber-50 p-3">Revisa cada medicamento antes de emitir. La emisión asigna el folio y bloquea la edición. Para corregir después, deberás anular y crear otra receta.</p>}
      {detail.status === 'CANCELLED' && <p>Motivo de anulación: {detail.cancellationReason}</p>}
      {cancelOpen && <label className="block">Motivo de anulación<textarea className={input} minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}/></label>}
      {modalError && <p role="alert" className="text-red-700">{modalError}</p>}
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => setDetail(undefined)}>Cerrar</button>
      {detail.status === 'DRAFT' && detail.prescriberMembershipId === membershipId && !readOnly && <><button className={button} disabled={busy} onClick={() => edit(detail)}>Editar borrador</button><button className={primary} disabled={busy} onClick={() => void perform(async () => { setDetail(await api.issue(patientId, detail)); await load(); })}>Confirmar y emitir receta</button></>}
      {detail.status !== 'DRAFT' && <button className={button} disabled={busy} onClick={() => void print(detail)}>Vista de impresión / PDF</button>}
      {detail.status === 'ISSUED' && detail.prescriberMembershipId === membershipId && (!cancelOpen ? <button className={button} disabled={busy} onClick={() => { setReason(''); setCancelOpen(true); }}>Anular receta</button> : <button className={button} disabled={busy || reason.trim().length < 3} onClick={() => void perform(async () => { setDetail(await api.cancel(patientId, detail, reason)); setCancelOpen(false); await load(); })}>Confirmar anulación</button>)}
      </div></div></Modal>}
    {profileOpen && <Modal aria-label="Mis datos profesionales" onClose={() => !busy && setProfileOpen(false)} closeOnBackdrop={false} closeOnEscape={!busy}><form className="bg-white rounded-2xl w-full max-w-xl p-6 space-y-4" onSubmit={e => { e.preventDefault(); void perform(async () => { await api.saveProfile(profileForm); await load(); setProfileOpen(false); }); }}><h2 className="text-xl font-bold">Mis datos profesionales</h2><p>{profile?.name} · {profile?.clinic}</p><p className="text-sm text-slate-600">Se guardan en tu perfil profesional de esta clínica. Las recetas emitidas conservan sus datos originales.</p>{Object.entries(profileLabels).map(([key, label]) => <label key={key} className="block">{label}<input className={input} required={key === 'professionalLicense' || key === 'professionalAddress'} maxLength={key === 'professionalAddress' ? 500 : key === 'professionalPhone' ? 50 : 100} value={profileForm[key as keyof ProfessionalFields]} onChange={e => setProfileForm({ ...profileForm, [key]: e.target.value })}/></label>)}{modalError && <p role="alert" className="text-red-700">{modalError}</p>}<div className="flex gap-3"><button type="button" className={button} disabled={busy} onClick={() => setProfileOpen(false)}>Cerrar</button><button className={primary} disabled={busy}>Guardar datos profesionales</button></div></form></Modal>}
  </section>;
}
