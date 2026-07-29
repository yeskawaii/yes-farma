import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/dashboard');
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      
      {/* Visual Panel for Desktop */}
      <div className="hidden md:flex flex-1 relative bg-gradient-to-br from-[var(--primary)] to-emerald-900 overflow-hidden flex-col items-center justify-center text-white">
        <div className="absolute top-0 left-0 w-full h-full z-0 opacity-20 pointer-events-none">
          <div className="absolute w-[600px] h-[600px] rounded-full border border-white/20 -top-48 -left-48"></div>
          <div className="absolute w-[800px] h-[800px] rounded-full border border-white/20 -bottom-64 -right-32"></div>
        </div>
        
        <div className="z-10 text-center animate-slide-up">
          <div className="w-24 h-24 mx-auto mb-8 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center text-4xl font-extrabold shadow-2xl">
            YF
          </div>
          <h1 className="text-5xl font-bold mb-4 tracking-tight">Yes Farma</h1>
          <p className="text-xl font-medium text-emerald-100">Modern clinics on the go.</p>
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 md:px-24 bg-[var(--background)] relative">
        
        <div className="w-full max-w-md mx-auto">
          {/* Mobile Hero (Hidden on Desktop) */}
          <div className="md:hidden flex flex-col items-center text-center gap-4 mb-12 animate-slide-up">
            <div className="w-20 h-20 bg-[var(--text-main)] text-[var(--background)] rounded-2xl flex items-center justify-center font-extrabold text-3xl shadow-lg">
              YF
            </div>
            <h1 className="text-4xl font-bold text-[var(--text-main)] tracking-tight">Yes Farma</h1>
            <p className="text-lg font-medium text-[var(--text-muted)]">Clinics on the go.</p>
          </div>

          {/* Desktop Form Header */}
          <div className="hidden md:block mb-10 animate-slide-up delay-100">
            <h2 className="text-3xl font-bold text-[var(--text-main)]">Welcome back, Doctor</h2>
            <p className="text-[var(--text-muted)] mt-2">Sign in to access your portal</p>
          </div>
          
          <form className="flex flex-col gap-5 animate-slide-up delay-200" onSubmit={handleLogin}>
            <div>
              <label className="hidden md:block text-sm font-semibold mb-1.5 text-[var(--text-main)]">Email Address</label>
              <input 
                type="email" 
                className="input-base" 
                placeholder="Doctor's Email" 
                required 
              />
            </div>
            
            <div>
              <label className="hidden md:block text-sm font-semibold mb-1.5 text-[var(--text-main)]">Password</label>
              <input 
                type="password" 
                className="input-base" 
                placeholder="••••••••" 
                required 
              />
            </div>

            <div className="flex items-center justify-between text-sm mt-2 mb-2">
              <label className="flex items-center gap-2 text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-main)] transition-colors">
                <input type="checkbox" className="w-4 h-4 rounded border-[var(--border)] text-[var(--text-main)] focus:ring-[var(--text-main)]" />
                Remember me
              </label>
              <a href="#" className="font-semibold text-[var(--text-main)] hover:underline">Forgot password?</a>
            </div>

            <button type="submit" className="btn-primary mt-2">
              Sign In <ChevronRight size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
