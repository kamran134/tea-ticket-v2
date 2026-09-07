import { useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { toast } from '../../services/toast';
import { ConfirmDialog } from '../ConfirmDialog';
import { NoAccess } from '../AdminLoginGate';
import type { AdminAuth } from '../../lib/adminAuth';
import type { AdminRole, AdminUser } from '../../types';

const PASSWORD_MIN_LENGTH = 10;

const INPUT_CLASS =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500';

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

export function UsersTab({ auth }: { auth: AdminAuth }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', roleId: '' });
  const [editDraft, setEditDraft] = useState({ email: '', name: '', roleId: '' });
  const [newPassword, setNewPassword] = useState('');

  const canCreate = auth.can('users.create');
  const canEdit = auth.can('users.edit');
  const canDelete = auth.can('users.delete');
  // The role dropdown needs the role list; without roles.view we can still show
  // the users and their current role names, just not reassign them.
  const canSeeRoles = auth.can('roles.view');

  const load = async () => {
    setLoading(true);
    try {
      const [loadedUsers, loadedRoles] = await Promise.all([
        api.getAdminUsers(),
        canSeeRoles ? api.getRoles() : Promise.resolve([] as AdminRole[]),
      ]);
      setUsers(loadedUsers);
      setRoles(loadedRoles);
      setNewUser(prev => ({ ...prev, roleId: prev.roleId || loadedRoles[0]?.id || '' }));
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось загрузить пользователей'));
    } finally {
      setLoading(false);
    }
  };

  const canView = auth.can('users.view');

  useEffect(() => {
    if (!canView) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  if (!canView) {
    return <NoAccess message="Нет доступа к разделу пользователей" />;
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createAdminUser({
        email: newUser.email.trim(),
        name: newUser.name.trim(),
        password: newUser.password,
        roleId: newUser.roleId,
      });
      toast.success('Пользователь создан');
      setNewUser({ email: '', name: '', password: '', roleId: roles[0]?.id ?? '' });
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось создать пользователя'));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setResettingId(null);
    setEditDraft({ email: user.email, name: user.name, roleId: user.role.id });
  };

  const saveEdit = async (user: AdminUser) => {
    try {
      await api.updateAdminUser(user.id, {
        email: editDraft.email.trim(),
        name: editDraft.name.trim(),
        ...(editDraft.roleId !== user.role.id && { roleId: editDraft.roleId }),
      });
      toast.success('Сохранено');
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось сохранить'));
    }
  };

  const toggleActive = async (user: AdminUser) => {
    try {
      await api.updateAdminUser(user.id, { active: !user.active });
      toast.success(user.active ? 'Пользователь отключён' : 'Пользователь включён');
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось изменить статус'));
    }
  };

  const resetPassword = async (user: AdminUser) => {
    try {
      await api.resetAdminUserPassword(user.id, newPassword);
      toast.success('Пароль сброшен, все сессии пользователя завершены');
      setResettingId(null);
      setNewPassword('');
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось сбросить пароль'));
    }
  };

  const remove = async (user: AdminUser) => {
    setPendingDelete(null);
    try {
      await api.deleteAdminUser(user.id);
      toast.success('Пользователь удалён');
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось удалить пользователя'));
    }
  };

  return (
    <div className="space-y-4">
      {canCreate && (
        <form onSubmit={create} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Новый пользователь</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              required
              placeholder="Email"
              className={INPUT_CLASS}
              value={newUser.email}
              onChange={e => setNewUser({ ...newUser, email: e.target.value })}
            />
            <input
              required
              placeholder="Имя"
              className={INPUT_CLASS}
              value={newUser.name}
              onChange={e => setNewUser({ ...newUser, name: e.target.value })}
            />
            <input
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              placeholder={`Пароль (от ${PASSWORD_MIN_LENGTH} символов)`}
              className={INPUT_CLASS}
              value={newUser.password}
              onChange={e => setNewUser({ ...newUser, password: e.target.value })}
            />
            <select
              required
              className={INPUT_CLASS}
              value={newUser.roleId}
              onChange={e => setNewUser({ ...newUser, roleId: e.target.value })}
            >
              <option value="">Роль</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {creating ? 'Создание...' : 'Создать'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-2">
          {users.map(user => {
            const isSelf = auth.admin?.id === user.id;
            return (
              <div key={user.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                {editingId === user.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className={INPUT_CLASS}
                        value={editDraft.name}
                        onChange={e => setEditDraft({ ...editDraft, name: e.target.value })}
                      />
                      <input
                        type="email"
                        className={INPUT_CLASS}
                        value={editDraft.email}
                        onChange={e => setEditDraft({ ...editDraft, email: e.target.value })}
                      />
                    </div>
                    <select
                      className={INPUT_CLASS}
                      value={editDraft.roleId}
                      disabled={isSelf || !canSeeRoles}
                      onChange={e => setEditDraft({ ...editDraft, roleId: e.target.value })}
                    >
                      {roles.length === 0 && <option value={user.role.id}>{user.role.name}</option>}
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    {isSelf && (
                      <p className="text-xs text-gray-500">
                        Свою роль изменить нельзя — это должен сделать другой Super Admin.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => void saveEdit(user)}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors"
                      >
                        Сохранить
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800">{user.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            {user.role.name}
                          </span>
                          {!user.active && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              отключён
                            </span>
                          )}
                          {isSelf && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                              это вы
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 truncate">{user.email}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Последний вход: {formatDate(user.lastLoginAt)}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {canEdit && (
                        <button
                          onClick={() => startEdit(user)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                        >
                          Изменить
                        </button>
                      )}
                      {canEdit && !isSelf && (
                        <button
                          onClick={() => {
                            setResettingId(resettingId === user.id ? null : user.id);
                            setNewPassword('');
                          }}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                        >
                          Сбросить пароль
                        </button>
                      )}
                      {canEdit && !isSelf && (
                        <button
                          onClick={() => void toggleActive(user)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                        >
                          {user.active ? 'Отключить' : 'Включить'}
                        </button>
                      )}
                      {canDelete && !isSelf && (
                        <button
                          onClick={() => setPendingDelete(user)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition-colors"
                        >
                          Удалить
                        </button>
                      )}
                    </div>

                    {resettingId === user.id && (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="password"
                          autoComplete="new-password"
                          minLength={PASSWORD_MIN_LENGTH}
                          placeholder={`Новый пароль (от ${PASSWORD_MIN_LENGTH} символов)`}
                          className={INPUT_CLASS}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                        />
                        <button
                          onClick={() => void resetPassword(user)}
                          disabled={newPassword.length < PASSWORD_MIN_LENGTH}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm whitespace-nowrap hover:bg-emerald-700 transition-colors disabled:opacity-60"
                        >
                          Сохранить
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Удалить пользователя"
          message={`${pendingDelete.name} (${pendingDelete.email}) потеряет доступ к админке. Записи в журнале действий сохранятся.`}
          confirmLabel="Удалить"
          onConfirm={() => void remove(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
