import React from 'react';
import ReactDOM from 'react-dom/client';
import { RegisterForm } from './components/RegisterForm';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RegisterForm />
  </React.StrictMode>,
);
