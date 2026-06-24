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
  priorityHigh: { bg: '#FEF2F2', bgStrong: '#FECACA', text: '#b91c1c' },
  priorityMedium: { bg: '#FFFBEB', bgStrong: '#FDE68A', text: '#b45309' },
  priorityLow: { bg: '#F0FDF4', bgStrong: '#BBF7D0', text: '#15803d' },
  priorityTbd: { bg: '#F5F3FF', bgStrong: '#DDD6FE', text: '#7c3aed' },
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
  pill: 9999,
}

export const typography = {
  body: { fontSize: 13, lineHeight: 18, color: colors.textPrimary } as const,
  bodyMuted: { fontSize: 11, lineHeight: 15, color: colors.textSecondary } as const,
  caption: { fontSize: 10, lineHeight: 14, color: colors.textTertiary } as const,
  button: { fontSize: 13, lineHeight: 18, color: colors.textPrimary } as const,
  heading: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, color: colors.textPrimary } as const,
}
