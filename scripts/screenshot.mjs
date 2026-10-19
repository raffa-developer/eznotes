import fs from 'node:fs'

const port = process.env.CDP_PORT || '9222'
const output = process.argv[2] || 'screenshots/app.png'
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const target = targets.find((item) => item.type === 'page')
if (!target) throw new Error('No page target')

const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let nextId = 1

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const entry = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
    else entry.resolve(message.result)
  }
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

await send('Page.enable')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Emulation.setDeviceMetricsOverride', {
  width: 1360,
  height: 820,
  deviceScaleFactor: 1,
  mobile: false
})
const result = await send('Page.captureScreenshot', {
  format: 'png',
  fromSurface: false,
  captureBeyondViewport: false
})

fs.mkdirSync(output.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
fs.writeFileSync(output, Buffer.from(result.data, 'base64'))
console.log(output)
socket.close()
