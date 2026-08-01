import { RouterProvider } from 'react-router-dom';
import { router } from './core/router';
import { AuthProvider } from './core/auth/AuthProvider';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
