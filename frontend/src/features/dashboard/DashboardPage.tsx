import { Users, Calendar, Clock, Activity } from 'lucide-react';
import './DashboardPage.css';

export function DashboardPage() {
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="page-title">Dashboard Overview</h1>
        <p className="text-muted">Here's what's happening at your clinic today.</p>
      </div>

      <div className="metrics-grid">
        <div className="card metric-card">
          <div className="metric-icon primary-light-bg">
            <Users className="primary-color" size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Total Patients</p>
            <h3 className="metric-value">1,248</h3>
          </div>
        </div>

        <div className="card metric-card">
          <div className="metric-icon secondary-light-bg">
            <Calendar className="secondary-color" size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Appointments Today</p>
            <h3 className="metric-value">24</h3>
          </div>
        </div>

        <div className="card metric-card">
          <div className="metric-icon warning-light-bg">
            <Clock className="warning-color" size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Pending Reviews</p>
            <h3 className="metric-value">7</h3>
          </div>
        </div>

        <div className="card metric-card">
          <div className="metric-icon success-light-bg">
            <Activity className="success-color" size={24} />
          </div>
          <div className="metric-content">
            <p className="metric-label">Active Cases</p>
            <h3 className="metric-value">156</h3>
          </div>
        </div>
      </div>

      <div className="dashboard-main">
        <div className="card recent-activity">
          <h2 className="section-title">Recent Appointments</h2>
          <div className="empty-state">
            <p className="text-muted">No recent appointments to show yet.</p>
            <button className="btn-primary mt-4">
              <Calendar size={18} /> Add Appointment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
