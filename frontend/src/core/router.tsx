import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '../shared/components/Layout/MainLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ProtectedRoute } from './auth/ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <MainLayout />,
        children: [
          {
            path: '/',
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <DashboardPage />,
          },
          {
            path: 'patients',
            element: <div className="p-8"><h2>Módulo de Pacientes (Próximamente)</h2></div>,
          },
          {
            path: 'appointments',
            element: <div className="p-8"><h2>Módulo de Agenda (Próximamente)</h2></div>,
          },
        ],
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  }
]);
