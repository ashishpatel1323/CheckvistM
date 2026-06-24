import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional + conflicting Tailwind/NativeWind class names into one string. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
