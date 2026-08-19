import { Home, RefreshCw, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

export function RouteErrorPage() {
  const error = useRouteError();

  let title = 'No pudimos cargar esta pantalla';
  let message =
    'Ocurrió un error inesperado. Puedes intentar recargar o volver al inicio.';

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Página no encontrada';
      message = 'La página que buscas no existe o ya no está disponible.';
    } else if (error.status === 403) {
      title = 'Acceso no disponible';
      message = 'No tienes acceso a esta pantalla.';
    }
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
          <TriangleAlert className="text-amber-600" size={28} />
        </div>

        <h1 className="mt-5 text-2xl font-bold text-slate-900">
          {title}
        </h1>

        <p className="mt-3 text-slate-600 leading-relaxed">
          {message}
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={18} />
            Reintentar
          </button>

          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Home size={18} />
            Volver al inicio
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-400">
          Yeskira Salud
        </p>
      </section>
    </main>
  );
}
