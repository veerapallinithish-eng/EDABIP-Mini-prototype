import { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';

export default function NotificationBell() {
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!socket) return undefined;
    const onActivity = (event) => {
      setNotifications((current) => [event, ...current].slice(0, 8));
      setUnread((current) => current + 1);
    };
    socket.on('activity_update', onActivity);
    return () => socket.off('activity_update', onActivity);
  }, [socket]);

  return (
    <div className="notification-wrap">
      <button
        type="button"
        className="icon-button notification-button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setUnread(0);
        }}
      >
        <span aria-hidden="true">♢</span>
        {unread > 0 && <i>{unread}</i>}
      </button>
      {open && (
        <div className="notification-popover">
          <strong>Notifications</strong>
          {notifications.length ? notifications.map((item, index) => (
            <p key={`${item.action}-${index}`}>{item.action}</p>
          )) : <p>You’re all caught up.</p>}
        </div>
      )}
    </div>
  );
}
