import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useAccessibleDialog(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const animationFrame = window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(firstFocusable ?? dialogRef.current)?.focus()
    })

    function keepFocusInDialog(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => element.getClientRects().length > 0)
      if (!focusableElements.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInDialog)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', keepFocusInDialog)
      previouslyFocused?.focus()
    }
  }, [open])

  return dialogRef
}