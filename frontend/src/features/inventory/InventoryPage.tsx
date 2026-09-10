import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Package, AlertTriangle, ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';
import { inventoryApi } from './api';
import { ProductForm, SupplierForm, MovementForm } from './InventoryForms';
import { buttonClass, secondaryButtonClass, fieldClass, labels, dateLabel, costLabel } from './presentation';
import type { InventoryData, Detail, Product, Supplier, Movement, MovementType } from './types';

type Editor = { kind: 'product'; product?: Product } | { kind: 'supplier'; supplier?: Supplier } | { kind: 'movement'; type: MovementType };
const panel = 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';
function Badges({ product }: { product: Product }) {
  const badge = 'inline-flex rounded-md px-2 py-1 text-xs font-semibold';
  return <div className="flex flex-wrap items-start self-start gap-1.5">
    {!product.active && <span className={`${badge} bg-slate-100 text-slate-600`}>Inactivo</span>}
    <span className={`${badge} ${product.stockStatus === 'NORMAL' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{product.stockStatus === 'EMPTY' ? 'Agotado' : product.stockStatus === 'LOW' ? 'Bajo stock' : 'Stock normal'}</span>
    {product.expiring && <span className={`${badge} bg-amber-50 text-amber-900`}>Próximo a caducar</span>}
    {product.expired && <span className={`${badge} bg-red-50 text-red-800`}>Caducado</span>}
  </div>;
}
function Movements({ movements, timeZone, limit = 20 }: { movements: Movement[]; timeZone: string; limit?: number }) {
  return <section className={panel}><h2 className="font-bold text-lg mb-3">Movimientos recientes</h2>{!movements.length ? <p className="text-slate-500">Aún no hay movimientos registrados.</p> : <ul className="divide-y divide-slate-100">{movements.map(m => <li key={m.id} className="py-3 space-y-1 break-words">
    <div className="flex flex-wrap justify-between gap-2"><Link className="font-semibold text-blue-700 underline underline-offset-2" to={`/inventory/products/${m.productId}`}>{m.lot.product.name}</Link><span className="font-semibold">{labels[m.type]} · {['ENTRY', 'ADJUSTMENT_IN'].includes(m.type) ? '+' : '−'}{m.quantity} {m.lot.product.unit}</span></div>
    <p className="text-sm text-slate-600">Lote: {m.lot.number || `Sin número · ${m.lotId.slice(0, 8)}`} · Fecha efectiva: {dateLabel(m.effectiveDate)}</p>
    <p className="text-sm text-slate-600">Registró: {m.createdBy.user.firstName} {m.createdBy.user.lastName} · {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(m.createdAt))}</p>
    <p className="text-sm">{m.reason}{m.note ? ` — ${m.note}` : ''}</p>
  </li>)}</ul>}<p className="mt-3 text-xs text-slate-500">Se muestran hasta {limit} registros recientes. El historial se conserva.</p></section>;
}
export function InventoryPage() {
  const { activeClinicId } = useAuth();
  const { id } = useParams();
  return <InventoryWorkspace key={`${activeClinicId}:${id || ''}`} productId={id} />;
}
export function InventoryWorkspace({ productId }: { productId?: string }) {
  const [data, setData] = useState<InventoryData | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0); const [editor, setEditor] = useState<Editor | null>(null);
  const [search, setSearch] = useState(''); const [category, setCategory] = useState(''); const [filter, setFilter] = useState(''); const [inactive, setInactive] = useState(false);
  const [tab, setTab] = useState<'products' | 'suppliers'>('products');
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    Promise.all([inventoryApi.list(), productId ? inventoryApi.detail(productId) : Promise.resolve(null)]).then(([list, selected]) => { if (current) { setData(list); setDetail(selected); } }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'No se pudo cargar el inventario.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [productId, revision]);
  // Refresh derived expiry states when returning to the tab or crossing clinic midnight.
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !editor) setRevision(v => v + 1); };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [editor]);
  function saved(message: string) { setEditor(null); setSuccess(message); setRevision(v => v + 1); }
  const product = detail?.product;
  const filtered = data?.products.filter(p => (inactive || p.active) && (!category || p.category === category) && p.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')) && (!filter || (filter === 'EXPIRING' ? p.expiring : filter === 'EXPIRED' ? p.expired : p.stockStatus === filter))) || [];
  const alerts = data?.products.filter(p => p.active && (p.stockStatus !== 'NORMAL' || p.expiring || p.expired)) || [];
  return <div className="space-y-5 text-slate-800 min-w-0 break-words">
    <header className="flex flex-wrap items-start justify-between gap-3"><div>{productId && <Link to="/inventory" className={`${secondaryButtonClass} mb-3`}><ArrowLeft size={16} />Volver al inventario</Link>}<h1 className="text-2xl font-bold flex items-center gap-2"><Package className="shrink-0 text-blue-600" />{productId ? 'Detalle del producto' : 'Inventario'}</h1><p className="mt-1 text-sm text-slate-500">Materiales e insumos de la clínica</p></div><div className="flex flex-wrap gap-2"><button disabled={loading} className={secondaryButtonClass} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16} />Actualizar</button>{data?.canManage && !productId && <button disabled={loading || !!error} className={buttonClass} onClick={() => setEditor({ kind: 'product' })}><Plus size={16} />Nuevo producto</button>}</div></header>
    {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{success}</div>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error} <button className={secondaryButtonClass} onClick={() => setRevision(v => v + 1)}>Reintentar carga</button></div>}
    {loading ? <p role="status" className={panel}>Cargando inventario…</p> : !error && data && <>
      {product ? <>
        <section className={`${panel} space-y-4`}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-2xl font-bold">{product.name}</h2><p className="text-slate-500">{product.category} · {product.unit}</p></div><Badges product={product} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4"><div><p className="text-sm text-slate-500">Disponible para usar</p><p className="text-2xl font-bold">{product.usableStock} <span className="text-base font-normal">{product.unit}</span></p></div><div><p className="text-sm text-slate-500">Existencia total</p><p className="font-semibold">{product.stock} {product.unit}</p></div><div><p className="text-sm text-slate-500">Stock mínimo</p><p className="font-semibold">{product.minimumStock} {product.unit}</p></div><div><p className="text-sm text-slate-500">Costo de referencia</p><p className="font-semibold">{costLabel(product.referenceCost)}</p></div></div>
          <p className="text-sm">Proveedor principal: <strong>{product.supplier?.name || 'Sin registrar'}</strong>{product.supplier && !product.supplier.active && ' (inactivo)'}</p>{product.description && <p className="text-sm whitespace-pre-wrap">{product.description}</p>}
          {product.expired && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{product.expiredStock} {product.unit} caducados. Se incluyen en la existencia total, pero no están disponibles para consumo.</p>}
          {!product.active && <p className="text-amber-900">Producto inactivo: conserva su historial. El propietario puede reactivarlo desde Editar producto.</p>}
          <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={!product.active} onClick={() => setEditor({ kind: 'movement', type: 'ENTRY' })}>Registrar entrada</button><button className={buttonClass} disabled={!product.active || Number(product.usableStock) <= 0} onClick={() => setEditor({ kind: 'movement', type: 'CONSUMPTION' })}>Registrar consumo</button><button className={secondaryButtonClass} disabled={!product.active || Number(product.stock) <= 0} onClick={() => setEditor({ kind: 'movement', type: 'WASTE' })}>Registrar merma</button></div>
          {data.canManage && <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3"><button className={secondaryButtonClass} onClick={() => setEditor({ kind: 'product', product })}>Editar producto</button><button className={secondaryButtonClass} disabled={!product.active} onClick={() => setEditor({ kind: 'movement', type: 'ADJUSTMENT_IN' })}>Ajustar inventario +</button><button className={secondaryButtonClass} disabled={!product.active || Number(product.stock) <= 0} onClick={() => setEditor({ kind: 'movement', type: 'ADJUSTMENT_OUT' })}>Ajustar inventario −</button></div>}
        </section>
        <section className={panel}><h2 className="font-bold text-lg mb-3">Lotes y existencias</h2>{!product.lots.length ? <p className="text-slate-500">Aún no hay existencias. Registra la primera entrada; número de lote y caducidad son opcionales.</p> : <div className="grid gap-3 sm:grid-cols-2">{product.lots.map(l => <article key={l.id} className="rounded-xl border border-slate-200 p-4 space-y-2"><h3 className="font-semibold">{l.number || 'Sin número de lote'} <span className="text-xs text-slate-500 font-normal">· {l.id.slice(0, 8)}</span></h3><p className="font-bold text-lg">{l.available} {product.unit} <span className="text-sm font-normal">restantes</span></p>{l.expiryDate ? <p className={l.expiryStatus === 'EXPIRED' ? 'text-red-800' : l.expiryStatus === 'EXPIRING' ? 'text-amber-900' : 'text-slate-600'}>{l.expiryStatus === 'EXPIRED' ? 'Caducado · ' : l.expiryStatus === 'EXPIRING' ? 'Próximo a caducar · ' : ''}{l.expiryLabel}<span className="block text-xs">Caducidad: {dateLabel(l.expiryDate)}</span></p> : <p className="text-sm text-slate-500">Sin caducidad registrada</p>}<p className="text-sm">Recepción: {dateLabel(l.receivedAt)} · Inicial: {l.initialQuantity}</p><p className="text-sm">Proveedor: {l.supplier?.name || 'Sin registrar'} · Costo: {costLabel(l.unitCost)}</p></article>)}</div>}</section>
        <Movements movements={detail.movements} timeZone={data.timeZone} limit={100} />
      </> : !productId && <>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{([['Productos activos', data.summary.active], ['Bajo stock', data.summary.low], ['Agotados', data.summary.empty], ['Por caducar', data.summary.expiring], ['Con caducados', data.summary.expired]] as const).map(([label, count]) => <div key={label} className={panel}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold">{count}</p></div>)}</div>
        <section className={panel}><h2 className="font-bold text-lg flex gap-2 items-center mb-3"><AlertTriangle size={18} className="text-amber-600" />Alertas</h2>{!alerts.length ? <p className="text-slate-500">{data.products.length ? 'No hay alertas de inventario.' : data.canManage ? 'Aún no hay productos. Registra el primer material para comenzar.' : 'Aún no hay productos. El propietario puede registrar el primer material.'}</p> : <div className="grid gap-3 sm:grid-cols-2">{alerts.map(p => <div key={p.id} className="border border-slate-200 rounded-xl p-3 space-y-2"><Link className="font-semibold text-blue-700 underline underline-offset-2" to={`/inventory/products/${p.id}`}>{p.name}</Link><p className="text-sm">{p.usableStock} {p.unit} disponibles · Mínimo: {p.minimumStock}</p><Badges product={p} />{p.lots.filter(l => Number(l.available) > 0 && l.expiryStatus !== 'NORMAL').map(l => <p key={l.id} className="text-sm text-slate-600">Lote {l.number || l.id.slice(0, 8)} · {l.expiryLabel}</p>)}</div>)}</div>}<p className="text-xs text-slate-500 mt-3">Por caducar: próximos {data.expiryWarningDays} días. Los mínimos se comparan con la cantidad utilizable.</p></section>
        <div className="flex gap-2" role="group" aria-label="Secciones de inventario"><button aria-pressed={tab === 'products'} className={tab === 'products' ? buttonClass : secondaryButtonClass} onClick={() => setTab('products')}>Productos</button><button aria-pressed={tab === 'suppliers'} className={tab === 'suppliers' ? buttonClass : secondaryButtonClass} onClick={() => setTab('suppliers')}>Proveedores</button></div>
        {tab === 'products' ? <section className={`${panel} space-y-4`}><h2 className="font-bold text-lg">Productos</h2><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Buscar producto<input className={fieldClass} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre del material" /></label><label className="text-sm">Categoría<select className={fieldClass} value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas las categorías</option>{[...new Set(data.products.map(p => p.category))].sort().map(c => <option key={c}>{c}</option>)}</select></label><label className="text-sm">Estado<select className={fieldClass} value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos los estados</option><option value="LOW">Bajo stock</option><option value="EMPTY">Agotados</option><option value="EXPIRING">Próximos a caducar</option><option value="EXPIRED">Caducados</option></select></label></div><label className="flex gap-2 items-center text-sm min-h-11"><input type="checkbox" checked={inactive} onChange={e => setInactive(e.target.checked)} />Incluir productos inactivos</label>
          {!filtered.length ? <p className="text-slate-500">No hay productos que coincidan.</p> : <div className="space-y-3" data-product-list><div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1.5fr_1fr] gap-3 text-xs font-semibold text-slate-500 px-3"><span>Producto / categoría</span><span>Disponible / total</span><span>Mínimo</span><span>Estado</span><span>Caducidad próxima</span></div>{filtered.map(p => <article key={p.id} data-product-id={p.id} className="grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.5fr_1fr] items-center gap-3 border border-slate-200 rounded-xl p-3"><div className="col-span-2 lg:col-span-1"><Link className="font-semibold text-blue-700 underline underline-offset-2" to={`/inventory/products/${p.id}`}>{p.name}</Link><p className="text-sm text-slate-500">{p.category}</p></div><div><span className="lg:hidden text-xs text-slate-500 block">Disponible / total</span><strong>{p.usableStock}</strong> / {p.stock}<p className="text-xs">{p.unit}</p></div><div><span className="lg:hidden text-xs text-slate-500 block">Mínimo</span>{p.minimumStock} <span className="text-xs">{p.unit}</span></div><div className="col-span-2 lg:col-span-1"><Badges product={p} /></div><p className="col-span-2 lg:col-span-1 text-sm text-slate-500">{p.nextExpiry ? dateLabel(p.nextExpiry) : 'Sin próxima caducidad'}</p></article>)}</div>}
        </section> : <section className={`${panel} space-y-4`}><div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold text-lg">Proveedores</h2>{data.canManage && <button className={buttonClass} onClick={() => setEditor({ kind: 'supplier' })}>Nuevo proveedor</button>}</div>{!data.suppliers.length ? <p className="text-slate-500">Aún no hay proveedores registrados.</p> : <div className="grid gap-3 sm:grid-cols-2">{data.suppliers.map(s => <article key={s.id} className="rounded-xl border border-slate-200 p-4 space-y-2"><h3 className="font-bold">{s.name}{!s.active && <span className="text-sm font-normal text-slate-500"> · Inactivo</span>}</h3><p className="text-sm">{s.contact || 'Sin contacto'}{s.phone && ` · ${s.phone}`}</p>{s.email && <p className="text-sm">{s.email}</p>}{s.notes && <p className="text-sm whitespace-pre-wrap">{s.notes}</p>}{data.canManage && <button className={secondaryButtonClass} onClick={() => setEditor({ kind: 'supplier', supplier: s })}>Editar proveedor</button>}</article>)}</div>}</section>}
        <Movements movements={data.movements} timeZone={data.timeZone} />
      </>}
    </>}
    {editor?.kind === 'product' && data?.canManage && <ProductForm product={editor.product} suppliers={data.suppliers} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'supplier' && data?.canManage && <SupplierForm supplier={editor.supplier} onClose={() => setEditor(null)} onSaved={saved} />}
    {editor?.kind === 'movement' && product && data && <MovementForm product={product} type={editor.type} suppliers={data.suppliers} today={data.today} onClose={() => setEditor(null)} onSaved={saved} />}
  </div>;
}
