import { useState, useEffect } from 'react';
import { toast, type ToastItem } from '../services/toast';

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => toast.subscribe(setToasts), []);

  return (
    <>
      <style>{`
        @keyframes _toast-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)  scale(1);    }
        }
      `}</style>
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            style={{ animation: '_toast-in 0.18s ease-out' }}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white max-w-xs ${
              t.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
