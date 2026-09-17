import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { encodeShareLink } from '../src/store/serialize'
import type { SavedDiagram } from '../src/store/types'

/**
 * Rendering diagrams with the real application.
 *
 * Screenshots and videos come from the same React code a person sees, driven
 * through the window bridge so every frame lands on an exact simulation tick.
 * If no dev server is running, the built `dist/` is served from memory instead,
 * so the visual tools work from a plain checkout.
 */

const CHROME_CANDIDATES = [
  process.env.CLOUDWRIGHT_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean) as string[]

export function findBrowser(): string | null {
  return CHROME_CANDIDATES.find((path) => existsSync(path)) ?? null
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.map': 'application/json',
}

let staticServer: Server | null = null
let staticUrl: string | null = null

/** Serves the production build so visual tools work without `npm run dev`. */
async function serveDist(distDir: string): Promise<string> {
  if (staticUrl) return staticUrl

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    const candidate = resolve(distDir, `.${url}`)
    const file = existsSync(candidate) && extname(candidate) ? candidate : join(distDir, 'index.html')
    try {
      const body = readFileSync(file)
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  staticServer = server
  staticUrl = `http://127.0.0.1:${port}`
  return staticUrl
}

export async function resolveAppUrl(configured: string | undefined, distDir: string): Promise<string> {
  const candidate = configured ?? process.env.CLOUDWRIGHT_APP_URL ?? 'http://localhost:5173'
  try {
    const response = await fetch(candidate, { signal: AbortSignal.timeout(1200) })
    if (response.ok) return candidate
  } catch {
    /* fall through to the built bundle */
  }
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(
      `No running app at ${candidate} and no production build in ${distDir}. Run "npm run dev", or "npm run build" first.`,
    )
  }
  return serveDist(distDir)
}

export interface RenderOptions {
  diagram: SavedDiagram
  /** Ticks to advance before capturing. 0 leaves the simulation stopped. */
  ticks?: number
  width?: number
  height?: number
  scale?: number
  incidents?: { nodeId: string; modeId: string }[]
  loadMultiplier?: number
  attacksEnabled?: boolean
  /** Defaults to dark, which is what the app looks like out of the box. */
  theme?: 'light' | 'dark'
  /** Headline drawn over the canvas — the claim the render is making. */
  title?: string
  /** One line under the title, usually the numbers that prove it. */
  subtitle?: string
}

interface Session {
  browser: Browser
  page: Page
}

async function openSession(appUrl: string, options: RenderOptions): Promise<Session> {
  const executablePath = findBrowser()
  if (!executablePath) {
    throw new Error(
      'No Chrome, Chromium or Edge found. Set CLOUDWRIGHT_BROWSER to a Chromium-based browser executable.',
    )
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--hide-scrollbars'],
  })
  const page = await browser.newPage()
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: options.theme ?? 'dark' }])
  await page.setViewport({
    width: options.width ?? 1440,
    height: options.height ?? 900,
    deviceScaleFactor: options.scale ?? 2,
  })

  const encoded = encodeShareLink(options.diagram)
  await page.goto(`${appUrl}/build?chrome=off&theme=${options.theme ?? 'dark'}&d=${encoded}`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForFunction('window.__cloudwright?.ready === true', { timeout: 15000 })
  await page.waitForSelector('.react-flow__node', { timeout: 15000 })
  // Let the fit-to-view settle before anything is captured.
  await new Promise((r) => setTimeout(r, 500))

  await page.evaluate((opts) => {
    const bridge = (window as unknown as { __cloudwright: Record<string, (...a: unknown[]) => unknown> }).__cloudwright
    bridge.setChromeless(true)
    if (opts.loadMultiplier !== undefined) bridge.setLoadMultiplier(opts.loadMultiplier)
    if (opts.attacksEnabled !== undefined) bridge.setAttacksEnabled(opts.attacksEnabled)
    for (const incident of opts.incidents ?? []) bridge.injectIncident(incident.nodeId, incident.modeId)
  }, { incidents: options.incidents ?? [], loadMultiplier: options.loadMultiplier, attacksEnabled: options.attacksEnabled })

  // Hiding the panels changes the canvas size, so re-frame before capturing.
  await new Promise((r) => setTimeout(r, 250))
  await refit(page)
  await applyCaption(page, options.title, options.subtitle)

  return { browser, page }
}

/**
 * Draws a caption over the canvas in the application's own type, so a render
 * that travels on its own — into a slide, a post, a chat — still says what it
 * is. Fixed position and pointer-events: none, so it never disturbs the layout
 * React Flow is measuring against.
 */
