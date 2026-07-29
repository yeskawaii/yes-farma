import { RouterProvider } from 'react-router-dom';
import { router } from './core/router';
import './App.css';

function App() {
  return (
    <RouterProvider router={router} />
  );
}

export default App;
