import { Afisha } from './components/Afisha';
import { LegalPage } from './components/LegalPage';
import { RegisterForm } from './components/RegisterForm';
import { legalPageByPath } from './legal/pages';
import { renderApp } from './renderApp';

const pathname = window.location.pathname;
const legalPage = legalPageByPath(pathname);
const eventMatch = pathname.match(/^\/e\/([^/]+)\/?$/);

if (legalPage) {
  renderApp(<LegalPage page={legalPage} />);
} else {
  renderApp(eventMatch ? <RegisterForm slug={decodeURIComponent(eventMatch[1])} /> : <Afisha />);
}
