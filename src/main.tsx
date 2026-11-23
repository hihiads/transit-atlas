import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import AdminPanel from './components/AdminPanel';
import LegalPage from './components/LegalPage';
import ParentConsentPage from './components/ParentConsentPage';
import AccountDeletionPage from './components/AccountDeletionPage';
import './index.css';
import 'leaflet/dist/leaflet.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname === '/admin' ? <AdminPanel /> : window.location.pathname === '/confirm-parent' ? <ParentConsentPage /> : window.location.pathname === '/delete-account' ? <AccountDeletionPage /> : ['/privacy', '/terms', '/cookies'].includes(window.location.pathname) ? <LegalPage /> : <AuthProvider><App /></AuthProvider>}
  </React.StrictMode>
);