async function applyCaption(page: Page, title?: string, subtitle?: string) {
  if (!title && !subtitle) return
  await page.evaluate((caption) => {
    document.getElementById('cw-caption')?.remove()
    const wrap = document.createElement('div')
    wrap.id = 'cw-caption'
    wrap.style.cssText = [
      'position:fixed', 'inset:0 0 auto 0', 'z-index:2147483647', 'pointer-events:none',
      'padding:34px 44px 44px', 'font-family:var(--font-sans)',
      'background:linear-gradient(180deg, var(--color-void) 30%, transparent 100%)',
    ].join(';')

    if (caption.title) {
      const h = document.createElement('div')
      h.textContent = caption.title
      h.style.cssText = [
        'font-size:32px', 'line-height:1.15', 'font-weight:640',
        'letter-spacing:-0.015em', 'color:var(--color-ink)',
      ].join(';')
      wrap.appendChild(h)
    }
    if (caption.subtitle) {
      const p = document.createElement('div')
      p.textContent = caption.subtitle
      p.style.cssText = [
        'margin-top:10px', 'font-size:18px', 'line-height:1.35',
        'color:var(--color-ink-dim)',
      ].join(';')
      wrap.appendChild(p)
    }
    document.body.appendChild(wrap)
  }, { title: title ?? '', subtitle: subtitle ?? '' })
}

async function stepAndSettle(page: Page, ticks: number) {
  if (ticks <= 0) return
  await page.evaluate((n) => {
    (window as unknown as { __cloudwright: { step: (n: number) => void } }).__cloudwright.step(n)
  }, ticks)
  await new Promise((r) => setTimeout(r, 260))
}

/**
 * Nodes grow a telemetry strip once traffic reaches them, so anything framed
 * before the first tick ends up off-centre. Re-frame after the state settles.
 */
async function refit(page: Page) {
  // Nudge the resize observers first: React Flow frames against the container
  // size it last measured, which may predate the panels being hidden.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await new Promise((r) => setTimeout(r, 120))
  await page.evaluate(() => {
    (window as unknown as { __cloudwright: { refit: () => void } }).__cloudwright.refit()
  })
  await new Promise((r) => setTimeout(r, 400))
}

export async function renderScreenshot(appUrl: string, options: RenderOptions): Promise<{ base64: string; snapshot: unknown }> {
  const { browser, page } = await openSession(appUrl, options)
  try {
    await stepAndSettle(page, options.ticks ?? 0)
    await refit(page)
    await applyCaption(page, options.title, options.subtitle)
    const buffer = await page.screenshot({ type: 'png' })
    const snapshot = await page.evaluate(() =>
      (window as unknown as { __cloudwright: { snapshot: () => unknown } }).__cloudwright.snapshot(),
    )
    return { base64: Buffer.from(buffer).toString('base64'), snapshot }
  } finally {
    await browser.close()
  }
}

export interface VideoOptions extends RenderOptions {
  /** Total simulation ticks to record. */
  frames?: number
  fps?: number
  outputPath?: string
  /** Inject these at the given frame index, so a failure appears mid-run. */
  timeline?: { atFrame: number; nodeId: string; modeId: string }[]
}

export async function renderVideo(appUrl: string, options: VideoOptions): Promise<{ path: string; frames: number }> {
  const frameCount = Math.max(2, Math.min(options.frames ?? 60, 600))
  const fps = Math.max(1, Math.min(options.fps ?? 12, 30))
  const workDir = join(tmpdir(), `cloudwright-video-${Date.now()}`)
  mkdirSync(workDir, { recursive: true })

  const { browser, page } = await openSession(appUrl, options)
  try {
    // One warm-up tick so node sizes are final before the first frame; the
    // camera then stays still for the whole recording.
    await stepAndSettle(page, 1)
    await refit(page)

    for (let i = 0; i < frameCount; i++) {
      const due = (options.timeline ?? []).filter((t) => t.atFrame === i)
      if (due.length > 0) {
        await page.evaluate((events) => {
          const bridge = (window as unknown as { __cloudwright: { injectIncident: (a: string, b: string) => boolean } }).__cloudwright
          for (const e of events) bridge.injectIncident(e.nodeId, e.modeId)
        }, due)
      }
      await stepAndSettle(page, 1)
      const buffer = await page.screenshot({ type: 'png' })
      writeFileSync(join(workDir, `frame-${String(i).padStart(5, '0')}.png`), buffer)
    }
  } finally {
    await browser.close()
  }

  const output = options.outputPath ?? join(process.cwd(), `cloudwright-${Date.now()}.mp4`)
  await encode(workDir, output, fps)
  rmSync(workDir, { recursive: true, force: true })
  return { path: output, frames: frameCount }
}

function encode(dir: string, output: string, fps: number): Promise<void> {
  return new Promise((done, fail) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-framerate', String(fps),
      '-i', join(dir, 'frame-%05d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      // H.264 requires even dimensions.
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart',
      output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    let stderr = ''
    ffmpeg.stderr.on('data', (chunk) => { stderr += String(chunk) })
    ffmpeg.on('error', () => fail(new Error('ffmpeg is not installed. Install it, or use screenshot_diagram instead.')))
    ffmpeg.on('close', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))))
  })
}

export function shutdownStaticServer() {
  staticServer?.close()
  staticServer = null
  staticUrl = null
}
