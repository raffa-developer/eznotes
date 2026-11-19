# Releasing ezNotes

## Local packages

```bash
npm run pack        # unpacked app for the current platform
npm run dist        # installer/package for the current platform
npm run dist:win    # Windows NSIS installer
npm run dist:mac    # macOS .dmg and .zip, x64 and arm64
npm run dist:linux  # Linux AppImage and .deb
```

Packages land in `release/`. `npm run dist:mac` and `npm run dist:linux` fetch
the matching sherpa native packages; the diarization worker runs through
Electron's built-in Node mode, so no separate Node runtime is bundled.

Unsigned packages may be blocked by SmartScreen on Windows or Gatekeeper on
macOS. Linux packages are not code-signed.

## Signing

| Platform | Secrets | Notes |
| --- | --- | --- |
| Windows | `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD` | PFX file or URL accepted by electron-builder |
| macOS | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` | Developer ID Application certificate |

When Windows secrets are missing, the workflow names the artifact
`ezNotes-windows-unsigned-...` and logs a warning. macOS builds without a
certificate are unsigned and require Gatekeeper approval on first launch.

macOS notarization is not configured yet. Add notarization credentials before
distributing a signed macOS build without Gatekeeper warnings.

## Release workflow

`.github/workflows/release.yml` runs on:

- a `v*` tag, which builds Windows, macOS, Linux, and publishes all packages to
  one GitHub release
- manual dispatch, which builds and uploads workflow artifacts without creating
  a release

The Windows job:

1. Installs the NSIS package silently into a temporary folder.
2. Verifies the installed `ezNotes.exe`.
3. Launches it for eight seconds with a temporary profile.
4. Reinstalls over the existing installation to check the upgrade path.
5. Runs the silent uninstaller and verifies the executable is gone.

macOS builds x64 and arm64 packages on the current macOS runner. Linux builds
AppImage and `.deb`.

## Local Windows smoke test

```powershell
$installer = Get-ChildItem release -Filter '*.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
./scripts/smoke-windows-install.ps1 -Installer $installer.FullName
```

## Publishing a release

1. Update `package.json`, `package-lock.json`, and the README version.
2. Run `npm run typecheck`, `npm test`, and `npm run build`.
3. Commit the version bump.
4. Push a tag such as `v0.6.1`.
5. Watch the release workflow and confirm Windows, macOS, and Linux assets.
6. Install each platform package once on a clean profile.

Auto-update delivery is not configured yet. The release assets include the
Windows installer, blockmap, and `latest.yml` so an updater can be added later.
