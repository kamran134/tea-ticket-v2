import { StrictMode, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from './components/Toaster';
import i18n from './i18n';
import { ThemeProvider } from './theme/ThemeProvider';
import './styles/main.css';

// Class set on <html> once React has replaced the server-rendered markup in #root.
// index.html hides #root until it appears, so the SEO copy never flashes on load.
const APP_READY_CLASS = 'app-ready';

// Every entry point (main/ticket/admin/manage) mounts through here so toasts
// work everywhere — not just on the one page that happened to render
// <Toaster/> itself.
export function renderApp(children: ReactNode): void {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  // flushSync commits the tree synchronously, so the reveal below never shows the old markup.
  flushSync(() => {
    root.render(
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </I18nextProvider>
      </StrictMode>,
    );
  });
  document.documentElement.classList.add(APP_READY_CLASS);
}

