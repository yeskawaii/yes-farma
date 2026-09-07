import { useCallback, useEffect, useState } from 'react';
import { treatmentApi } from './api';
import type { BudgetStatus, Procedure, Treatment, TreatmentPlan } from './types';
import { budgetLabels, formatMoney, treatmentLabels } from './types';
import { TreatmentEditor } from './TreatmentEditor';
import { buttonClass, fieldClass, surfaceLabels } from './presentation';
import { ProcedureCatalog } from './ProcedureCatalog';

export function TreatmentPlanSection({ patientId, readOnly = false, initialTooth, onTooth }: { patientId: string; readOnly?: boolean; initialTooth?: number; onTooth?: (tooth: number) => void }) {
  const [data, setData] = useState<TreatmentPlan>(); const [catalog, setCatalog] = useState<Procedure[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ item?: Treatment } | null>(initialTooth ? {} : null); const [showCatalog, setShowCatalog] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); const [discount, setDiscount] = useState('0');
  const load = useCallback(async () => {
    setError('');
    try { const [plan, procedures] = await Promise.all([treatmentApi.list(patientId), treatmentApi.catalog()]); setData(plan); setCatalog(procedures); setSelected(ids => ids.filter(id => plan.treatments.some(t => t.id === id && t.status !== 'CANCELLED'))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar el plan'); } finally { setLoading(false); }
  }, [patientId]);
  useEffect(() => { void load(); }, [load]);
  async function perform(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); } finally { setBusy(false); } }
  const subtotalCents = data?.treatments.filter(t => selected.includes(t.id)).reduce((sum, t) => sum + Math.round(Number(t.price) * 100), 0) || 0;
  const discountCents = Math.round(Number(discount) * 100);
  if (loading) return <p className="p-6 text-slate-500">Cargando plan de tratamiento…</p>;
  return <div className="space-y-6">
    {error && <div role="alert" className="bg-red-50 text-red-700 rounded-xl p-4">{error} <button onClick={() => void load()} className="underline">Reintentar</button></div>}
    {data && <>
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">Plan de tratamiento</h2><div className="flex gap-3">{!readOnly && <><button className="text-blue-700 text-sm font-semibold" onClick={() => setShowCatalog(true)}>Catálogo de procedimientos</button><button className={buttonClass} onClick={() => setEditor({})}>Agregar tratamiento</button></>}</div></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{([['planned', 'Total planeado'], ['accepted', 'Total aceptado'], ['completed', 'Total realizado'], ['pending', 'Total pendiente']] as const).map(([key, label]) => <div key={key} className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-bold text-blue-700">{formatMoney(data.totals[key])}</p></div>)}</div>
      <p className="text-xs text-slate-500">Planeado excluye cancelados. Aceptado incluye en proceso y realizados. Pendiente incluye todo lo no realizado ni cancelado. Importes en MXN.</p>
      <div className="space-y-3">{!data.treatments.length && <p className="bg-white border border-slate-200 rounded-xl p-6 text-slate-500">Aún no hay tratamientos registrados.</p>}{data.treatments.map(t => <article key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3">{!readOnly && t.status !== 'CANCELLED' && <input aria-label={`Incluir ${t.name} en presupuesto`} type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))} />}<h3 className="font-semibold text-slate-900">{t.name}</h3><span className={`text-xs px-2 py-1 rounded-full ${t.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : t.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'}`}>{treatmentLabels[t.status]}</span><span className="ml-auto font-bold">{formatMoney(t.price)}</span>{!readOnly && <button className="text-blue-600 text-sm" onClick={() => setEditor({ item: t })}>Editar / cambiar estado</button>}</div>
        {t.toothNumber && <button className="text-sm text-blue-700" disabled={!onTooth} onClick={() => onTooth?.(t.toothNumber!)}>Pieza FDI {t.toothNumber}{t.surfaces.length > 0 && ` · ${t.surfaces.map(s => surfaceLabels[s]).join(', ')}`}</button>}
        {t.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{t.description}</p>}{t.notes && <p className="text-sm text-slate-500 whitespace-pre-wrap">Observaciones: {t.notes}</p>}
        <p className="text-xs text-slate-500">Creado: {new Date(t.createdAt).toLocaleDateString('es-MX')}{t.plannedAt && ` · Planeado: ${t.plannedAt.slice(0, 10)}`}{t.completedAt && ` · Realizado: ${t.completedAt.slice(0, 10)}`}{t.professional && ` · Responsable: ${t.professional.user.firstName} ${t.professional.user.lastName}`}</p>
      </article>)}</div>
      {!readOnly && <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"><h3 className="font-bold text-lg">Nuevo presupuesto</h3><p className="text-sm text-slate-500">Selecciona tratamientos de la lista para incluirlos.</p><p>{selected.length} seleccionados · Subtotal: {formatMoney(subtotalCents / 100)}</p><label className="block text-sm max-w-xs">Descuento (importe MXN)<input type="number" min="0" max={subtotalCents / 100} step="0.01" className={fieldClass} value={discount} onChange={e => setDiscount(e.target.value)} /></label><p className="font-bold">Total: {formatMoney((subtotalCents - discountCents) / 100)}</p><button className={buttonClass} disabled={busy || !selected.length || !discount || !Number.isFinite(discountCents) || discountCents < 0 || discountCents > subtotalCents} onClick={() => void perform(async () => { await treatmentApi.budget(patientId, selected, discount); setSelected([]); setDiscount('0'); })}>Guardar presupuesto</button></section>}
      <section className="space-y-3"><h3 className="text-lg font-bold">Presupuestos</h3>{!data.budgets.length && <p className="text-sm text-slate-500">Sin presupuestos registrados.</p>}{data.budgets.map(b => <details key={b.id} className="bg-white border border-slate-200 rounded-xl p-4"><summary className="cursor-pointer font-semibold">{new Date(b.createdAt).toLocaleDateString('es-MX')} · {budgetLabels[b.status]} · {formatMoney(b.total)} · {b.id.slice(0, 8)}</summary><div className="mt-4 space-y-3">{b.items.map(i => <div key={i.id} className="border-b border-slate-100 pb-2"><div className="flex justify-between gap-3"><span>{i.name}{i.toothNumber && ` · Pieza ${i.toothNumber}`}</span><span>{formatMoney(i.price)}</span></div>{i.description && <p className="text-sm text-slate-500 whitespace-pre-wrap">{i.description}</p>}{i.surfaces.length > 0 && <p className="text-xs text-slate-500">{i.surfaces.map(s => surfaceLabels[s]).join(', ')}</p>}</div>)}<p>Subtotal: {formatMoney(b.subtotal)} · Descuento: {formatMoney(b.discount)}</p><p className="font-bold">Total: {formatMoney(b.total)}</p>{!readOnly && <div className="flex gap-3">{(b.status === 'DRAFT' ? ['PRESENTED'] : b.status === 'PRESENTED' ? ['ACCEPTED', 'REJECTED'] : []).map(status => <button key={status} disabled={busy} className={buttonClass} onClick={() => void perform(() => treatmentApi.budgetStatus(patientId, b, status as BudgetStatus))}>{budgetLabels[status as BudgetStatus]}</button>)}</div>}</div></details>)}</section>
    </>}
    {editor && data && !readOnly && <TreatmentEditor patientId={patientId} catalog={catalog} item={editor.item} toothNumber={initialTooth} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load(); }} />}
    {showCatalog && <ProcedureCatalog items={catalog} onClose={() => setShowCatalog(false)} onSaved={load} />}
  </div>;
}
