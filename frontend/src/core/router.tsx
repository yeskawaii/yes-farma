import { createBrowserRouter, Navigate } from 'react-router-dom';
import { MainLayout } from '../shared/components/Layout/MainLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PatientList } from '../features/patients/PatientList';
import { PatientDetail } from '../features/patients/PatientDetail';
import { PatientCreate } from '../features/patients/PatientCreate';
import { PatientEdit } from '../features/patients/PatientEdit';

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
            element: <PatientList />,
          },
          {
            path: 'patients/new',
            element: <PatientCreate />,
          },
          {
            path: 'patients/:id',
            element: <PatientDetail />,
          },
          {
            path: 'patients/:id/edit',
            element: <PatientEdit />,
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
