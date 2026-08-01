import React from 'react';
import ReactDOM from 'react-dom/client';
import { Afisha } from './components/Afisha';
import { RegisterForm } from './components/RegisterForm';
import './styles/main.css';

const eventMatch = window.location.pathname.match(/^\/e\/([^/]+)\/?$/);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {eventMatch ? <RegisterForm slug={decodeURIComponent(eventMatch[1])} /> : <Afisha />}
  </React.StrictMode>,
);
