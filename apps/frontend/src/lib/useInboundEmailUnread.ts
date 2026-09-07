import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

const POLL_INTERVAL_MS = 30_000;

export function useInboundEmailUnread(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [marking, setMarking] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }
    try {
      const { unreadCount: count } = await api.getInboundEmailUnreadCount();
      setUnreadCount(count);
    } catch {
      // Auth errors are handled globally; keep the last known count.
    }
  }, [enabled]);

  const markAllRead = useCallback(async () => {
    if (!enabled || unreadCount === 0 || marking) return;
    setMarking(true);
    try {
      await api.markAllInboundEmailsRead();
      setUnreadCount(0);
    } catch {
      // Leave the badge visible so the admin can retry.
    } finally {
      setMarking(false);
    }
  }, [enabled, marking, unreadCount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, refresh]);

  return { unreadCount, marking, refresh, markAllRead };
}
