import { useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { PasswordInput } from './PasswordInput';
import type { AdminAuth } from '../lib/adminAuth';

const INPUT_CLASS =
  'w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500';

/**
 * Shared login screen for /manage and /admin. Both pages used to carry their
 * own copy of this form and of the token check behind it.
 */
export function AdminLoginGate({
  auth,
  title,
  children,
}: {
  auth: AdminAuth;
  title: string;
  children: ReactNode;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (auth.state === 'loading') {
    return (
      <div className="app-bg flex items-center justify-center p-4">
        <div className="text-gray-500 text-sm">Загрузка...</div>
      </div>
    );
  }

  if (auth.state === 'authenticated') {
    return <>{children}</>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await auth.login(email.trim(), password);
    } catch {
      // The backend never says which of the two was wrong, and neither do we.
      setError('Неверный email или пароль');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-bg flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-xl font-bold text-gray-800">{title}</h1>
          <ThemeToggle />
        </div>
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
        <form data-testid="admin-login" onSubmit={submit} className="space-y-3">
          <input
            type="email"
            data-testid="admin-email"
            aria-label="Email"
            placeholder="Email"
            autoComplete="username"
            className={INPUT_CLASS}
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus
            required
          />
          <PasswordInput
            data-testid="admin-password"
            aria-label="Пароль"
            placeholder="Пароль"
            autoComplete="current-password"
            className={INPUT_CLASS}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            data-testid="admin-login-submit"
            disabled={submitting}
            className="w-full py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Shown when an account is signed in but lacks the permission for a page. */
export function NoAccess({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
      <p className="text-gray-600">{message}</p>
    </div>
  );
}
