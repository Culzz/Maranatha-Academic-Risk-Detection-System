import { List } from "react-window";
import { useRef } from "react";

function TableRow({ index, style, ariaAttributes, data, columns, onRowClick }) {
  const safeData = Array.isArray(data) ? data : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const item = safeData[index] || {};

  return (
    <div
      {...ariaAttributes}
      style={style}
      className={`flex items-center border-b border-gray-100 ${
        onRowClick ? "cursor-pointer hover:bg-gray-50" : ""
      } ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
      onClick={() => onRowClick?.(item, index)}
    >
      {safeColumns.map((col) => (
        <div
          key={col.key}
          className="px-3 py-2 text-sm truncate"
          style={{ width: col.width || 150, minWidth: col.width || 150 }}
          title={typeof item[col.key] === "string" ? item[col.key] : undefined}
        >
          {col.render ? col.render(item[col.key], item, index) : (item[col.key] ?? "-")}
        </div>
      ))}
    </div>
  );
}

export default function VirtualizedTable({
  data = [],
  columns = [],
  rowHeight = 48,
  maxHeight = 600,
  onRowClick,
  emptyMessage = "No data available.",
  className = "",
}) {
  const listRef = useRef(null);
  const safeData = Array.isArray(data) ? data : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRowProps = {
    data: safeData,
    columns: safeColumns,
    onRowClick: typeof onRowClick === "function" ? onRowClick : undefined,
  };

  const totalWidth = safeColumns.reduce((sum, col) => sum + (col.width || 150), 0);
  const listHeight = Math.min(safeData.length * rowHeight, maxHeight);

  if (!safeData.length || !safeColumns.length) {
    return <div className="text-center py-12 text-gray-500">{emptyMessage}</div>;
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      <div
        className="flex bg-navy-800 text-white font-medium text-sm sticky top-0 z-10"
        style={{ minWidth: totalWidth }}
      >
        {safeColumns.map((col) => (
          <div
            key={col.key}
            className="px-3 py-3"
            style={{ width: col.width || 150, minWidth: col.width || 150 }}
          >
            {col.label}
          </div>
        ))}
      </div>

      <div style={{ minWidth: totalWidth }}>
        <List
          listRef={listRef}
          rowComponent={TableRow}
          rowCount={safeData.length}
          rowHeight={rowHeight}
          rowProps={safeRowProps}
          overscanCount={5}
          style={{ height: listHeight, width: "100%" }}
        />
      </div>

      <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
        {safeData.length} row{safeData.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
