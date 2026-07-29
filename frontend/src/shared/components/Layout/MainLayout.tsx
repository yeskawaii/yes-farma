import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar';
import './MainLayout.css';

export function MainLayout() {
  return (
    <div className="main-layout">
      <Sidebar />
      <div className="main-content">
        <header className="main-header glass">
          <div className="header-search">
            {/* Search or breadcrumbs can go here */}
            <span className="text-muted">Welcome back, Dr. Yescas</span>
          </div>
          <div className="header-actions">
            <div className="avatar">D</div>
          </div>
        </header>
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
