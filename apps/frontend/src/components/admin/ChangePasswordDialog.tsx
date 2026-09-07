import { useState } from 'react';
import { api, ApiError } from '../../services/api';
import { storeToken } from '../../lib/adminAuth';
import { toast } from '../../services/toast';
import { PasswordInput } from '../PasswordInput';

const PASSWORD_MIN_LENGTH = 10;

const INPUT_CLASS =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500';

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast.error('Новые пароли не совпадают');
      return;
    }
    setSubmitting(true);
    try {
      const { token } = await api.changeOwnPassword(currentPassword, newPassword);
      storeToken(token);
      toast.success('Пароль изменён');
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Не удалось сменить пароль';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-3"
      >
        <h3 className="text-lg font-semibold text-gray-800">Сменить пароль</h3>
        <PasswordInput
          autoComplete="current-password"
          required
          placeholder="Текущий пароль"
          className={INPUT_CLASS}
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
        />
        <PasswordInput
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder={`Новый пароль (от ${PASSWORD_MIN_LENGTH} символов)`}
          className={INPUT_CLASS}
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />
        <PasswordInput
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          placeholder="Повторите новый пароль"
          className={INPUT_CLASS}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm text-white bg-emerald-600 rounded-xl font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
