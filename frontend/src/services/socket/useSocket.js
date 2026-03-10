import { useEffect, useState, useCallback } from "react";
import { getSocket, disconnectSocket } from "./socketClient";
import { EVENTS } from "./socketEvents";

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    const socket = getSocket();

    socket.on(EVENTS.CONNECT, () => setConnected(true));
    socket.on(EVENTS.DISCONNECT, () => setConnected(false));
    socket.on(EVENTS.RESULT, (data) => setResults(data));

    return () => {
      socket.off(EVENTS.CONNECT);
      socket.off(EVENTS.DISCONNECT);
      socket.off(EVENTS.RESULT);
      disconnectSocket();
    };
  }, []);

  const sendFrame = useCallback((base64Frame) => {
    const socket = getSocket();
    socket.emit(EVENTS.SEND_FRAME, { image: base64Frame });
  }, []);

  return { connected, results, sendFrame };
}
