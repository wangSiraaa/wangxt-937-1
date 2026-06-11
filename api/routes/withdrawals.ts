import { Router, type Request, type Response } from 'express'
import { getDb, logAction } from '../db.js'

const router = Router()

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { registrationId, groupId, reason } = req.body

    if (!registrationId || !groupId || !reason) {
      res.status(400).json({ success: false, error: 'registrationId, groupId, and reason are required' })
      return
    }

    const groupResult = db.exec('SELECT published FROM groups WHERE id = ?', [groupId])
    if (!groupResult[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Group not found' })
      return
    }
    if (!groupResult[0].values[0][0]) {
      res.status(400).json({ success: false, error: 'Withdrawal only allowed for published groups' })
      return
    }

    const assignment = db.exec(
      'SELECT id FROM group_assignments WHERE registration_id = ? AND group_id = ? AND is_withdrawn = 0',
      [registrationId, groupId]
    )
    if (!assignment[0]?.values?.length) {
      res.status(400).json({ success: false, error: 'Player is not in this group or already withdrawn' })
      return
    }

    const existingWithdrawal = db.exec(
      "SELECT id FROM withdrawals WHERE registration_id = ? AND group_id = ? AND status = 'pending'",
      [registrationId, groupId]
    )
    if (existingWithdrawal[0]?.values?.length) {
      res.status(409).json({ success: false, error: 'A pending withdrawal request already exists' })
      return
    }

    db.run(
      `INSERT INTO withdrawals (registration_id, group_id, reason, status) VALUES (?, ?, ?, 'pending')`,
      [registrationId, groupId, reason]
    )

    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
    logAction('WITHDRAWAL_REQUEST', 'withdrawal', newId, `Withdrawal requested for registration ${registrationId} from group ${groupId}`)

    const withdrawal = db.exec('SELECT * FROM withdrawals WHERE id = ?', [newId])
    const w = withdrawal[0].values[0]
    res.status(201).json({
      success: true,
      data: {
        id: w[0], registration_id: w[1], group_id: w[2], reason: w[3],
        status: w[4], requested_at: w[5], approved_at: w[6]
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const result = db.exec('SELECT * FROM withdrawals ORDER BY id DESC')
    const rows = result[0]?.values?.map(v => ({
      id: v[0], registration_id: v[1], group_id: v[2], reason: v[3],
      status: v[4], requested_at: v[5], approved_at: v[6]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const withdrawalId = req.params.id

    const withdrawalResult = db.exec('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId])
    if (!withdrawalResult[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Withdrawal not found' })
      return
    }

    const w = withdrawalResult[0].values[0]
    const wStatus = w[4]
    const regId = w[1]
    const groupId = w[2]
    const reason = w[3]

    if (wStatus !== 'pending') {
      res.status(400).json({ success: false, error: `Withdrawal status is '${wStatus}', can only approve 'pending'` })
      return
    }

    db.run("UPDATE withdrawals SET status = 'approved', approved_at = datetime('now') WHERE id = ?", [withdrawalId])
    db.run('UPDATE group_assignments SET is_withdrawn = 1, withdrawal_reason = ? WHERE registration_id = ? AND group_id = ? AND is_withdrawn = 0', [reason, regId, groupId])
    db.run("UPDATE registrations SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?", [regId])

    logAction('WITHDRAWAL_APPROVE', 'withdrawal', withdrawalId, `Approved withdrawal for registration ${regId} from group ${groupId}`)

    res.json({ success: true, message: 'Withdrawal approved, slot kept with vacancy note' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
