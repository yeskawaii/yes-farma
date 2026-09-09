import { paymentMethods, financialLabels } from './paymentPresentation';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../../shared/components/Modal/Modal';
import { treatmentApi } from './api';
import { formatMoney } from './types';
import type { Budget } from './types';
import { buttonClass, secondaryButtonClass, dangerButtonClass, fieldClass } from './presentation';
export interface Payment { id: string; amount: string; method: keyof typeof paymentMethods; paidAt: string; createdAt: string; reference: string | null; notes: string | null; status: 'ACTIVE' | 'CANCELLED'; cancellationReason: string | null; cancelledAt: string | null; createdBy: { user: { firstName: string; lastName: string } }; cancelledBy: { user: { firstName: string; lastName: string } } | null }
export function BudgetPayments({ patientId, budget, readOnly, onClose, onSaved }: { patientId: string; budget: Budget; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Budget & { payments: Payment[] }>();
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState<Payment['method']>('CASH');
  const [paidAt, setPaidAt] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; });
  const [reference, setReference] = useState(''); const [notes, setNotes] = useState('');
  const [cancelId, setCancelId] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = useCallback(async () => { const result = await treatmentApi.payments(patientId, budget.id); setData(result); setAmount(result.balance || '0'); }, [patientId, budget.id]);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  async function save(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action(); setSuccess(cancelId ? 'Pago cancelado' : 'Abono registrado'); setCancelId(''); setReason(''); setReference(''); setNotes(''); await load(); onSaved(); } catch(e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); } finally { setBusy(false); } }
  return <Modal aria-label="Cobranza del presupuesto" onClose={busy ? undefined : onClose} closeOnBackdrop={!busy} closeOnEscape={!busy}><section className="bg-white rounded-2xl p-4 sm:p-6 min-w-0 break-words w-full max-w-2xl space-y-4">
    <h2 className="text-xl font-bold">Cobranza del presupuesto · {(budget.folio || budget.id.slice(0,8))}</h2>
    {success && <p role="status" className="bg-emerald-50 text-emerald-800 rounded-lg p-3">{success}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && !error && <p>Cargando movimientos…</p>}
    {data && <><p>Total: {formatMoney(data.total)} · Pagado: {formatMoney(data.paid!)} · Saldo pendiente: {formatMoney(data.balance!)}</p><p>{financialLabels[data.financialStatus!]}</p>
      {!readOnly && data.status === 'ACCEPTED' && Number(data.balance) > 0 && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(() => treatmentApi.pay(patientId, budget.id, { amount, method, paidAt, reference: reference || null, notes: notes || null })); }}><h3 className="font-bold">Registrar abono</h3><fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label>Monto (MXN)<input className={fieldClass} required type="number" min="0.01" max={Math.min(Number(data.balance),9999999999.99)} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Método de pago<select className={fieldClass} value={method} onChange={e => setMethod(e.target.value as Payment['method'])}>{Object.entries(paymentMethods).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Fecha del pago<input className={fieldClass} required type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} /></label>
        <label>Referencia<input className={fieldClass} maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label>
        <label className="sm:col-span-2">Notas<textarea className={fieldClass} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </fieldset>{Number(amount) > Number(data.balance) && <p role="alert" className="text-red-700">El abono no puede superar el saldo pendiente de {formatMoney(data.balance!)}.</p>}<button className={buttonClass} disabled={busy || !/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > Number(data.balance)}>{busy ? 'Registrando…' : 'Registrar abono'}</button></form>}
      <details className="border-t border-slate-200 pt-3"><summary className="min-h-11 cursor-pointer font-semibold focus-visible:outline-2">Historial de pagos</summary>{!data.payments.length && <p>Sin movimientos registrados.</p>}
      {data.payments.map(p => <article key={p.id} className={`border rounded-xl p-3 space-y-2 ${p.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600' : ''}`}><p className="font-semibold">{p.paidAt.slice(0,10)} · {formatMoney(p.amount)} · {paymentMethods[p.method]} · {p.status === 'ACTIVE' ? 'Activo' : 'Cancelado'}</p><p>Registrado por {p.createdBy.user.firstName} {p.createdBy.user.lastName} · {new Date(p.createdAt).toLocaleString('es-MX')}</p>{p.reference && <p>Referencia: {p.reference}</p>}{p.notes && <p className="whitespace-pre-wrap">{p.notes}</p>}{p.status === 'CANCELLED' ? <p>Motivo: {p.cancellationReason} · {p.cancelledBy?.user.firstName} {p.cancelledBy?.user.lastName} · {p.cancelledAt && new Date(p.cancelledAt).toLocaleString('es-MX')}</p> : !readOnly && <button disabled={busy} className={dangerButtonClass} onClick={() => {setCancelId(p.id); setReason('');}}>Cancelar pago</button>}
      {cancelId === p.id && <form className="space-y-2" onSubmit={e => {e.preventDefault(); void save(() => treatmentApi.cancelPayment(patientId,budget.id,p.id,reason));}}><p>La cancelación conservará el movimiento y restaurará el saldo.</p><label>Motivo de cancelación<textarea required maxLength={500} className={fieldClass} value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || !reason.trim()} className={dangerButtonClass}>Confirmar cancelación</button><button type="button" disabled={busy} onClick={() => setCancelId('')} className={secondaryButtonClass}>Volver</button></form>}</article>)}
    </details></>}
    <button disabled={busy} className={secondaryButtonClass} onClick={onClose}>Cerrar</button>
  </section></Modal>;
}
