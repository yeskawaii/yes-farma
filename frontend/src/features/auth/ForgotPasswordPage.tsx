import { useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, ArrowLeft, HeartPulse, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from './api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await requestPasswordReset(email);
      setMessage(response.message);
    } catch (err: any) {
      setError(
        err?.message ||
          'No pudimos procesar la solicitud. Intenta nuevamente.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
            <HeartPulse className="text-[var(--primary)]" size={26} />
          </div>
          <div>
            <p className="font-bold text-lg text-[var(--text-main)]">
              Yeskira Salud
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Recuperación de acceso
            </p>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[var(--text-main)]">
          Restablece tu contraseña
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Ingresa el correo asociado a tu cuenta. Si existe una cuenta activa,
          recibirás un enlace temporal para continuar.
        </p>

        <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
          {message && (
            <div className="p-3.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-medium">
              {message}
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-main)]">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="email"
                className="input-base pl-10"
                placeholder="doctor@clinica.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? (
              <>
                <Activity className="animate-spin" size={18} />
                Enviando...
              </>
            ) : (
              'Enviar instrucciones'
            )}
          </button>
        </form>

        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:underline"
        >
          <ArrowLeft size={16} />
          Volver al inicio de sesión
        </Link>
      </section>
    </main>
  );
}
