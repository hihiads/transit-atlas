import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './TransitlyHzpp';
import { AuthProvider } from '../../src/contexts/AuthContext';
import '../../src/index.css';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AuthProvider><App /></AuthProvider></React.StrictMode>
);
