import { StrictMode, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from './components/Toaster';
import i18n from './i18n';
import { ThemeProvider } from './theme/ThemeProvider';
import './styles/main.css';

// Every entry point (main/ticket/admin/manage) mounts through here so toasts
// work everywhere — not just on the one page that happened to render
// <Toaster/> itself.
export function renderApp(children: ReactNode): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </I18nextProvider>
    </StrictMode>,
  );
}

