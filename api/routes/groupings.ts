import { Router, type Request, type Response } from 'express'
import { getDb, logAction } from '../db.js'

const router = Router()

router.get('/eligible', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id } = req.query
    let sql = `SELECT * FROM registrations WHERE status = 'paid' AND proof_verified = 1`
    const params: any[] = []

    if (event_id) {
      sql += ' AND event_id = ?'
      params.push(event_id)
    }
    sql += ' ORDER BY id'

    const result = db.exec(sql, params)
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

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { groupId, registrationIds } = req.body

    if (!groupId || !Array.isArray(registrationIds) || registrationIds.length === 0) {
      res.status(400).json({ success: false, error: 'groupId and registrationIds[] are required' })
      return
    }

    const groupResult = db.exec('SELECT event_id, published FROM groups WHERE id = ?', [groupId])
    if (!groupResult[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Group not found' })
      return
    }
    const groupEventId = groupResult[0].values[0][0]
    const groupPublished = groupResult[0].values[0][1]

    if (groupPublished) {
      res.status(400).json({ success: false, error: 'Cannot assign to a published group' })
      return
    }

    const errors: string[] = []

    for (let i = 0; i < registrationIds.length; i++) {
      const regId = registrationIds[i]

      const regResult = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
      if (!regResult[0]?.values?.length) {
        errors.push(`Registration ${regId} not found`)
        continue
      }

      const reg = regResult[0].values[0]
      const regStatus = reg[11]
      const proofVerified = reg[10]
      const regEventId = reg[8]
      const regBirthYear = reg[4]

      if (regStatus !== 'paid') {
        errors.push(`Registration ${regId} status is '${regStatus}', must be 'paid'`)
        continue
      }
      if (!proofVerified) {
        errors.push(`Registration ${regId} proof not verified`)
        continue
      }
      if (Number(regEventId) !== Number(groupEventId)) {
        errors.push(`Registration ${regId} belongs to event ${regEventId}, group belongs to event ${groupEventId}`)
        continue
      }

      const currentYear = new Date().getFullYear()
      const age = currentYear - Number(regBirthYear)
      const rulesResult = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ?', [groupEventId])
      const rules = rulesResult[0]?.values?.map(v => ({ group_name: v[0], min_age: v[1], max_age: v[2] })) ?? []
      const ageMatch = rules.some(r => age >= Number(r.min_age) && age <= Number(r.max_age))
      if (!ageMatch) {
        errors.push(`Registration ${regId} age ${age} does not match any age rule for event ${groupEventId}`)
        continue
      }

      const existingAssignment = db.exec(`
        SELECT ga.id FROM group_assignments ga
        JOIN groups g ON g.id = ga.group_id
        WHERE ga.registration_id = ? AND g.event_id = ? AND ga.is_withdrawn = 0
      `, [regId, groupEventId])
      if (existingAssignment[0]?.values?.length) {
        errors.push(`Registration ${regId} already assigned to another group for this event`)
        continue
      }

      db.run(
        'INSERT INTO group_assignments (group_id, registration_id, slot_number) VALUES (?, ?, ?)',
        [groupId, regId, i + 1]
      )
      db.run("UPDATE registrations SET status = 'grouped', updated_at = datetime('now') WHERE id = ?", [regId])
      logAction('GROUP_ASSIGN', 'registration', regId, `Assigned to group ${groupId}`)
    }

    res.json({ success: true, errors: errors.length ? errors : undefined, assigned: registrationIds.length - errors.length })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const groupId = req.params.id
    const { registrationIds } = req.body

    if (!Array.isArray(registrationIds)) {
      res.status(400).json({ success: false, error: 'registrationIds[] is required' })
      return
    }

    const groupResult = db.exec('SELECT published FROM groups WHERE id = ?', [groupId])
    if (!groupResult[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Group not found' })
      return
    }
    if (groupResult[0].values[0][0]) {
      res.status(400).json({ success: false, error: 'Cannot modify a published group' })
      return
    }

    const currentAssignments = db.exec('SELECT registration_id FROM group_assignments WHERE group_id = ? AND is_withdrawn = 0', [groupId])
    const currentRegIds = new Set(currentAssignments[0]?.values?.map(v => v[0]) ?? [])
    const newRegIds = new Set(registrationIds)

    for (const regId of currentRegIds) {
      if (!newRegIds.has(regId)) {
        db.run('DELETE FROM group_assignments WHERE group_id = ? AND registration_id = ? AND is_withdrawn = 0', [groupId, regId])
        db.run("UPDATE registrations SET status = 'paid', updated_at = datetime('now') WHERE id = ? AND status = 'grouped'", [regId])
        logAction('GROUP_UNASSIGN', 'registration', regId as number, `Removed from group ${groupId}`)
      }
    }

    let slotOffset = currentAssignments[0]?.values?.length ?? 0
    for (const regId of registrationIds) {
      if (!currentRegIds.has(regId)) {
        slotOffset++
        db.run('INSERT INTO group_assignments (group_id, registration_id, slot_number) VALUES (?, ?, ?)', [groupId, regId, slotOffset])
        db.run("UPDATE registrations SET status = 'grouped', updated_at = datetime('now') WHERE id = ?", [regId])
        logAction('GROUP_ASSIGN', 'registration', regId, `Added to group ${groupId}`)
      }
    }

    res.json({ success: true, message: 'Group assignments updated' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/publish', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { groupIds } = req.body

    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      res.status(400).json({ success: false, error: 'groupIds[] is required' })
      return
    }

    for (const groupId of groupIds) {
      db.run("UPDATE groups SET published = 1, published_at = datetime('now') WHERE id = ?", [groupId])
      logAction('PUBLISH_GROUP', 'group', groupId, `Group published`)
    }

    res.json({ success: true, message: `${groupIds.length} group(s) published` })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/all', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id } = req.query
    let sql = `
      SELECT g.id, g.event_id, g.group_name, g.published, g.published_at, e.name as event_name
      FROM groups g JOIN events e ON e.id = g.event_id
      WHERE 1=1
    `
    const params: any[] = []
    if (event_id) {
      sql += ' AND g.event_id = ?'
      params.push(event_id)
    }
    sql += ' ORDER BY g.id'

    const groupsResult = db.exec(sql, params)
    const groups = groupsResult[0]?.values?.map(v => ({
      id: v[0], event_id: v[1], group_name: v[2], published: v[3],
      published_at: v[4], event_name: v[5]
    })) ?? []

    const result = []
    for (const group of groups) {
      const assignments = db.exec(`
        SELECT ga.id, ga.registration_id, ga.slot_number, ga.is_withdrawn, ga.withdrawal_reason,
               r.player_name, r.id_number, r.age_group
        FROM group_assignments ga
        JOIN registrations r ON r.id = ga.registration_id
        WHERE ga.group_id = ?
        ORDER BY ga.slot_number
      `, [group.id])
      const players = assignments[0]?.values?.map(v => ({
        assignment_id: v[0], registration_id: v[1], slot_number: v[2],
        is_withdrawn: v[3], withdrawal_reason: v[4],
        player_name: v[5], id_number: v[6], age_group: v[7]
      })) ?? []
      result.push({ ...group, players })
    }

    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/published', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id } = req.query
    let sql = `
      SELECT g.id, g.event_id, g.group_name, g.published, g.published_at, e.name as event_name
      FROM groups g JOIN events e ON e.id = g.event_id
      WHERE g.published = 1
    `
    const params: any[] = []
    if (event_id) {
      sql += ' AND g.event_id = ?'
      params.push(event_id)
    }
    sql += ' ORDER BY g.id'

    const groupsResult = db.exec(sql, params)

    const groups = groupsResult[0]?.values?.map(v => ({
      id: v[0], event_id: v[1], group_name: v[2], published: v[3],
      published_at: v[4], event_name: v[5]
    })) ?? []

    const result = []
    for (const group of groups) {
      const assignments = db.exec(`
        SELECT ga.id, ga.registration_id, ga.slot_number, ga.is_withdrawn, ga.withdrawal_reason,
               r.player_name, r.id_number, r.age_group
        FROM group_assignments ga
        JOIN registrations r ON r.id = ga.registration_id
        WHERE ga.group_id = ?
        ORDER BY ga.slot_number
      `, [group.id])
      const players = assignments[0]?.values?.map(v => ({
        assignment_id: v[0], registration_id: v[1], slot_number: v[2],
        is_withdrawn: v[3], withdrawal_reason: v[4],
        player_name: v[5], id_number: v[6], age_group: v[7]
      })) ?? []
      result.push({ ...group, players })
    }

    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
