import React from 'react';
import ReactDOM from 'react-dom/client';
import { TicketView } from './components/TicketView';
import { Toaster } from './components/Toaster';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TicketView />
    <Toaster />
  </React.StrictMode>,
);
