import fs from 'node:fs'

let expression = process.argv.slice(2).join(' ') || 'document.body.innerText'
if (expression.startsWith('@')) {
  expression = fs.readFileSync(expression.slice(1), 'utf8')
}

const cdpPort = process.env.CDP_PORT || '9222'
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()
const target = targets.find(
  (item) =>
    item.type === 'page' &&
    (!process.env.CDP_TARGET || item.url.includes(process.env.CDP_TARGET))
)
if (!target) {
  console.error('No page target found')
  process.exit(1)
}

const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
const events = []
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
    return
  }
  events.push(message)
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

await send('Runtime.enable')
await send('Log.enable')
const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
  userGesture: true
})

const value = result?.result?.value
console.log(typeof value === 'string' ? value : JSON.stringify(value ?? result, null, 2))

await new Promise((resolve) => setTimeout(resolve, 600))

for (const event of events) {
  if (event.method === 'Runtime.exceptionThrown') {
    console.error('EXCEPTION:', JSON.stringify(event.params.exceptionDetails, null, 2))
  }
  if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)) {
    console.error(
      `CONSOLE ${event.params.type}:`,
      event.params.args.map((arg) => arg.value ?? arg.description).join(' ')
    )
  }
  if (event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level)) {
    console.error(`LOG ${event.params.entry.level}:`, event.params.entry.text)
  }
}

socket.close()
