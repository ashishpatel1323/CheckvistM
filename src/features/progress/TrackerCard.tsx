import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText } from 'react-native-svg'
import { parseISO, format } from 'date-fns'
import { COLOR_PAIRS } from './lib/trackerEncoding'
import { buildTimeSeries } from './lib/replayEngine'
import { useTrackerEntries } from './hooks/useTrackers'
import type { Tracker } from './types'
import { formatDistanceToNow } from 'date-fns'

interface Props {
  tracker: Tracker
  onClick: () => void
}

function MiniChart({ trackerId, initialValue, targetValue, filledColor, backgroundColor }: {
  trackerId: number
  initialValue: number
  targetValue: number
  filledColor: string
  backgroundColor: string
}) {
  const [w, setW] = useState(0)
  const { data: entries = [] } = useTrackerEntries(trackerId)
  const H = 90
  const PAD = { top: 8, right: 8, bottom: 22, left: 36 }

  if (w === 0) {
    return <View style={{ height: H }} onLayout={e => setW(e.nativeEvent.layout.width)} />
  }

  const series = buildTimeSeries(entries, initialValue)
  if (series.length === 0) {
    return <View style={{ height: H, backgroundColor }} onLayout={e => setW(e.nativeEvent.layout.width)} />
  }

  const W = w - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const dates = series.map(d => parseISO(d.date).getTime())
  const domainStart = Math.min(...dates)
  const domainEnd = Math.max(...dates)
  const span = domainEnd - domainStart || 1

  const values = series.map(d => d.value)
  const minV = Math.min(0, ...values)
  const maxV = Math.max(targetValue > 0 ? targetValue : 0, ...values) * 1.05 || 10

  function sx(ms: number) { return PAD.left + ((ms - domainStart) / span) * W }
  function sy(v: number) { return PAD.top + plotH - ((v - minV) / (maxV - minV)) * plotH }

  const pts = series.map(d => ({ x: sx(parseISO(d.date).getTime()), y: sy(d.value) }))
  const ext = [...pts, { x: PAD.left + W, y: pts[pts.length - 1].y }]

  let line = `M${ext[0].x.toFixed(1)},${ext[0].y.toFixed(1)}`
  for (let i = 1; i < ext.length; i++) {
    line += ` L${ext[i].x.toFixed(1)},${ext[i - 1].y.toFixed(1)}`
    line += ` L${ext[i].x.toFixed(1)},${ext[i].y.toFixed(1)}`
  }

  const bottomY = PAD.top + plotH
  const area = line + ` L${ext[ext.length - 1].x.toFixed(1)},${bottomY} L${ext[0].x.toFixed(1)},${bottomY} Z`

  const targetY = targetValue > 0 ? sy(targetValue) : null

  // Y-axis: 3 ticks (min, mid, max)
  const yTicks = [minV, (minV + maxV) / 2, maxV].map(v => ({ y: sy(v), label: Math.round(v).toString() }))

  // X-axis: first and last date
  const xTicks = [
    { x: sx(domainStart), label: format(new Date(domainStart), 'MMM d') },
    { x: sx(domainEnd), label: format(new Date(domainEnd), 'MMM d') },
  ]

  return (
    <View style={{ height: H, backgroundColor }} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Defs>
          <LinearGradient id={`mg${trackerId}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1C1C1E" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#1C1C1E" stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Horizontal grid lines at y ticks */}
        {yTicks.map((t, i) => (
          <Line key={`yg${i}`} x1={PAD.left} y1={t.y} x2={PAD.left + W} y2={t.y}
            stroke="rgba(0,0,0,0.08)" strokeWidth={0.5} />
        ))}

        {/* Target dashed line */}
        {targetY !== null && (
          <Line x1={PAD.left} y1={targetY} x2={PAD.left + W} y2={targetY}
            stroke="#6B6B6B" strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />
        )}

        <Path d={area} fill={`url(#mg${trackerId})`} />
        <Path d={line} stroke="#1C1C1E" strokeWidth={1.5} fill="none" />

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <SvgText key={`yl${i}`} x={PAD.left - 4} y={t.y + 3.5}
            fontSize={8} fill="rgba(0,0,0,0.45)" textAnchor="end">
            {t.label}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xTicks.map((t, i) => (
          <SvgText key={`xl${i}`} x={t.x} y={H - 4}
            fontSize={8} fill="rgba(0,0,0,0.45)"
            textAnchor={i === 0 ? 'start' : 'end'}>
            {t.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  )
}

export function TrackerCard({ tracker, onClick }: Props) {
  const { meta, currentValue, name, lastUpdatedAt, taskId } = tracker
  const { filled, background, text } = COLOR_PAIRS[meta.colorKey]
  const pct = meta.targetValue > 0
    ? Math.min(100, (currentValue / meta.targetValue) * 100)
    : 0

  const show = (field: string) => meta.displayFields.includes(field as never)

  return (
    <Pressable
      onPress={onClick}
      style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: background, minHeight: 80, flex: 1 }}
    >
      {/* Mini sparkline chart */}
      <MiniChart
        trackerId={taskId}
        initialValue={meta.initialValue}
        targetValue={meta.targetValue}
        filledColor={filled}
        backgroundColor={background}
      />

      {/* Labels + thin progress bar */}
      <View
        style={{
          backgroundColor: filled,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        {show('name') && (
          <Text style={{ fontSize: 13, fontWeight: '700', color: text, lineHeight: 17 }}>{name}</Text>
        )}
        {show('values') && (
          <Text style={{ fontSize: 11, color: text, opacity: 0.9, marginTop: 1 }}>
            {currentValue}{meta.unit ? ` ${meta.unit}` : ''} / {meta.targetValue}{meta.unit ? ` ${meta.unit}` : ''}
          </Text>
        )}
        {show('percentage') && (
          <Text style={{ fontSize: 11, color: text, opacity: 0.85 }}>{pct.toFixed(1)}%</Text>
        )}
        {show('lastUpdated') && lastUpdatedAt && (
          <Text style={{ fontSize: 10, color: text, opacity: 0.7, marginTop: 1 }}>
            {formatDistanceToNow(new Date(lastUpdatedAt), { addSuffix: true })}
          </Text>
        )}
        {show('remaining') && (
          <Text style={{ fontSize: 10, color: text, opacity: 0.8, marginTop: 1 }}>
            {meta.targetValue - currentValue} left
          </Text>
        )}
        {/* Thin progress line */}
        <View style={{ marginTop: 8, height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 }}>
          <View style={{ width: `${pct}%` as `${number}%`, height: 3, backgroundColor: text, borderRadius: 2, opacity: 0.75 }} />
        </View>
      </View>
    </Pressable>
  )
}
