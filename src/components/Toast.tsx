import { useEffect, createContext, useContext, useState } from 'react'
import { View, Text, Pressable, Platform } from 'react-native'
import { create } from 'zustand'
import { CheckCircle, XCircle, Info, X } from 'lucide-react-native'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  const { addToast } = useToastStore()
  return {
    success: (msg: string) => addToast(msg, 'success'),
    error: (msg: string) => addToast(msg, 'error'),
    info: (msg: string) => addToast(msg, 'info'),
  }
}

const iconColor: Record<ToastType, string> = {
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
}

const bgClass: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  info: 'bg-blue-50 border-blue-200',
}

const textClass: Record<ToastType, string> = {
  success: 'text-green-800',
  error: 'text-red-800',
  info: 'text-blue-800',
}

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useToastStore()

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), 3000)
    return () => clearTimeout(timer)
  }, [toast.id, removeToast])

  const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? XCircle : Info

  return (
    <View className={`flex-row items-start gap-3 px-4 py-3 rounded-xl border mb-2 ${bgClass[toast.type]}`}
      style={{ shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 }}
    >
      <Icon size={16} color={iconColor[toast.type]} />
      <Text className={`text-sm font-medium flex-1 ${textClass[toast.type]}`}>{toast.message}</Text>
      <Pressable onPress={() => removeToast(toast.id)}>
        <X size={14} color="#9ca3af" />
      </Pressable>
    </View>
  )
}

export function ToastContainer() {
  const { toasts } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <View className="absolute top-12 right-4 z-50 w-80" style={{ maxWidth: '90%' }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </View>
  )
}

// Context-based provider so ToastContainer renders inside the root
const ToastContext = createContext<null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastContext.Provider value={null}>
      <View className="flex-1">
        {children}
        <ToastContainer />
      </View>
    </ToastContext.Provider>
  )
}
