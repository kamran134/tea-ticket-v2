import { Afisha } from './components/Afisha';
import { RegisterForm } from './components/RegisterForm';
import { renderApp } from './renderApp';

const eventMatch = window.location.pathname.match(/^\/e\/([^/]+)\/?$/);

renderApp(eventMatch ? <RegisterForm slug={decodeURIComponent(eventMatch[1])} /> : <Afisha />);
