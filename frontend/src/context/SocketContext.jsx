import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001';

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (user?.role !== 'admin' || !token) {
      return undefined;
    }
    const client = io(SOCKET_URL, { transports: ['websocket'], auth: { token } });
    setSocket(client);

    return () => {
      client.disconnect();
      setSocket(null);
    };
  }, [user]);

  const value = useMemo(() => ({ socket }), [socket]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
}
