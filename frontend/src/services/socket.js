import { io } from 'socket.io-client';
import useStore from '../store/useStore';

let socket = null;

export const initSocket = () => {
  const token = useStore.getState().token;
  if (!token) return;

  if (socket) socket.disconnect();

  socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000', {
    auth: { token }
  });

  socket.on('connect', () => {
    console.log('Connected to real-time sync');
  });

  socket.on('new_transaction', (transaction) => {
    useStore.getState().receiveSocketTransaction(transaction);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from real-time sync');
  });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
