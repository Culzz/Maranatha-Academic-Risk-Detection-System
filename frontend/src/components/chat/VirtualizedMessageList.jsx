/**
 * Virtualized chat message list using react-window v2.
 * Renders only visible messages for performance with large chat histories.
 */
import { useRef, useEffect, useCallback } from "react";
import { List, useDynamicRowHeight, useListRef } from "react-window";

const DEFAULT_ROW_HEIGHT = 80;
const OVERSCAN = 5;

function MessageRowComponent({ index, style, data }) {
  const { messages, renderMessage, rowRef } = data;
  const msg = messages[index];

  return (
    <div style={style}>
      <div ref={rowRef}>
        {renderMessage(msg, index)}
      </div>
    </div>
  );
}

export default function VirtualizedMessageList({
  messages,
  renderMessage,
  height = 500,
  width = "100%",
}) {
  const listRef = useListRef();
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      try {
        listRef.current.scrollToItem(messages.length - 1);
      } catch {
        // scrollToItem may not be available yet
      }
    }
  }, [messages.length, listRef]);

  if (messages.length === 0) return null;

  return (
    <List
      ref={listRef}
      height={height}
      width={width}
      rowCount={messages.length}
      rowHeight={dynamicRowHeight}
      overscanCount={OVERSCAN}
      rowComponent={MessageRowComponent}
      rowProps={{
        messages,
        renderMessage,
        rowRef: dynamicRowHeight.resetAfterIndex
          ? undefined
          : undefined,
      }}
    />
  );
}
