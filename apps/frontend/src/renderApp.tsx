import { StrictMode, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from './components/Toaster';
import './styles/main.css';

// Every entry point (main/ticket/admin/manage) mounts through here so toasts
// work everywhere — not just on the one page that happened to render
// <Toaster/> itself.
export function renderApp(children: ReactNode): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {children}
      <Toaster />
    </StrictMode>,
  );
}
