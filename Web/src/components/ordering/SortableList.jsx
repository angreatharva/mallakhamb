import { useState } from 'react';
import PropTypes from 'prop-types';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { alpha } from '@/styles/tokens';

/**
 * Drag-to-reorder list, built on framer-motion's `Reorder` (already a
 * dependency — no drag-and-drop library was added for this).
 *
 * Dragging is driven by an explicit grip handle (`useDragControls` +
 * `dragListener={false}`) rather than by the whole row. Making the row itself
 * draggable means giving it `touch-action: none`, which on a judge's tablet
 * kills scrolling for the entire list — and these lists are long enough to
 * scroll. Only the grip swallows touch, so the rest of the row still scrolls
 * the page. The grip is a 44px target, matching MIN_TOUCH_TARGET.
 *
 * The component is uncontrolled between drags: `Reorder.Group` re-orders
 * locally on every pointer move, and `onReorder` fires continuously during the
 * drag. Persisting on every one of those would be a request per pixel, so the
 * commit is deferred to `onCommit`, fired once on pointer-up.
 */
const SortableList = ({
  items,
  onReorder,
  onCommit,
  getKey,
  renderItem,
  disabled = false,
  accent = '#A855F7',
  emptyMessage = 'Nothing to order yet.',
}) => {
  const [draggingKey, setDraggingKey] = useState(null);

  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-fg-muted py-6 text-center">{emptyMessage}</p>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={disabled ? () => {} : onReorder}
      className="space-y-2 list-none p-0 m-0"
    >
      {items.map((item, index) => (
        <SortableRow
          key={getKey(item)}
          item={item}
          index={index}
          disabled={disabled}
          accent={accent}
          isDragging={draggingKey === getKey(item)}
          onDragStart={() => setDraggingKey(getKey(item))}
          onDragEnd={() => {
            setDraggingKey(null);
            // Committed here, not in onReorder: onReorder fires on every
            // pointer move while the row is in flight.
            onCommit?.();
          }}
        >
          {renderItem(item, index)}
        </SortableRow>
      ))}
    </Reorder.Group>
  );
};

const SortableRow = ({ item, disabled, accent, isDragging, onDragStart, onDragEnd, children }) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="rounded-xl border flex items-stretch gap-2 overflow-hidden"
      style={{
        background: isDragging ? `${alpha(accent, 0x18)}` : 'rgba(255,255,255,0.03)',
        borderColor: isDragging ? `${alpha(accent, 0x60)}` : 'rgba(255,255,255,0.08)',
        cursor: disabled ? 'default' : 'grab',
        position: 'relative',
        // Lift the row being dragged above its neighbours, otherwise it slides
        // underneath them and looks like it vanished.
        zIndex: isDragging ? 10 : 1,
      }}
    >
      {!disabled && (
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={(event) => {
            // Required for the handle to take over the drag. Without it the
            // pointer stream goes to the page and nothing moves.
            event.preventDefault();
            controls.start(event);
          }}
          className="flex-shrink-0 flex items-center justify-center px-2 min-w-[44px] min-h-[44px] transition-colors hover:bg-ink/5"
          // Only the handle blocks native touch scrolling — see the note at
          // the top of this file.
          style={{ touchAction: 'none', cursor: 'grab', color: 'var(--fg-muted)' }}
        >
          <GripVertical className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
      <div className="flex-1 min-w-0 py-2 pr-3">{children}</div>
    </Reorder.Item>
  );
};

SortableRow.propTypes = {
  item: PropTypes.any.isRequired,
  disabled: PropTypes.bool,
  accent: PropTypes.string,
  isDragging: PropTypes.bool,
  onDragStart: PropTypes.func,
  onDragEnd: PropTypes.func,
  children: PropTypes.node,
};

SortableList.propTypes = {
  /** Rows to display, already in the order they should render. */
  items: PropTypes.array.isRequired,
  /** Called with the reordered array on every pointer move during a drag. */
  onReorder: PropTypes.func.isRequired,
  /** Called once when the drag ends — persist here, not in onReorder. */
  onCommit: PropTypes.func,
  /** Stable React key / identity for a row. */
  getKey: PropTypes.func.isRequired,
  /** Row body renderer: (item, index) => node. */
  renderItem: PropTypes.func.isRequired,
  /** Hides the grip and ignores reorders (read-only viewers). */
  disabled: PropTypes.bool,
  accent: PropTypes.string,
  emptyMessage: PropTypes.string,
};

export default SortableList;
