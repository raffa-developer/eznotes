import { common } from './pt.common'
import { appShell } from './pt.appShell'
import { dashboard } from './pt.dashboard'
import { live } from './pt.live'
import { island } from './pt.island'
import { library } from './pt.library'
import { note } from './pt.note'
import { schedule } from './pt.schedule'
import { settings } from './pt.settings'

export const pt: Record<string, string> = {
  ...common,
  ...appShell,
  ...dashboard,
  ...live,
  ...island,
  ...library,
  ...note,
  ...schedule,
  ...settings
}
