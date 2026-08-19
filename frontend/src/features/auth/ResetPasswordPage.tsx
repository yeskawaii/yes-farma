import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, ArrowLeft, HeartPulse, LockKeyhole } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from './api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('El enlace de recuperación no contiene un token válido.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await resetPassword(token, newPassword);
      setMessage(response.message);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(
        err?.message ||
          'No pudimos actualizar la contraseña. Solicita un enlace nuevo.',
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
              Nueva contraseña
            </p>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[var(--text-main)]">
          Elige una nueva contraseña
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Debe tener entre 15 y 128 caracteres y no aparecer en bases de datos
          conocidas de contraseñas comprometidas.
        </p>

        {!token && (
          <div className="mt-6 p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium">
            El enlace de recuperación es inválido o está incompleto.
          </div>
        )}

        {message ? (
          <div className="mt-6">
            <div className="p-3.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-medium">
              {message}
            </div>

            <Link
              to="/login"
              className="btn-primary mt-5 w-full"
            >
              Ir al inicio de sesión
            </Link>
          </div>
        ) : (
          <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-main)]">
                Nueva contraseña
              </label>
              <div className="relative">
                <LockKeyhole
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="password"
                  className="input-base pl-10"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={15}
                  maxLength={128}
                  disabled={isLoading || !token}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-main)]">
                Confirmar contraseña
              </label>
              <input
                type="password"
                className="input-base"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={15}
                maxLength={128}
                disabled={isLoading || !token}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading || !token}
            >
              {isLoading ? (
                <>
                  <Activity className="animate-spin" size={18} />
                  Actualizando...
                </>
              ) : (
                'Guardar nueva contraseña'
              )}
            </button>
          </form>
        )}

        {!message && (
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] hover:underline"
          >
            <ArrowLeft size={16} />
            Volver al inicio de sesión
          </Link>
        )}
      </section>
    </main>
  );
}
