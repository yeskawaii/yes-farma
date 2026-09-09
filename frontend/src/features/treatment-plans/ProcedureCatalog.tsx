import { useState } from 'react';
import { Modal } from '../../shared/components/Modal/Modal';
import { treatmentApi } from './api';
import type { Procedure } from './types';
import { formatMoney } from './types';
import { fieldClass, buttonClass, secondaryButtonClass } from './presentation';
export function ProcedureCatalog({ items, onClose, onSaved }: { items: Procedure[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [item, setItem] = useState<Procedure>();
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState('0'); const [active, setActive] = useState(true);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const edit = (p?: Procedure) => { setItem(p); setName(p?.name || ''); setDescription(p?.description || ''); setPrice(p?.defaultPrice || '0'); setActive(p?.active ?? true); };
  return <Modal onClose={busy ? undefined : onClose}><div className="bg-white w-full max-w-2xl rounded-2xl p-6 space-y-4">
    <h2 className="text-xl font-bold">Catálogo de procedimientos</h2>
    {success && <p role="status" className="text-emerald-800">{success}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="max-h-52 overflow-auto divide-y divide-slate-100">{items.map(p => <button disabled={busy} key={p.id} className={`${secondaryButtonClass} w-full text-left justify-between mb-2`} onClick={() => edit(p)}><span>Editar procedimiento: {p.name} {!p.active && '(Inactivo)'}</span><span>{formatMoney(p.defaultPrice)}</span></button>)}{!items.length && <p className="text-slate-500 text-sm">Agrega los procedimientos y precios de tu clínica.</p>}</div>
    <form className="space-y-3" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await treatmentApi.saveProcedure({ name, description: description || null, defaultPrice: price, active }, item); await onSaved(); edit(); setSuccess('Procedimiento guardado'); } catch (e) { setError(e instanceof Error ? e.message : 'Error al guardar'); } finally { setBusy(false); } }}>
      <h3 className="font-semibold">{item ? 'Editar procedimiento' : 'Agregar procedimiento'}</h3>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">Nombre<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} className={fieldClass} /></label>
        <label className="block text-sm">Descripción<textarea maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} className={fieldClass} /></label>
        <label className="block text-sm">Precio sugerido (MXN)<input required type="number" min="0" step="0.01" max="9999999999.99" value={price} onChange={e => setPrice(e.target.value)} className={fieldClass} /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Activo</label>
      </fieldset>
      <div className="flex flex-wrap gap-3"><button disabled={busy} className={buttonClass}>{busy ? 'Guardando…' : 'Guardar procedimiento'}</button>{item && <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => edit()}>Nuevo procedimiento</button>}<button type="button" disabled={busy} onClick={onClose} className={secondaryButtonClass}>Cerrar</button></div>
    </form>
  </div></Modal>;
}
