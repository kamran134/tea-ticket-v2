import React from 'react';
import ReactDOM from 'react-dom/client';
import { ManagePanel } from './components/ManagePanel';
import { Toaster } from './components/Toaster';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManagePanel />
    <Toaster />
  </React.StrictMode>,
);
