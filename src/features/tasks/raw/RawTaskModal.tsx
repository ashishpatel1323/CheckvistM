import { Linking } from 'react-native'

interface Props {
  checklistId: number
  taskId: number
  onClose: () => void
}

export function RawTaskModal({ checklistId, taskId, onClose }: Props) {
  const url = `https://checkvist.com/checklists/${checklistId}#task_${taskId}`
  // Open in the device browser — no WebView needed.
  Linking.openURL(url)
  onClose()
  return null
}
