import { Router, type Request, type Response } from 'express'
import { getDb, logAction } from '../db.js'

const router = Router()

router.get('/pending', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const result = db.exec(`
      SELECT r.* FROM registrations r
      LEFT JOIN payments p ON p.registration_id = r.id
      WHERE r.status = 'pending'
        AND (p.id IS NULL OR p.status = 'pending')
      ORDER BY r.id DESC
    `)
    const rows = result[0]?.values?.map(v => ({
      id: v[0], player_name: v[1], id_number: v[2], phone: v[3],
      birth_year: v[4], age_group: v[5], emergency_contact: v[6],
      emergency_phone: v[7], event_id: v[8], proof_path: v[9],
      proof_verified: v[10], status: v[11], created_at: v[12], updated_at: v[13]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:registrationId/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const regId = req.params.registrationId
    const { amount } = req.body

    if (amount === undefined) {
      res.status(400).json({ success: false, error: 'Amount is required' })
      return
    }

    const regResult = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
    if (!regResult[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Registration not found' })
      return
    }

    const reg = regResult[0].values[0]
    const regStatus = reg[11]
    if (regStatus !== 'pending') {
      res.status(400).json({ success: false, error: `Registration status is '${regStatus}', cannot confirm payment` })
      return
    }

    const existingPayment = db.exec('SELECT id FROM payments WHERE registration_id = ?', [regId])
    if (existingPayment[0]?.values?.length) {
      db.run("UPDATE payments SET status = 'confirmed', confirmed_at = datetime('now') WHERE registration_id = ?", [regId])
    } else {
      db.run(
        `INSERT INTO payments (registration_id, amount, status, paid_at, confirmed_at)
         VALUES (?, ?, 'confirmed', datetime('now'), datetime('now'))`,
        [regId, amount]
      )
    }

    db.run("UPDATE registrations SET status = 'paid', updated_at = datetime('now') WHERE id = ?", [regId])
    logAction('CONFIRM_PAYMENT', 'payment', regId, `Payment confirmed for registration ${regId}, amount=${amount}`)

    const paymentResult = db.exec('SELECT * FROM payments WHERE registration_id = ?', [regId])
    const p = paymentResult[0].values[0]
    res.json({
      success: true,
      data: {
        id: p[0], registration_id: p[1], amount: p[2], status: p[3],
        paid_at: p[4], confirmed_at: p[5]
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const result = db.exec('SELECT * FROM payments ORDER BY id DESC')
    const rows = result[0]?.values?.map(v => ({
      id: v[0], registration_id: v[1], amount: v[2], status: v[3],
      paid_at: v[4], confirmed_at: v[5]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
