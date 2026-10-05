import { useEffect, useMemo, useState } from 'react';

function formatRelativeTime(value) {
  if (!value) return 'just now';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

export default function ActivityFeed({ initialActivity = [], socket }) {
  const [liveActivity, setLiveActivity] = useState([]);
  const [, setClock] = useState(0);
  const activity = useMemo(() => {
    const seen = new Set();
    return [...liveActivity, ...initialActivity].filter((event) => {
      const key = event.id || `${event.user_id}-${event.created_at}-${event.action}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);
  }, [initialActivity, liveActivity]);

  useEffect(() => {
    if (!socket) return undefined;
    const onActivity = (event) => {
      setLiveActivity((current) => [
        { ...event, id: event.id || `${event.user_id}-${event.created_at}-${event.action}` },
        ...current,
      ].slice(0, 20));
    };
    socket.on('activity_update', onActivity);
    return () => socket.off('activity_update', onActivity);
  }, [socket]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock((current) => current + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="panel activity-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Live updates</p><h2>Activity feed</h2></div>
        <span className={`live-indicator ${socket?.connected ? 'is-live' : ''}`}>
          <i /> {socket?.connected ? 'Live' : 'Offline'}
        </span>
      </div>
      {activity.length ? (
        <ul className="activity-list">
          {activity.map((event, index) => (
            <li key={event.id || `${event.action}-${index}`}>
              <span className="activity-dot" />
              <div>
                <p>{event.action}</p>
                <span>{event.user_name || 'Platform'} · {formatRelativeTime(event.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="empty-state">No recent activity to show.</p>}
    </section>
  );
}
