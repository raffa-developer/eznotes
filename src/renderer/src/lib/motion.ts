export function scrollElementIntoView(
  element: Element | null,
  options: Omit<ScrollIntoViewOptions, 'behavior'> = {}
): void {
  if (!element) return
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({
    ...options,
    behavior: reduceMotion ? 'auto' : 'smooth'
  })
}
