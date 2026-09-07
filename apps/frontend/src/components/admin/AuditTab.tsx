import { useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { toast } from '../../services/toast';
import { NoAccess } from '../AdminLoginGate';
import type { AdminAuth } from '../../lib/adminAuth';
import type { AuditLogEntry } from '../../types';

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  'auth.login.success': 'Вход',
  'auth.login.failure': 'Неудачный вход',
  'auth.logout': 'Выход',
  'auth.password.change': 'Смена своего пароля',
  'users.create': 'Создан пользователь',
  'users.update': 'Изменён пользователь',
  'users.delete': 'Удалён пользователь',
  'users.password.reset': 'Сброшен пароль',
  'roles.create': 'Создана роль',
  'roles.update': 'Изменена роль',
  'roles.delete': 'Удалена роль',
  'events.create': 'Создано мероприятие',
  'events.delete': 'Удалено мероприятие',
  'tickets.status': 'Изменён статус билета',
  'tickets.delete': 'Удалён билет',
};

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Все действия' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

function isFailure(action: string): boolean {
  return action.endsWith('.failure') || action.endsWith('.delete');
}

export function AuditTab({ auth }: { auth: AdminAuth }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);

  const allowed = auth.can('audit.view');

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    api
      .getAuditLog({ limit: PAGE_SIZE, offset, action: action || undefined })
      .then(page => {
        if (cancelled) return;
        setEntries(page.entries);
        setTotal(page.total);
      })
      .catch(err => {
        if (!cancelled) toast.error(errMsg(err, 'Не удалось загрузить журнал'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offset, action, allowed]);

  if (!allowed) {
    return <NoAccess message="Нет доступа к журналу действий" />;
  }

  return (
    <div className="space-y-3">
      <select
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
        value={action}
        onChange={e => {
          setOffset(0);
          setAction(e.target.value);
        }}
      >
        {FILTERS.map(f => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {loading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-gray-500">Записей нет</div>
      ) : (
        <div className="space-y-1.5">
          {entries.map(entry => (
            <div key={entry.id} className="bg-white rounded-xl shadow-sm px-4 py-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span
                  className={`font-medium ${isFailure(entry.action) ? 'text-red-600' : 'text-gray-800'}`}
                >
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(entry.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
              <div className="text-gray-500 text-xs mt-0.5">
                {entry.actorEmail}
                {entry.ip && ` · ${entry.ip}`}
                {entry.resourceId && ` · ${entry.resource}:${entry.resourceId}`}
              </div>
              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <div className="text-gray-400 text-xs mt-0.5 break-all">
                  {JSON.stringify(entry.metadata)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition-colors"
          >
            Назад
          </button>
          <span className="text-gray-500">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} из {total}
          </span>
          <button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-200 transition-colors"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
