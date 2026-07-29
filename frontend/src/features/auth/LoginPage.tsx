import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

export function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login for now
    navigate('/dashboard');
  };

  return (
    <div className="login-container">
      <div className="login-visual-panel">
        <div className="visual-content">
          <div className="logo-large">YF</div>
          <h1>Yes Farma</h1>
          <p>Modern Healthcare Management</p>
        </div>
        <div className="decorative-circles">
          <div className="circle circle-1"></div>
          <div className="circle circle-2"></div>
        </div>
      </div>
      <div className="login-form-panel">
        <div className="login-card glass">
          <div className="login-header">
            <h2>Welcome Back</h2>
            <p className="text-muted">Please enter your details to sign in.</p>
          </div>
          
          <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input 
                type="email" 
                id="email" 
                className="form-control" 
                placeholder="doctor@yesfarma.com" 
                required 
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input 
                type="password" 
                id="password" 
                className="form-control" 
                placeholder="••••••••" 
                required 
              />
            </div>

            <div className="form-options">
              <label className="checkbox-container">
                <input type="checkbox" />
                <span className="checkmark"></span>
                Remember me
              </label>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>

            <button type="submit" className="btn-primary login-btn">
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
