import { BudgetPayments } from './BudgetPayments';
import { BudgetEditor, BudgetSummary } from './BudgetEditor';
import { Plus, Printer } from 'lucide-react';
import { financialLabels } from './paymentPresentation';
import { budgetPrintHtml } from './budgetPrint';
import type { Budget } from './types';
import { useCallback, useEffect, useState } from 'react';
import { treatmentApi } from './api';
import type { BudgetStatus, Procedure, Treatment, TreatmentPlan } from './types';
import { budgetLabels, formatMoney, treatmentLabels } from './types';
import { TreatmentEditor } from './TreatmentEditor';
import { buttonClass, secondaryButtonClass, dangerButtonClass, surfaceLabels } from './presentation';
import { ProcedureCatalog } from './ProcedureCatalog';

export function TreatmentPlanSection({ patientId, readOnly = false, initialTooth, onTooth }: { patientId: string; readOnly?: boolean; initialTooth?: number; onTooth?: (tooth: number) => void }) {
  const [paymentBudget, setPaymentBudget] = useState<Budget>();
  async function printBudget(b: Budget) {
    const tab = window.open('', '_blank');
    if (!tab) { setError('Permite abrir ventanas para imprimir el presupuesto.'); return; }
    tab.opener = null; tab.document.body.textContent = 'Cargando presupuesto…';
    setPrinting(true);
    try { const document = await treatmentApi.print(patientId, b.id); tab.document.open(); tab.document.write(budgetPrintHtml(document)); tab.document.close(); }
    catch(e) { tab.close(); setError(e instanceof Error ? e.message : 'No se pudo cargar el documento'); } finally { setPrinting(false); }
  }
  const [data, setData] = useState<TreatmentPlan>(); const [catalog, setCatalog] = useState<Procedure[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{ item?: Treatment } | null>(initialTooth ? {} : null); const [showCatalog, setShowCatalog] = useState(false);
  const [section, setSection] = useState<'plan' | 'budgets'>('plan');
  const [budgetEditor, setBudgetEditor] = useState<{ budget?: Budget }>();
  const [success, setSuccess] = useState('');
  const [printing, setPrinting] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try { const [plan, procedures] = await Promise.all([treatmentApi.list(patientId), treatmentApi.catalog()]); setData(plan); setCatalog(procedures);  }
    catch (e) { setError(e instanceof Error ? e.message : 'Error al cargar el plan'); } finally { setLoading(false); }
  }, [patientId]);
  useEffect(() => { void load(); }, [load]);
  async function perform(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); setSuccess('Estado del presupuesto actualizado'); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); } finally { setBusy(false); } }
  if (loading) return <p className="p-6 text-slate-500">Cargando plan de tratamiento…</p>;
  return <div className="space-y-6 min-w-0 break-words">
    {error && <div role="alert" className="bg-red-50 text-red-700 rounded-xl p-4">{error} <button onClick={() => void load()} className={secondaryButtonClass}>Reintentar</button></div>}
    {success && <p role="status" className="bg-emerald-50 text-emerald-800 rounded-xl p-4">{success}</p>}
    {readOnly && <p className="text-slate-600">Paciente inactivo: consulta e impresión disponibles. La edición y el registro de abonos están bloqueados.</p>}
    <nav aria-label="Plan y presupuestos" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button aria-current={section === 'plan' ? 'page' : undefined} className={section === 'plan' ? buttonClass : secondaryButtonClass} onClick={() => setSection('plan')}>1. Plan de tratamiento</button>
      <button aria-current={section === 'budgets' ? 'page' : undefined} className={section === 'budgets' ? buttonClass : secondaryButtonClass} onClick={() => setSection('budgets')}>2. Presupuestos</button>
    </nav>
    {data && <>
    {section === 'plan' && <>
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold text-slate-900">Plan de tratamiento</h2><div className="flex flex-wrap gap-3">{!readOnly && <><button className={secondaryButtonClass} onClick={() => setShowCatalog(true)}>Catálogo de procedimientos</button><button className={buttonClass} onClick={() => setEditor({})}><Plus size={18} aria-hidden="true" />Agregar tratamiento</button></>}</div></div>
      <p className="text-slate-600">¿Qué procedimientos necesita este paciente?</p>
      <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer min-h-11 font-semibold focus-visible:outline-2">Ver resumen del plan (MXN)</summary><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{([['planned', 'Total planeado'], ['accepted', 'Total aceptado'], ['completed', 'Total realizado'], ['pending', 'Total pendiente']] as const).map(([key, label]) => <div key={key} className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-bold text-blue-700">{formatMoney(data.totals[key])}</p></div>)}</div>
      <p className="text-xs text-slate-500">Planeado excluye cancelados. Aceptado incluye en proceso y realizados. Pendiente incluye todo lo no realizado ni cancelado. Importes en MXN.</p></details>
      <div className="space-y-3">{!data.treatments.length && <p className="bg-white border border-slate-200 rounded-xl p-6 text-slate-500">Aún no hay tratamientos registrados.</p>}{data.treatments.map(t => <article key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold text-slate-900">{t.name}</h3><span className={`text-xs px-2 py-1 rounded-full ${t.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : t.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'}`}>{treatmentLabels[t.status]}</span><span className="ml-auto font-bold">{formatMoney(t.price)}</span>{!readOnly && <button className={secondaryButtonClass} onClick={() => setEditor({ item: t })}>Editar tratamiento</button>}</div>
        {t.toothNumber && <button className={secondaryButtonClass} disabled={!onTooth} onClick={() => onTooth?.(t.toothNumber!)}>Pieza FDI {t.toothNumber}{t.surfaces.length > 0 && ` · ${t.surfaces.map(s => surfaceLabels[s]).join(', ')}`}</button>}
        {t.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{t.description}</p>}{t.notes && <p className="text-sm text-slate-500 whitespace-pre-wrap">Observaciones: {t.notes}</p>}
        <p className="text-xs text-slate-500">Creado: {new Date(t.createdAt).toLocaleDateString('es-MX')}{t.plannedAt && ` · Planeado: ${t.plannedAt.slice(0, 10)}`}{t.completedAt && ` · Realizado: ${t.completedAt.slice(0, 10)}`}{t.professional && ` · Responsable: ${t.professional.user.firstName} ${t.professional.user.lastName}`}</p>
      </article>)}</div>
      </>}
      {section === 'budgets' && <>
      <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Presupuestos</h2><p className="text-slate-600">¿Cuáles de esos procedimientos vamos a cotizar?</p></div>{!readOnly && <button className={buttonClass} disabled={!data.treatments.some(t => t.status !== 'CANCELLED')} onClick={() => setBudgetEditor({})}><Plus size={18} aria-hidden="true" />Crear presupuesto</button>}</header>
      {!data.treatments.some(t => t.status !== 'CANCELLED') && <p>Agrega un tratamiento vigente en el plan para crear un presupuesto.</p>}
      <section className="space-y-3">{!data.budgets.length && <p className="text-sm text-slate-500">Sin presupuestos registrados.</p>}{data.budgets.map(b => <details key={b.id} className="bg-white border border-slate-200 rounded-xl p-4"><summary className="cursor-pointer font-semibold min-h-11 rounded-lg p-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">Ver presupuesto · {new Date(b.createdAt).toLocaleDateString('es-MX')} · <span className={`inline-block rounded-full px-3 py-1 text-sm ${b.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-800' : b.status === 'REJECTED' ? 'bg-red-50 text-red-800' : b.status === 'PRESENTED' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{budgetLabels[b.status]}</span> · {formatMoney(b.total)} · {(b.folio || b.id.slice(0, 8))}</summary><div className="mt-4 space-y-3">{b.items.map(i => <div key={i.id} className="border-b border-slate-100 pb-2"><div className="flex justify-between gap-3"><span>{i.name}{i.toothNumber && ` · Pieza ${i.toothNumber}`}</span><span>{formatMoney(i.price)}</span></div>{i.description && <p className="text-sm text-slate-500 whitespace-pre-wrap">{i.description}</p>}{i.surfaces.length > 0 && <p className="text-xs text-slate-500">{i.surfaces.map(s => surfaceLabels[s]).join(', ')}</p>}</div>)}<BudgetSummary subtotal={Math.round(Number(b.subtotal) * 100)} discount={Math.round(Number(b.discount) * 100)} />
        <div className="flex flex-wrap gap-3"><button className={secondaryButtonClass} disabled={readOnly || !['DRAFT', 'PRESENTED'].includes(b.status)} onClick={() => setBudgetEditor({ budget: b })}>Editar presupuesto</button><button disabled={printing || busy} className={secondaryButtonClass} onClick={() => void printBudget(b)}><Printer size={18} aria-hidden="true" />{printing ? 'Cargando documento…' : 'Imprimir presupuesto'}</button></div>
        {['ACCEPTED', 'REJECTED'].includes(b.status) ? <p className="text-sm text-slate-600">Este presupuesto ya fue {b.status === 'ACCEPTED' ? 'aceptado' : 'rechazado'} y no puede editarse.</p> : <p className="text-sm text-slate-600">Puedes corregir el descuento con «Editar presupuesto».</p>}
        <section className="border border-teal-200 bg-teal-50 rounded-xl p-4 space-y-3"><h4 className="font-bold">3. Cobranza</h4><p className="text-sm">¿Cuánto se ha pagado de este presupuesto?</p><dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[['Total', b.total], ['Pagado', b.paid], ['Saldo pendiente', b.balance]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="text-lg font-bold">{value === undefined ? 'Por consultar' : formatMoney(value)}</dd></div>)}</dl>{b.financialStatus && <p>{financialLabels[b.financialStatus]}</p>}<button className={b.status === 'ACCEPTED' && Number(b.balance) > 0 && !readOnly ? buttonClass : secondaryButtonClass} onClick={() => setPaymentBudget(b)}>{!readOnly && b.status === 'ACCEPTED' && Number(b.balance) > 0 ? 'Registrar abono' : 'Ver historial de pagos'}</button>{b.status !== 'ACCEPTED' && <p className="text-sm">Solo los presupuestos aceptados pueden recibir abonos.</p>}</section>
        {!readOnly && <div className="flex flex-wrap gap-3">{(b.status === 'DRAFT' ? ['PRESENTED'] : b.status === 'PRESENTED' ? ['ACCEPTED', 'REJECTED'] : []).map(status => <button key={status} disabled={busy} className={status === 'REJECTED' ? dangerButtonClass : secondaryButtonClass} onClick={() => void perform(() => treatmentApi.budgetStatus(patientId, b, status as BudgetStatus))}>{status === 'PRESENTED' ? 'Marcar como presentado' : status === 'ACCEPTED' ? 'Aceptar presupuesto' : 'Rechazar presupuesto'}</button>)}</div>}</div></details>)}</section></>}
    </>}
    {budgetEditor && data && <BudgetEditor patientId={patientId} treatments={data.treatments} budget={budgetEditor.budget} onClose={() => { setBudgetEditor(undefined); void load(); }} onSaved={() => { setSuccess("Presupuesto guardado"); void load(); }} />}
    {paymentBudget && <BudgetPayments patientId={patientId} budget={paymentBudget} readOnly={readOnly} onClose={() => setPaymentBudget(undefined)} onSaved={() => void load()} />}
    {editor && data && !readOnly && <TreatmentEditor patientId={patientId} catalog={catalog} item={editor.item} toothNumber={initialTooth} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setSuccess('Tratamiento guardado'); void load(); }} />}
    {showCatalog && <ProcedureCatalog items={catalog} onClose={() => setShowCatalog(false)} onSaved={load} />}
  </div>;
}
