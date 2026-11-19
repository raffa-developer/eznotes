import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destinationRoot = path.join(root, 'vendor', 'sherpa')
const wrapperVersion = JSON.parse(
  fs.readFileSync(
    path.join(root, 'node_modules', 'sherpa-onnx-node', 'package.json'),
    'utf8'
  )
).version

const platform = process.platform === 'win32' ? 'win' : process.platform
const requested = process.argv.slice(2)
const targets = requested.length ? requested : defaultTargets()

function defaultTargets() {
  if (platform === 'darwin') return ['darwin-x64', 'darwin-arm64']
  if (platform === 'linux') return ['linux-x64', 'linux-arm64']
  return [`${platform}-${process.arch}`]
}

const ARCHES = new Set(['x64', 'arm64', 'ia32'])
const PLATFORMS = new Set(['win', 'darwin', 'linux'])

for (const target of targets) {
  const separator = target.lastIndexOf('-')
  const targetPlatform = target.slice(0, separator)
  const arch = target.slice(separator + 1)
  if (!PLATFORMS.has(targetPlatform) || !ARCHES.has(arch)) {
    throw new Error(`Unsupported sherpa target: ${target}`)
  }
  await fetchPackage(`sherpa-onnx-${target}`, target)
}

console.log(`[fetch-sherpa] ready: ${targets.join(', ')}`)

async function fetchPackage(name, target) {
  const destination = path.join(destinationRoot, name)
  const marker = path.join(destination, 'VERSION')
  if (
    fs.existsSync(marker) &&
    fs.readFileSync(marker, 'utf8').trim() === wrapperVersion
  ) {
    console.log(`[fetch-sherpa] already present: ${name}`)
    return
  }

  const metadataResponse = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${wrapperVersion}`
  )
  if (!metadataResponse.ok) {
    throw new Error(`Could not resolve ${name}@${wrapperVersion}.`)
  }
  const metadata = await metadataResponse.json()
  const tarball = metadata.dist?.tarball
  const integrity = metadata.dist?.integrity
  if (!tarball || !integrity?.startsWith('sha512-')) {
    throw new Error(`No verified tarball for ${name}@${wrapperVersion}.`)
  }

  console.log(`[fetch-sherpa] downloading ${name}@${wrapperVersion}...`)
  const response = await fetch(tarball)
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${tarball}`)
  }
  const archive = Buffer.from(await response.arrayBuffer())
  const actual = crypto
    .createHash('sha512')
    .update(archive)
    .digest('base64')
  if (`sha512-${actual}` !== integrity) {
    throw new Error(`Checksum mismatch for ${name}.`)
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eznotes-sherpa-'))
  const archivePath = path.join(temp, `${name}.tgz`)
  try {
    fs.writeFileSync(archivePath, archive)
    execFileSync('tar', ['-xzf', archivePath, '-C', temp], {
      stdio: 'inherit'
    })
    const extracted = path.join(temp, 'package')
    if (!fs.existsSync(extracted)) {
      throw new Error(`The ${name} archive did not contain a package folder.`)
    }
    fs.rmSync(destination, { recursive: true, force: true })
    fs.mkdirSync(destination, { recursive: true })
    fs.cpSync(extracted, destination, { recursive: true })
    fs.writeFileSync(
      path.join(destination, 'VERSION'),
      `${wrapperVersion}\n`
    )
    if (!fs.existsSync(path.join(destination, 'sherpa-onnx.node'))) {
      throw new Error(`The ${name} archive is missing sherpa-onnx.node.`)
    }
    console.log(`[fetch-sherpa] installed ${target}`)
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}
