export const colors = {
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F9FAFB',
  bgTertiary: '#F3F4F6',
  border: '#E5E7EB',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  primary: '#4772FA',
  primaryHover: '#3A5FD9',
  surfaceHighlight: '#EEF2FF',
  surfaceElevated: '#FFFFFF',
  shadowSubtle: 'rgba(0,0,0,0.06)',
  shadowMedium: 'rgba(0,0,0,0.12)',
  // Priority palette (maps to PriorityPicker's BUCKET_META)
  priorityHigh: { bg: '#FBF0F0', bgStrong: '#F8E3E3', text: '#DC7070', border: '#F3DADA' },
  priorityMedium: { bg: '#FBF6EC', bgStrong: '#F8EDD6', text: '#D8A14A', border: '#F1E4CB' },
  priorityLow: { bg: '#EEF7F1', bgStrong: '#DEEFE4', text: '#5FA97E', border: '#D4E9DC' },
  priorityTbd: { bg: '#F4F1FB', bgStrong: '#E9E1F5', text: '#9277C4', border: '#E3DBF2' },
  // Time palette (maps to TIME_QUADRANTS)
  timeTbd: { bg: '#F9FAFB', bgStrong: '#E5E7EB', text: '#6B7280' },
  timeQuick: { bg: '#EFF6FF', bgStrong: '#BFDBFE', text: '#0369a1' },
  timeShort: { bg: '#ECFEFF', bgStrong: '#A5F3FC', text: '#0891b2' },
  timeLong: { bg: '#FFFBEB', bgStrong: '#FDE68A', text: '#b45309' },
}

export const radii = {
  sm: 6,
  md: 8,
  lg: 10,
  card: 14,
  pill: 9999,
}

// 4px-based spacing scale (additive — keeps magic numbers out of components)
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
}

// Routines-tab revamp constants. Accent colors still come from ROUTINE_COLORS.
export const routineUI = {
  cardRadius: radii.card,
  cardGap: 12,            // gutter between cards in the responsive grid
  headerTintAlpha: '14',  // hex alpha appended to accent color for the soft header wash
  rowDivider: colors.border,
  cardShadow: colors.shadowSubtle,
  // Responsive grid breakpoints (logical px width → column count)
  twoColMin: 768,
  threeColMin: 1180,
}

export const typography = {
  body: { fontSize: 13, lineHeight: 18, color: colors.textPrimary } as const,
  bodyMuted: { fontSize: 11, lineHeight: 15, color: colors.textSecondary } as const,
  caption: { fontSize: 10, lineHeight: 14, color: colors.textTertiary } as const,
  button: { fontSize: 13, lineHeight: 18, color: colors.textPrimary } as const,
  heading: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, color: colors.textPrimary } as const,
}
