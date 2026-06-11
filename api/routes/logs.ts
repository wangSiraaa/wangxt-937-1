import { Router, type Request, type Response } from 'express'
import { getDb } from '../db.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const offset = (page - 1) * limit

    const countResult = db.exec('SELECT COUNT(*) FROM operation_logs')
    const total = countResult[0]?.values?.[0]?.[0] as number ?? 0

    const result = db.exec('SELECT * FROM operation_logs ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset])
    const rows = result[0]?.values?.map(v => ({
      id: v[0], action: v[1], entity_type: v[2], entity_id: v[3],
      detail: v[4], created_at: v[5]
    })) ?? []

    res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
