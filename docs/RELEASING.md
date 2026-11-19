# Releasing ezNotes on Windows

## Local installer

```powershell
npm run pack   # unpacked app in release\win-unpacked
npm run dist   # NSIS installer in release\
```

The installer is unsigned unless electron-builder receives a signing
certificate. A local unsigned build may trigger SmartScreen or an Application
Control policy.

## Signing

Set these repository secrets to sign release builds:

| Secret | Value |
| --- | --- |
| `WINDOWS_CSC_LINK` | Base64-encoded PFX certificate or a URL electron-builder can download |
| `WINDOWS_CSC_KEY_PASSWORD` | Password for the PFX file |

When both secrets are present, the workflow reports the build as `signed` and
electron-builder signs the executable and installer. When either is missing,
the build is published as `unsigned` and the release notes include the
SmartScreen warning.

## Release workflow

`.github/workflows/release.yml` runs on:

- a `v*` tag, which uploads the tested installer to a GitHub release
- manual dispatch, which still builds and uploads a workflow artifact

The Windows job runs `npm ci`, `typecheck`, `test`, and `npm run dist`, then:

1. Installs the NSIS package silently into a temporary folder.
2. Verifies the installed `ezNotes.exe`.
3. Launches it for eight seconds with a temporary profile.
4. Reinstalls over the existing installation to check the upgrade path.
5. Runs the silent uninstaller and verifies the executable is gone.

The local equivalent is:

```powershell
$installer = Get-ChildItem release -Filter '*.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
./scripts/smoke-windows-install.ps1 -Installer $installer.FullName
```

## Publishing a release

1. Update `package.json` and the README version.
2. Run the local checks: `npm run typecheck`, `npm test`, `npm run build`.
3. Commit the version bump.
4. Push a tag such as `v0.5.3`.
5. Watch the Windows release workflow and confirm the artifact is named
   `ezNotes-signed-...` or `ezNotes-unsigned-...`.
6. Download and install the release asset once on a clean Windows profile.

Auto-update delivery is not configured yet. The release assets include the
installer, blockmap, and `latest.yml` so an updater can be added later without
changing the release shape.
