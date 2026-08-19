import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, HeartPulse, Activity } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthProvider';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, status } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/dashboard', { replace: true });
    }
  }, [status, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión.');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="flex min-h-screen bg-[var(--background)] items-center justify-center flex-col gap-4">
        <Activity className="animate-spin text-[var(--primary)]" size={32} />
        <span className="text-[var(--text-muted)] font-medium">Cargando plataforma...</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)] font-sans">

      {/* Panel Visual - Lado Izquierdo (Desktop) */}
      <div className="hidden lg:flex flex-1 relative bg-[#EAF4FF] overflow-hidden flex-col items-center justify-center border-r border-[var(--border)]">
        {/* Formas abstractas suaves y clínicas */}
        <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none opacity-40">
          <div className="absolute w-[800px] h-[800px] rounded-full bg-white/40 blur-3xl -top-48 -left-48"></div>
          <div className="absolute w-[600px] h-[600px] rounded-full bg-[#D1E8FF] blur-3xl -bottom-32 -right-32"></div>
        </div>

        <div className="z-10 text-center animate-slide-up flex flex-col items-center max-w-md px-8">
          <div className="w-20 h-20 mb-8 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-blue-100">
            <HeartPulse className="text-[var(--primary)]" size={40} />
          </div>
          <h1 className="text-4xl font-bold mb-4 text-[#0F172A] tracking-tight">Portal Clínico Yeskira Salud</h1>
          <p className="text-lg text-[#334155] leading-relaxed">
            Gestión médica profesional, segura y centralizada para tu consultorio.
          </p>
        </div>
      </div>

      {/* Panel Formulario - Lado Derecho */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 md:px-24 bg-[var(--surface)] relative">
        <div className="w-full max-w-sm mx-auto">

          {/* Cabecera Móvil (Oculta en Desktop) */}
          <div className="lg:hidden flex flex-col items-center text-center gap-3 mb-10 animate-slide-up">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center shadow-sm border border-blue-100">
              <HeartPulse className="text-[var(--primary)]" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-[var(--text-main)] tracking-tight">Yeskira Salud</h1>
            <p className="text-base text-[var(--text-muted)]">Portal Clínico</p>
          </div>

          {/* Cabecera Formulario Desktop */}
          <div className="hidden lg:block mb-10 animate-slide-up delay-100">
            <h2 className="text-3xl font-bold text-[var(--text-main)]">Bienvenido, Dr.</h2>
            <p className="text-[var(--text-muted)] mt-2">Ingresa tus credenciales para acceder</p>
          </div>

          <form className="flex flex-col gap-5 animate-slide-up delay-200" onSubmit={handleLogin}>
            {error && (
              <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-main)]">Correo electrónico</label>
              <input
                type="email"
                className="input-base"
                placeholder="doctor@clinica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-main)]">Contraseña</label>
              <input
                type="password"
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <button type="submit" className="btn-primary mt-4" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Activity className="animate-spin" size={18} /> Validando...
                </>
              ) : (
                <>
                  Ingresar al sistema <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
