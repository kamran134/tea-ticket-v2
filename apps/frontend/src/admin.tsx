import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminScanner } from './components/AdminScanner';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminScanner />
  </React.StrictMode>,
);
