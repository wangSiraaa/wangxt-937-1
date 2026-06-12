import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import eventsRoutes from './routes/events.js'
import registrationsRoutes from './routes/registrations.js'
import paymentsRoutes from './routes/payments.js'
import groupingsRoutes from './routes/groupings.js'
import withdrawalsRoutes from './routes/withdrawals.js'
import logsRoutes from './routes/logs.js'
import waitlistRoutes from './routes/waitlist.js'
import { initDb } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')))

const distPath = path.resolve(__dirname, '..', 'dist')
app.use(express.static(distPath))

app.use('/api/auth', authRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/registrations', registrationsRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/groupings', groupingsRoutes)
app.use('/api/withdrawals', withdrawalsRoutes)
app.use('/api/logs', logsRoutes)
app.use('/api', waitlistRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'))
    return
  }
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

let dbInitialized = false

export async function initializeApp(): Promise<void> {
  if (dbInitialized) return
  await initDb()
  dbInitialized = true
}

export default app
