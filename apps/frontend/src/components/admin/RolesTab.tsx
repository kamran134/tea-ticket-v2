import { useEffect, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { toast } from '../../services/toast';
import { ConfirmDialog } from '../ConfirmDialog';
import { NoAccess } from '../AdminLoginGate';
import type { AdminAuth } from '../../lib/adminAuth';
import type { AdminRole, PermissionGroup } from '../../types';

const RESOURCE_LABELS: Record<string, string> = {
  events: 'Мероприятия',
  tickets: 'Билеты',
  stats: 'Статистика',
  users: 'Пользователи',
  roles: 'Роли',
  audit: 'Журнал',
};

const INPUT_CLASS =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500';

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

function PermissionPicker({
  catalog,
  selected,
  onToggle,
  disabled,
  auth,
}: {
  catalog: PermissionGroup[];
  selected: Set<string>;
  onToggle: (code: string) => void;
  disabled: boolean;
  auth: AdminAuth;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {catalog.map(group => (
        <div key={group.resource} className="border border-gray-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
            {RESOURCE_LABELS[group.resource] ?? group.resource}
          </div>
          <div className="space-y-1.5">
            {group.permissions.map(permission => {
              // You cannot hand out a permission you do not hold yourself; the
              // backend rejects it either way, so show it as unavailable.
              const cannotGrant = !auth.can(permission.code);
              return (
                <label
                  key={permission.code}
                  className={`flex items-start gap-2 text-sm ${
                    disabled || cannotGrant ? 'text-gray-400' : 'text-gray-700'
                  }`}
                  title={cannotGrant ? 'У вас нет этого права — выдать его нельзя' : permission.code}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(permission.code)}
                    disabled={disabled || (cannotGrant && !selected.has(permission.code))}
                    onChange={() => onToggle(permission.code)}
                  />
                  <span className="leading-snug">{permission.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RolesTab({ auth }: { auth: AdminAuth }) {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; permissions: Set<string> }>(
    { name: '', description: '', permissions: new Set() },
  );
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminRole | null>(null);

  const canCreate = auth.can('roles.create');
  const canEdit = auth.can('roles.edit');
  const canDelete = auth.can('roles.delete');

  const load = async () => {
    setLoading(true);
    try {
      const [loadedRoles, loadedCatalog] = await Promise.all([
        api.getRoles(),
        api.getPermissionCatalog(),
      ]);
      setRoles(loadedRoles);
      setCatalog(loadedCatalog);
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось загрузить роли'));
    } finally {
      setLoading(false);
    }
  };

  const canView = auth.can('roles.view');

  useEffect(() => {
    if (!canView) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  if (!canView) {
    return <NoAccess message="Нет доступа к разделу ролей" />;
  }

  const toggle = (code: string) => {
    setDraft(prev => {
      const permissions = new Set(prev.permissions);
      if (permissions.has(code)) permissions.delete(code);
      else permissions.add(code);
      return { ...prev, permissions };
    });
  };

  const startCreate = () => {
    setEditingId(null);
    setShowCreate(true);
    setDraft({ name: '', description: '', permissions: new Set() });
  };

  const startEdit = (role: AdminRole) => {
    setShowCreate(false);
    setEditingId(role.id);
    setDraft({
      name: role.name,
      description: role.description ?? '',
      permissions: new Set(role.permissions),
    });
  };

  const submitCreate = async () => {
    try {
      await api.createRole({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        permissions: [...draft.permissions],
      });
      toast.success('Роль создана');
      setShowCreate(false);
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось создать роль'));
    }
  };

  const submitEdit = async (role: AdminRole) => {
    try {
      await api.updateRole(role.id, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        permissions: [...draft.permissions],
      });
      toast.success('Роль сохранена');
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось сохранить роль'));
    }
  };

  const remove = async (role: AdminRole) => {
    setPendingDelete(null);
    try {
      await api.deleteRole(role.id);
      toast.success('Роль удалена');
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось удалить роль'));
    }
  };

  const editor = (onSave: () => void, onCancel: () => void) => (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          placeholder="Название роли"
          className={INPUT_CLASS}
          value={draft.name}
          onChange={e => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          placeholder="Описание"
          className={INPUT_CLASS}
          value={draft.description}
          onChange={e => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      <PermissionPicker
        catalog={catalog}
        selected={draft.permissions}
        onToggle={toggle}
        disabled={false}
        auth={auth}
      />
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!draft.name.trim()}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors disabled:opacity-60"
        >
          Сохранить
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {canCreate && !showCreate && (
        <button
          onClick={startCreate}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          Новая роль
        </button>
      )}

      {showCreate && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="font-semibold text-gray-800">Новая роль</h2>
          {editor(() => void submitCreate(), () => setShowCreate(false))}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-2">
          {roles.map(role => (
            <div key={role.id} className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800">{role.name}</span>
                    {role.isSuperAdmin && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        полный доступ
                      </span>
                    )}
                    {role.isSystem && !role.isSuperAdmin && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        системная
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {role.userCount} польз.
                    </span>
                  </div>
                  {role.description && (
                    <div className="text-sm text-gray-500">{role.description}</div>
                  )}
                  {!role.isSuperAdmin && (
                    <div className="text-xs text-gray-400 mt-1">
                      {role.permissions.length} прав
                    </div>
                  )}
                </div>
              </div>

              {editingId === role.id ? (
                editor(() => void submitEdit(role), () => setEditingId(null))
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {canEdit && !role.isSuperAdmin && (
                    <button
                      onClick={() => startEdit(role)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                    >
                      Изменить права
                    </button>
                  )}
                  {role.isSuperAdmin && (
                    <span className="text-xs text-gray-500 self-center">
                      Роль защищена: полный доступ независимо от списка прав, изменить нельзя.
                    </span>
                  )}
                  {canDelete && !role.isSystem && (
                    <button
                      onClick={() => setPendingDelete(role)}
                      className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 transition-colors"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Удалить роль"
          message={`Роль «${pendingDelete.name}» будет удалена.`}
          confirmLabel="Удалить"
          onConfirm={() => void remove(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
