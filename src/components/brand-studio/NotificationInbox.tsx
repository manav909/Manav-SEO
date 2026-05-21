/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/NotificationInbox.tsx
   Brand Studio H.6a — Bell dropdown for both PM and client headers.

   Works for both audiences:
   - PM:     pass { mode: 'staff', recipientId: 'pm:<projectId>' }
   - Client: pass { mode: 'client_session', sessionToken: '...' }

   Polls every 30s when open. Click outside to close. Click a notification
   to mark it read and surface its payload.
═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Loader2, X } from 'lucide-react';
import {
  listNotifications, markNotificationRead,
  clientSessionListNotifications, clientSessionMarkNotificationRead,
  type ClientNotification,
} from './api';

interface PropsStaff {
  mode: 'staff';
  projectId: string;
  recipientId: string;
  onNotificationClick?: (n: ClientNotification) => void;
}

interface PropsClient {
  mode: 'client_session';
  sessionToken: string;
  brandColor?: string;
  onNotificationClick?: (n: ClientNotification) => void;
}

type Props = PropsStaff | PropsClient;

export default function NotificationInbox(props: Props) {
  const [open, setOpen]               = useState(false);
  const [items, setItems]             = useState<ClientNotification[]>([]);
  const [loading, setLoading]         = useState(false);
  const ref                            = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((n) => !n.read_at).length;
  const accent = props.mode === 'client_session' ? (props.brandColor || '#8b5cf6') : '#8b5cf6';

  const load = useCallback(async () => {
    setLoading(true);
    if (props.mode === 'staff') {
      const r = await listNotifications({
        recipientType: 'staff', recipientId: props.recipientId,
        projectId: props.projectId, limit: 30,
      });
      setItems(r.notifications);
    } else {
      const r = await clientSessionListNotifications({ sessionToken: props.sessionToken, limit: 30 });
      setItems(r.notifications);
    }
    setLoading(false);
  }, [props]);

  /* Initial + polling */
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  /* Click outside */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleItemClick = async (n: ClientNotification) => {
    if (!n.read_at) {
      if (props.mode === 'staff') {
        await markNotificationRead({ id: n.id, recipientType: 'staff', recipientId: props.recipientId });
      } else {
        await clientSessionMarkNotificationRead({ sessionToken: props.sessionToken, id: n.id });
      }
      setItems((prev) => prev.map((p) => p.id === n.id ? { ...p, read_at: new Date().toISOString() } : p));
    }
    if (props.onNotificationClick) props.onNotificationClick(n);
    setOpen(false);
  };

  const markAllRead = async () => {
    if (props.mode === 'staff') {
      await markNotificationRead({ recipientType: 'staff', recipientId: props.recipientId, all: true });
    } else {
      await clientSessionMarkNotificationRead({ sessionToken: props.sessionToken, all: true });
    }
    setItems((prev) => prev.map((p) => ({ ...p, read_at: p.read_at || new Date().toISOString() })));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ backgroundColor: accent }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-hidden bg-card border border-border rounded-2xl shadow-2xl z-50 flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-bold">Notifications</div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-muted-foreground hover:text-foreground">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && (
              <div className="text-center py-6">
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="text-center py-10">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500/30 mb-2" />
                <div className="text-xs text-muted-foreground">All caught up</div>
              </div>
            )}

            {!loading && items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full text-left px-4 py-3 border-b border-border/40 hover:bg-muted/20 ${
                  !n.read_at ? 'bg-card/80' : 'opacity-70'
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: accent }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground">{n.title}</div>
                    {n.body && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground/70 mt-1">
                      {new Date(n.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
