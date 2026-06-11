import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { getDb, logAction } from '../db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'uploads')

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  }
})
const upload = multer({ storage })

const router = Router()

function mapRegistrationRow(v: any[]) {
  return {
    id: v[0], player_name: v[1], id_number: v[2], phone: v[3],
    birth_year: v[4], age_group: v[5], emergency_contact: v[6],
    emergency_phone: v[7], event_id: v[8], proof_path: v[9],
    proof_verified: v[10], status: v[11], created_at: v[12], updated_at: v[13]
  }
}

router.post('/', upload.single('proof'), async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { player_name, id_number, phone, birth_year, emergency_contact, emergency_phone, event_id } = req.body

    if (!player_name || !id_number || !phone || !birth_year || !emergency_contact || !emergency_phone || !event_id) {
      res.status(400).json({ success: false, error: 'Missing required fields' })
      return
    }

    const existing = db.exec('SELECT id FROM registrations WHERE id_number = ? AND event_id = ?', [id_number, event_id])
    if (existing[0]?.values?.length) {
      res.status(409).json({ success: false, error: 'Duplicate registration: id_number already exists for this event' })
      return
    }

    const rulesResult = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ? ORDER BY min_age', [event_id])
    const rules = rulesResult[0]?.values?.map(v => ({ group_name: v[0], min_age: v[1], max_age: v[2] })) ?? []

    const currentYear = new Date().getFullYear()
    const age = currentYear - Number(birth_year)

    let ageGroup = ''
    for (const rule of rules) {
      if (age >= rule.min_age && age <= rule.max_age) {
        ageGroup = rule.group_name as string
        break
      }
    }

    if (!ageGroup) {
      res.status(400).json({ success: false, error: `Age ${age} does not match any age group for this event` })
      return
    }

    const proofPath = req.file ? req.file.filename : null
    const proofVerified = req.file ? 1 : 0

    db.run(
      `INSERT INTO registrations (player_name, id_number, phone, birth_year, age_group, emergency_contact, emergency_phone, event_id, proof_path, proof_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [player_name, id_number, phone, birth_year, ageGroup, emergency_contact, emergency_phone, event_id, proofPath, proofVerified]
    )

    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
    logAction('CREATE', 'registration', newId, `Registered ${player_name} for event ${event_id}, age_group=${ageGroup}`)

    const reg = db.exec('SELECT * FROM registrations WHERE id = ?', [newId])
    res.status(201).json({ success: true, data: mapRegistrationRow(reg[0].values[0]) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id, status } = req.query
    let sql = 'SELECT * FROM registrations WHERE 1=1'
    const params: any[] = []

    if (event_id) {
      sql += ' AND event_id = ?'
      params.push(event_id)
    }
    if (status) {
      sql += ' AND status = ?'
      params.push(status)
    }
    sql += ' ORDER BY id DESC'

    const result = db.exec(sql, params)
    const rows = result[0]?.values?.map(mapRegistrationRow) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const result = db.exec('SELECT * FROM registrations WHERE id = ?', [req.params.id])
    if (!result[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Registration not found' })
      return
    }
    res.json({ success: true, data: mapRegistrationRow(result[0].values[0]) })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const regId = req.params.id
    const { event_id: newEventId } = req.body

    const existing = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
    if (!existing[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Registration not found' })
      return
    }

    const reg = mapRegistrationRow(existing[0].values[0])

    if (newEventId && newEventId !== reg.event_id) {
      const dupCheck = db.exec('SELECT id FROM registrations WHERE id_number = ? AND event_id = ? AND id != ?', [reg.id_number, newEventId, regId])
      if (dupCheck[0]?.values?.length) {
        res.status(409).json({ success: false, error: 'Already registered for this event with same id_number' })
        return
      }

      const rulesResult = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ? ORDER BY min_age', [newEventId])
      const rules = rulesResult[0]?.values?.map(v => ({ group_name: v[0], min_age: v[1], max_age: v[2] })) ?? []

      const currentYear = new Date().getFullYear()
      const age = currentYear - reg.birth_year

      let ageGroup = ''
      for (const rule of rules) {
        if (age >= rule.min_age && age <= rule.max_age) {
          ageGroup = rule.group_name as string
          break
        }
      }

      if (!ageGroup) {
        res.status(400).json({ success: false, error: `Age ${age} does not match any age group for new event` })
        return
      }

      db.run('UPDATE registrations SET event_id = ?, age_group = ?, updated_at = datetime(\'now\') WHERE id = ?', [newEventId, ageGroup, regId])

      const paymentCheck = db.exec('SELECT id FROM payments WHERE registration_id = ? AND status = \'confirmed\'', [regId])
      const paymentAdjustmentNeeded = paymentCheck[0]?.values?.length ? true : false

      logAction('UPDATE', 'registration', regId, `Changed event to ${newEventId}, new age_group=${ageGroup}${paymentAdjustmentNeeded ? ', payment_diff_adjustment_needed=true' : ''}`)

      const updated = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
      res.json({
        success: true,
        data: mapRegistrationRow(updated[0].values[0]),
        payment_diff_adjustment_needed: paymentAdjustmentNeeded
      })
    } else {
      const updates: string[] = []
      const params: any[] = []
      const allowedFields = ['player_name', 'phone', 'emergency_contact', 'emergency_phone']
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`)
          params.push(req.body[field])
        }
      }
      if (updates.length) {
        updates.push("updated_at = datetime('now')")
        params.push(regId)
        db.run(`UPDATE registrations SET ${updates.join(', ')} WHERE id = ?`, params)
        logAction('UPDATE', 'registration', regId, `Updated fields: ${updates.slice(0, -1).join(', ')}`)
      }
      const updated = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
      res.json({ success: true, data: mapRegistrationRow(updated[0].values[0]) })
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const regId = req.params.id

    const existing = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
    if (!existing[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Registration not found' })
      return
    }

    const reg = mapRegistrationRow(existing[0].values[0])
    if (reg.status !== 'pending') {
      res.status(400).json({ success: false, error: 'Can only cancel registrations with pending status' })
      return
    }

    db.run("UPDATE registrations SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?", [regId])
    logAction('CANCEL', 'registration', regId, `Cancelled registration for ${reg.player_name}`)
    res.json({ success: true, message: 'Registration cancelled' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/:id/proof', upload.single('proof'), async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const regId = req.params.id

    if (!req.file) {
      res.status(400).json({ success: false, error: 'No proof file uploaded' })
      return
    }

    const existing = db.exec('SELECT id FROM registrations WHERE id = ?', [regId])
    if (!existing[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Registration not found' })
      return
    }

    db.run('UPDATE registrations SET proof_path = ?, proof_verified = 1, updated_at = datetime(\'now\') WHERE id = ?', [req.file.filename, regId])
    logAction('UPLOAD_PROOF', 'registration', regId, `Proof uploaded: ${req.file.filename}`)
    res.json({ success: true, message: 'Proof uploaded and verified' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
