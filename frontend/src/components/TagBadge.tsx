import type { Tag } from '../types'

export function TagBadge({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className="tag-badge"
      style={{
        background: tag.color + '18',
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          className="tag-remove-btn"
          onClick={onRemove}
          style={{ color: tag.color }}
        >
          ×
        </button>
      )}
    </span>
  )
}
