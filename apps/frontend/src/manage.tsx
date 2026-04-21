import React from 'react';
import ReactDOM from 'react-dom/client';
import { ManagePanel } from './components/ManagePanel';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ManagePanel />
  </React.StrictMode>,
);
