const path = require('node:path')

module.exports = async function notarizeMacApp(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      '[notarize] Apple credentials are not configured; skipping notarization.'
    )
    return
  }

  const { notarize } = await import('@electron/notarize')
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  console.log(`[notarize] notarizing ${appPath}`)
  await notarize({
    appPath,
    appleId,
    appleIdPassword,
    teamId
  })
  console.log('[notarize] notarization complete')
}
