import { Router, type Request, type Response } from 'express'
import { getDb } from '../db.js'

const router = Router()

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const result = db.exec('SELECT * FROM events ORDER BY id')
    const rows = result[0]?.values?.map(v => ({
      id: v[0], name: v[1], category: v[2], description: v[3], fee: v[4] || 100
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id/rules', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const eventId = req.params.id
    const result = db.exec('SELECT id, event_id, group_name, min_age, max_age FROM age_rules WHERE event_id = ? ORDER BY min_age', [eventId])
    const rows = result[0]?.values?.map(v => ({
      id: v[0], event_id: v[1], group_name: v[2], min_age: v[3], max_age: v[4]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
