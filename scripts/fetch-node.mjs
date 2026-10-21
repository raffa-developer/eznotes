import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(root, 'vendor', 'node')
const nodeExe = path.join(destination, 'node.exe')
const force = process.argv.includes('--force')

// Pinned deliberately: the diarization worker is tested against this runtime.
const version = process.env.EZNOTES_NODE_VERSION ?? 'v24.22.1'

if (fs.existsSync(nodeExe) && !force) {
  console.log(`[fetch-node] already present: ${nodeExe}`)
  process.exit(0)
}

fs.mkdirSync(destination, { recursive: true })

const file = `node-${version}-win-x64.zip`
const downloadUrl = `https://nodejs.org/dist/${version}/${file}`
const checksums = await fetchText(`https://nodejs.org/dist/${version}/SHASUMS256.txt`)
const expected = checksums
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .find((parts) => parts[1] === file)?.[0]
if (!expected) throw new Error(`No checksum for ${file}`)

console.log(`[fetch-node] downloading Node.js ${version} for Windows x64...`)
const response = await fetch(downloadUrl)
if (!response.ok) {
  throw new Error(`Download failed (${response.status}) for ${downloadUrl}`)
}
const archive = Buffer.from(await response.arrayBuffer())

const actual = crypto.createHash('sha256').update(archive).digest('hex')
if (actual !== expected) {
  throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`)
}

const archivePath = path.join(destination, file)
fs.writeFileSync(archivePath, archive)

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-node-'))
try {
  const tar = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'tar.exe')
    : 'tar'
  execFileSync(tar, ['-xf', archivePath, '-C', temp], { stdio: 'inherit' })

  const extracted = path.join(temp, `node-${version}-win-x64`, 'node.exe')
  if (!fs.existsSync(extracted)) {
    throw new Error(`node.exe not found in ${extracted}`)
  }
  fs.copyFileSync(extracted, nodeExe)
  const license = path.join(temp, `node-${version}-win-x64`, 'LICENSE')
  if (fs.existsSync(license)) {
    fs.copyFileSync(license, path.join(destination, 'LICENSE'))
  }
  fs.writeFileSync(path.join(destination, 'VERSION'), `${version}\n`)
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
  fs.rmSync(archivePath, { force: true })
}

console.log(`[fetch-node] ready: ${nodeExe}`)

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`GET ${url} failed (${response.status})`)
  return response.text()
}
