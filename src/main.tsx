import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import AdminPanel from './components/AdminPanel';
import './index.css';
import 'leaflet/dist/leaflet.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname === '/admin' ? <AdminPanel /> : <AuthProvider><App /></AuthProvider>}
  </React.StrictMode>
);
