import { View, Text as RNText } from 'react-native'
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText } from 'react-native-svg'
import {
  parseISO, format, startOfDay, endOfDay, addHours,
  startOfWeek, endOfWeek, eachDayOfInterval,
  startOfMonth, endOfMonth, eachWeekOfInterval,
  startOfYear, endOfYear, eachMonthOfInterval,
} from 'date-fns'
import type { TimeSeriesPoint } from './lib/replayEngine'

type TimeRange = 'Day' | 'Week' | 'Month' | 'Year' | 'All-Time'

interface Props {
  data: TimeSeriesPoint[]
  targetValue: number
  filledColor: string
  backgroundColor: string
  width: number
  height: number
  range: TimeRange
  periodDate: Date  // the reference date for the selected period
}

interface XLabel { x: number; label: string }

export function ProgressChart({
  data, targetValue, filledColor, backgroundColor, width, height, range, periodDate,
}: Props) {
  if (data.length === 0) {
    return (
      <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#8E8E93', fontSize: 13 }}>Add entries to see your graph</RNText>
      </View>
    )
  }

  const PAD = { top: 12, right: 12, bottom: 28, left: 40 }
  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  // ── Time domain ────────────────────────────────────────────────────────────
  let domainStart: Date
  let domainEnd: Date

  if (range === 'Day') {
    domainStart = startOfDay(periodDate)
    domainEnd = endOfDay(periodDate)
  } else if (range === 'Week') {
    domainStart = startOfWeek(periodDate, { weekStartsOn: 0 })
    domainEnd = endOfWeek(periodDate, { weekStartsOn: 0 })
  } else if (range === 'Month') {
    domainStart = startOfMonth(periodDate)
    domainEnd = endOfMonth(periodDate)
  } else if (range === 'Year') {
    domainStart = startOfYear(periodDate)
    domainEnd = endOfYear(periodDate)
  } else {
    // All-Time: use actual data range
    const dates = data.map(d => parseISO(d.date).getTime())
    domainStart = new Date(Math.min(...dates))
    domainEnd = new Date(Math.max(...dates))
    // Pad slightly
    const span = domainEnd.getTime() - domainStart.getTime()
    if (span === 0) {
      domainStart = new Date(domainStart.getTime() - 86400000)
      domainEnd = new Date(domainEnd.getTime() + 86400000)
    }
  }

  const domainMs = domainEnd.getTime() - domainStart.getTime()

  function scaleX(d: Date) {
    return PAD.left + ((d.getTime() - domainStart.getTime()) / domainMs) * W
  }

  // ── Value domain ───────────────────────────────────────────────────────────
  const values = data.map(d => d.value)
  const minV = Math.min(0, ...values)
  const maxV = Math.max(targetValue > 0 ? targetValue : 0, ...values) * 1.05 || 10

  function scaleY(v: number) {
    return PAD.top + H - ((v - minV) / (maxV - minV)) * H
  }

  // ── Build step-line path from data points ──────────────────────────────────
  // We draw a step chart: value holds constant until next entry
  // Points are at actual datetime positions
  const pts = data.map(d => ({
    x: scaleX(parseISO(d.date)),
    y: scaleY(d.value),
    v: d.value,
  }))

  // Extend last point to edge of domain
  const extendedPts = [...pts, { x: PAD.left + W, y: pts[pts.length - 1].y, v: pts[pts.length - 1].v }]

  // Step line: horizontal then vertical
  let linePath = `M${extendedPts[0].x.toFixed(1)},${extendedPts[0].y.toFixed(1)}`
  for (let i = 1; i < extendedPts.length; i++) {
    // horizontal to next x at current y, then vertical to next y
    linePath += ` L${extendedPts[i].x.toFixed(1)},${extendedPts[i - 1].y.toFixed(1)}`
    linePath += ` L${extendedPts[i].x.toFixed(1)},${extendedPts[i].y.toFixed(1)}`
  }

  const bottomY = PAD.top + H
  const areaPath = linePath +
    ` L${extendedPts[extendedPts.length - 1].x.toFixed(1)},${bottomY.toFixed(1)}` +
    ` L${extendedPts[0].x.toFixed(1)},${bottomY.toFixed(1)} Z`

  // ── Target line ─────────────────────────────────────────────────────────────
  const targetY = targetValue > 0 ? scaleY(targetValue) : null

  // ── X-axis labels ───────────────────────────────────────────────────────────
  let xLabels: XLabel[] = []

  if (range === 'Day') {
    // 12 AM, 6 AM, 12 PM, 6 PM
    xLabels = [0, 6, 12, 18].map(h => ({
      x: scaleX(addHours(startOfDay(periodDate), h)),
      label: h === 0 ? '12 AM' : h === 6 ? '6 AM' : h === 12 ? '12 PM' : '6 PM',
    }))
  } else if (range === 'Week') {
    const days = eachDayOfInterval({ start: domainStart, end: domainEnd })
    // Show every other day
    xLabels = days.filter((_, i) => i % 2 === 0).map(d => ({
      x: scaleX(d),
      label: format(d, 'MMM d'),
    }))
  } else if (range === 'Month') {
    const weeks = eachWeekOfInterval({ start: domainStart, end: domainEnd }, { weekStartsOn: 0 })
    xLabels = weeks.map(d => ({
      x: scaleX(d < domainStart ? domainStart : d),
      label: format(d < domainStart ? domainStart : d, 'MMM d'),
    }))
  } else if (range === 'Year') {
    const months = eachMonthOfInterval({ start: domainStart, end: domainEnd })
    // Show Jan, Apr, Jul, Oct
    xLabels = months.filter(m => [0, 3, 6, 9].includes(m.getMonth())).map(m => ({
      x: scaleX(m),
      label: format(m, 'MMM'),
    }))
  } else {
    // All-Time: up to 5 evenly-spaced ticks
    const ticks = 5
    xLabels = Array.from({ length: ticks }, (_, i) => {
      const t = new Date(domainStart.getTime() + (domainMs * i) / (ticks - 1))
      return { x: scaleX(t), label: format(t, 'MMM d') }
    })
  }

  // ── Y-axis labels (right side, matching Apple Health style) ────────────────
  const yTicks = 4
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = minV + (maxV - minV) * (i / yTicks)
    return { y: scaleY(v), label: Math.round(v).toString() }
  }).reverse() // top-to-bottom

  return (
    <View>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={filledColor} stopOpacity={0.4} />
            <Stop offset="100%" stopColor={filledColor} stopOpacity={0.05} />
          </LinearGradient>
        </Defs>

        {/* Horizontal grid lines */}
        {yLabels.map((l, i) => (
          <Line
            key={`grid-${i}`}
            x1={PAD.left} y1={l.y} x2={PAD.left + W} y2={l.y}
            stroke="#E5E5EA" strokeWidth={0.5}
          />
        ))}

        {/* Vertical dashed grid lines at x-axis label positions */}
        {xLabels.map((l, i) => (
          <Line
            key={`vgrid-${i}`}
            x1={l.x} y1={PAD.top} x2={l.x} y2={PAD.top + H}
            stroke="#E5E5EA" strokeWidth={0.5} strokeDasharray="3,3"
          />
        ))}

        {/* Area fill */}
        <Path d={areaPath} fill="url(#areaGrad)" />

        {/* Step line */}
        <Path d={linePath} stroke={filledColor} strokeWidth={2} fill="none" strokeLinejoin="round" />

        {/* Target dashed line */}
        {targetY !== null && (
          <Line
            x1={PAD.left} y1={targetY} x2={PAD.left + W} y2={targetY}
            stroke={filledColor} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7}
          />
        )}

        {/* Y axis labels (right-aligned) */}
        {yLabels.map((l, i) => (
          <SvgText
            key={`ylabel-${i}`}
            x={PAD.left + W + 2}
            y={l.y + 4}
            textAnchor="start"
            fontSize={9}
            fill="#8E8E93"
          >
            {l.label}
          </SvgText>
        ))}

        {/* X axis labels */}
        {xLabels.map((l, i) => (
          <SvgText
            key={`xlabel-${i}`}
            x={l.x}
            y={height - 6}
            textAnchor="middle"
            fontSize={9}
            fill="#8E8E93"
          >
            {l.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  )
}
