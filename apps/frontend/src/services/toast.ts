type ToastType = 'success' | 'error';
export type ToastItem = { id: number; type: ToastType; message: string };
type Listener = (toasts: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(l => l([...items]));
}

function add(type: ToastType, message: string, duration = 3500) {
  const id = ++nextId;
  items = [...items, { id, type, message }];
  notify();
  setTimeout(() => {
    items = items.filter(t => t.id !== id);
    notify();
  }, duration);
}

export const toast = {
  success: (message: string) => add('success', message),
  error: (message: string) => add('error', message, 5000),
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
