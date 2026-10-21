export interface HotkeyOption {
  value: string
  label: string
}

export const HOTKEY_OPTIONS: HotkeyOption[] = [
  { value: 'Control+Alt+Shift+R', label: 'Ctrl + Alt + Shift + R' },
  { value: 'Control+Shift+R', label: 'Ctrl + Shift + R' },
  { value: 'Control+Alt+F9', label: 'Ctrl + Alt + F9' },
  { value: 'Control+Shift+Space', label: 'Ctrl + Shift + Space' }
]

export const DEFAULT_HOTKEY = HOTKEY_OPTIONS[0].value
