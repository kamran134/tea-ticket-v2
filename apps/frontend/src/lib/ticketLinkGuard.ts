const storageKey = (id: string) => `tea-ticket-unsaved-link:${id}`;

export function rememberUnsavedTicketLink(id: string): void {
  try {
    sessionStorage.setItem(storageKey(id), '1');
  } catch {
    // ignore storage errors
  }
}

export function forgetUnsavedTicketLink(id: string): void {
  try {
    sessionStorage.removeItem(storageKey(id));
  } catch {
    // ignore storage errors
  }
}

export function hasUnsavedTicketLink(id: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(id)) === '1';
  } catch {
    return false;
  }
}

export function isFreshTicketUrl(): boolean {
  return new URLSearchParams(window.location.search).get('new') === '1';
}

function sameTabAnchor(el: EventTarget | null): HTMLAnchorElement | null {
  if (!(el instanceof Element)) return null;
  const anchor = el.closest('a');
  if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;
  const protocol = anchor.protocol;
  if (protocol === 'mailto:' || protocol === 'tel:' || protocol === 'javascript:') return null;
  return anchor;
}

function leavesTicketPage(anchor: HTMLAnchorElement, ticketId: string): boolean {
  const next = new URL(anchor.href, window.location.href);
  if (next.origin !== window.location.origin) return true;
  const path = next.pathname.replace(/\/$/, '') || '/';
  const onTicket = /\/ticket(?:\.html)?$/i.test(path);
  if (!onTicket) return true;
  const nextId = next.searchParams.get('id') ?? next.searchParams.get('checkoutId');
  return nextId !== ticketId;
}

/** Intercepts leaving the ticket page while the link is still unsaved. */
export function attachTicketLeaveGuard(options: {
  ticketId: string;
  isEnabled: () => boolean;
  allowLeave: { current: boolean };
  onPrompt: (nextUrl: string) => void;
}): () => void {
  const { ticketId, isEnabled, allowLeave, onPrompt } = options;
  let stayTimer: number | undefined;

  const onClick = (e: MouseEvent) => {
    if (!isEnabled() || allowLeave.current || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = sameTabAnchor(e.target);
    if (!anchor || !leavesTicketPage(anchor, ticketId)) return;
    e.preventDefault();
    onPrompt(anchor.href);
  };

  const onPopState = () => {
    if (!isEnabled() || allowLeave.current) return;
    history.pushState({ teaTicketLinkGuard: true }, '', window.location.href);
    const referrer = document.referrer;
    let nextUrl = '/';
    try {
      if (referrer && new URL(referrer).origin === window.location.origin) nextUrl = referrer;
    } catch {
      nextUrl = '/';
    }
    onPrompt(nextUrl);
  };

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!isEnabled() || allowLeave.current) return;
    e.preventDefault();
    e.returnValue = '';
    stayTimer = window.setTimeout(() => onPrompt(''), 0);
  };

  history.pushState({ teaTicketLinkGuard: true }, '', window.location.href);
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPopState);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    if (stayTimer !== undefined) window.clearTimeout(stayTimer);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
