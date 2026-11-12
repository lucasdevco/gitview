import { type GraphRow, laneColor } from "./graph"

export const ROW_HEIGHT = 24
export const LANE_WIDTH = 13

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2 + 6

/**
 * Draws one row of the commit graph. `hollow` marks HEAD with an open circle;
 * `virtual` styles a node that is not a commit (dashed, muted).
 */
export function GraphCell({
  row,
  width,
  hollow,
  virtual,
}: {
  row: GraphRow
  width: number
  hollow?: boolean
  virtual?: boolean
}) {
  const mid = ROW_HEIGHT / 2
  const color = laneColor(row.color)
  return (
    <svg width={width} height={ROW_HEIGHT} aria-hidden="true" className="block overflow-hidden">
      {row.segments.map((segment) => {
        const y1 = segment.half === "top" ? 0 : mid
        const y2 = segment.half === "top" ? mid : ROW_HEIGHT
        const x1 = laneX(segment.fromLane)
        const x2 = laneX(segment.toLane)
        const bend = (y2 - y1) / 3
        const path =
          x1 === x2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} L${x1},${y1 + bend} L${x2},${y2 - bend} L${x2},${y2}`
        return (
          <path
            key={`${segment.half}-${segment.fromLane}-${segment.toLane}`}
            d={path}
            fill="none"
            stroke={laneColor(segment.color)}
            strokeWidth={1.75}
            strokeDasharray={virtual && segment.half === "bottom" ? "3 2" : undefined}
          />
        )
      })}
      {virtual || hollow ? (
        <circle
          cx={laneX(row.lane)}
          cy={mid}
          r={4}
          fill="var(--background)"
          stroke={virtual ? "var(--muted-foreground)" : color}
          strokeWidth={2}
        />
      ) : (
        <circle cx={laneX(row.lane)} cy={mid} r={3.5} fill={color} />
      )}
    </svg>
  )
}

/** Width of the graph column for rows spanning at most `lanes` lanes. */
export function graphColumnWidth(lanes: number): number {
  return Math.min(Math.max(lanes * LANE_WIDTH + 10, 64), 360)
}
