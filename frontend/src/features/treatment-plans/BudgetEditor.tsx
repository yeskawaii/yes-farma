import { useState } from 'react';
import { Modal } from '../../shared/components/Modal/Modal';
import { treatmentApi } from './api';
import type { Budget, Treatment } from './types';
import { formatMoney } from './types';
import { buttonClass, fieldClass, secondaryButtonClass } from './presentation';

export function BudgetSummary({ subtotal, discount }: { subtotal: number; discount: number }) {
  return <dl aria-live="polite" className="rounded-xl bg-blue-50 p-4 space-y-2">
    <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{formatMoney(subtotal / 100)}</dd></div>
    <div className="flex justify-between gap-4"><dt>Descuento</dt><dd>−{formatMoney(discount / 100)}</dd></div>
    <div className="flex justify-between gap-4 border-t border-blue-200 pt-3 text-xl font-bold text-blue-900"><dt>Total</dt><dd>{formatMoney((subtotal - discount) / 100)}</dd></div>
  </dl>;
}

export function BudgetEditor({ patientId, treatments, budget, onClose, onSaved }: { patientId: string; treatments: Treatment[]; budget?: Budget; onClose: () => void; onSaved: (budget: Budget) => void }) {
  const [saved, setSaved] = useState(budget);
  const [selected, setSelected] = useState<string[]>([]);
  const [discount, setDiscount] = useState(budget?.discount || '0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const subtotal = saved ? Math.round(Number(saved.subtotal) * 100) : treatments.filter(t => selected.includes(t.id)).reduce((sum, t) => sum + Math.round(Number(t.price) * 100), 0);
  const cents = Math.round(Number(discount) * 100);
  const valid = /^\d{1,10}(\.\d{1,2})?$/.test(discount) && cents <= subtotal;
  return <Modal onClose={busy ? undefined : onClose} closeOnEscape={!busy} closeOnBackdrop={!busy}>
    <form className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-2xl min-w-0 break-words space-y-5" onSubmit={async e => {
      e.preventDefault(); if (!valid || busy) return; setBusy(true); setError(''); setSuccess('');
      try {
        const result = saved ? await treatmentApi.updateDiscount(patientId, saved, discount) : await treatmentApi.budget(patientId, selected, discount);
        setSaved(result); setDiscount(result.discount); setSuccess(saved ? 'Presupuesto actualizado. Descuento actualizado.' : 'Presupuesto guardado.'); onSaved(result);
      } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el presupuesto. Intenta nuevamente.'); } finally { setBusy(false); }
    }}>
      <h2 className="text-xl font-bold">{saved ? 'Editar presupuesto' : 'Crear presupuesto'}</h2>
      <p className="text-sm text-slate-600">{saved ? 'Puedes corregir el descuento. Los procedimientos y precios corresponden al presupuesto guardado.' : 'Selecciona los procedimientos que vas a cotizar, revisa el descuento y guarda el presupuesto.'}</p>
      {success && <p role="status" className="rounded-lg bg-emerald-50 text-emerald-800 p-3">{success}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 text-red-700 p-3">{error}</p>}
      <fieldset disabled={busy} className="space-y-4">
        <legend className="font-semibold mb-2">1. Tratamientos {saved && `· ${saved.folio || saved.id.slice(0, 8)}`}</legend>
        {saved ? saved.items.map(i => <p key={i.id} className="flex justify-between gap-3"><span>{i.name}{i.toothNumber && ` · Pieza ${i.toothNumber}`}</span><span>{formatMoney(i.price)}</span></p>) : treatments.filter(t => t.status !== 'CANCELLED').map(t => <label key={t.id} className="flex items-center gap-3 border border-slate-200 rounded-lg p-3 min-h-11 cursor-pointer hover:bg-blue-50"><input type="checkbox" className="size-5 shrink-0 accent-blue-600" aria-label={`Incluir ${t.name} en presupuesto`} checked={selected.includes(t.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))} /><span className="flex-1">{t.name}{t.toothNumber && ` · Pieza ${t.toothNumber}`}</span><span>{formatMoney(t.price)}</span></label>)}
        {!saved && <p className="text-sm text-slate-600">{selected.length} tratamientos seleccionados (máximo 100).</p>}
        <label className="block font-semibold">2. Descuento · monto fijo ($ MXN)<input aria-describedby="discount-help" aria-invalid={!valid} required type="number" min="0" max={subtotal / 100} step="0.01" className={fieldClass} value={discount} onChange={e => { setDiscount(e.target.value); setSuccess(''); }} /></label>
        <p id="discount-help" className={`text-sm ${valid ? 'text-slate-600' : 'text-red-700'}`}>{valid ? 'Importe en pesos mexicanos. Puedes corregirlo antes o después de guardar, mientras el presupuesto sea borrador o presentado.' : `Introduce un monto entre $0.00 y ${formatMoney(subtotal / 100)}, con hasta dos decimales.`}</p>
        {Number(discount) > 0 && <button type="button" className={secondaryButtonClass} onClick={() => { setDiscount('0'); setSuccess(''); }}>Quitar descuento</button>}
      </fieldset>
      <h3 className="font-semibold">3. Revisar total</h3>
      {valid ? <BudgetSummary subtotal={subtotal} discount={cents} /> : <p role="status">Corrige el descuento para calcular el total.</p>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
        <button type="button" disabled={busy} className={secondaryButtonClass} onClick={onClose}>Cerrar</button>
        <button className={buttonClass} disabled={busy || !valid || (!saved && (!selected.length || selected.length > 100))}>{busy ? 'Guardando…' : saved ? 'Guardar cambios' : 'Guardar presupuesto'}</button>
      </div>
      {saved && <p className="text-sm text-slate-600">Para imprimir el presupuesto guardado, cierra este formulario y elige «Imprimir presupuesto».</p>}
    </form>
  </Modal>;
}
