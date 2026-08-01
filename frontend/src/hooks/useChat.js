/**
 * useChat — WebSocket hook for real-time chat.
 *
 * Manages WebSocket connection to a specific chat room.
 * Handles typing indicators, reactions, read receipts, poll votes,
 * and broadcasts from other users in the same room.
 *
 * Auto-reconnects on connection loss with a 3-second delay.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const WS_BASE = (window.location.origin)
  .replace("http://", "ws://")
  .replace("https://", "wss://") + "/api";

export default function useChat(roomId) {
  const { token, user } = useAuth();
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [incomingEvent, setIncomingEvent] = useState(null);

  // Connect to WebSocket
  useEffect(() => {
    if (!roomId || !token) return;

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/chat/ws/${roomId}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleIncomingEvent(data);
        } catch {
          // Ignore malformed events
        }
      };

      ws.onclose = (event) => {
        setConnected(false);

        // Auto-reconnect after 3 seconds (unless intentional close)
        if (event.code !== 4001 && event.code !== 4003 && event.code !== 4004 && event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
      }
    };
  }, [roomId, token]);

  // Handle incoming events
  const handleIncomingEvent = useCallback((data) => {
    switch (data.type) {
      case "typing":
        if (data.user_id !== user?.user_id?.toString()) {
          setTypingUsers((prev) => {
            if (!prev.find((u) => u.name === data.user_name)) {
              return [...prev, { name: data.user_name, timestamp: Date.now() }];
            }
            return prev;
          });
          // Clear typing indicator after 3 seconds
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.name !== data.user_name));
          }, 3000);
        }
        break;

      case "user_joined":
      case "user_left":
        setOnlineCount(data.online_count);
        break;

      case "reaction_update":
      case "message_edited":
      case "message_deleted":
      case "pin_update":
      case "poll_update":
      case "rsvp_update":
      case "new_message":
        // Pass these through so the page component can handle them
        setIncomingEvent({ ...data, _ts: Date.now() });
        break;

      default:
        break;
    }
  }, [user]);

  // Send typing indicator
  const sendTyping = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing" }));
    }
  }, []);

  // Send reaction via WebSocket
  const sendReaction = useCallback((messageId, emoji) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "reaction",
        message_id: messageId,
        emoji: emoji,
      }));
    }
  }, []);

  // Send read receipt via WebSocket
  const sendRead = useCallback((lastReadMessageId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "read",
        last_read_message_id: lastReadMessageId,
      }));
    }
  }, []);

  // Send poll vote via WebSocket
  const sendPollVote = useCallback((messageId, optionIdx) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "poll_vote",
        message_id: messageId,
        option_idx: optionIdx,
      }));
    }
  }, []);

  const clearIncomingEvent = useCallback(() => setIncomingEvent(null), []);

  return {
    connected,
    typingUsers,
    onlineCount,
    incomingEvent,
    clearIncomingEvent,
    sendTyping,
    sendReaction,
    sendRead,
    sendPollVote,
  };
}
