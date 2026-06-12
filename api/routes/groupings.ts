import { Router, type Request, type Response } from 'express'
import { getDb, logAction } from '../db.js'

const router = Router()

function extractAgeGroup(groupName: string): string {
  const parts = groupName.split('-')
  const ageGroup = parts[parts.length - 1]
  if (['U18', 'U23', 'Open'].includes(ageGroup)) {
    return ageGroup
  }
  return ageGroup
}

function validateAgeGroupMatch(regAgeGroup: string, groupAgeGroup: string, playerName: string): string | null {
  if (regAgeGroup === groupAgeGroup) {
    return null
  }

  const allowedTransitions: Record<string, string[]> = {
    'U18': ['U18'],
    'U23': ['U23'],
    'Open': ['Open'],
  }

  const allowed = allowedTransitions[regAgeGroup] || []
  if (!allowed.includes(groupAgeGroup)) {
    if (regAgeGroup === 'U23' && (groupAgeGroup === 'Open' || groupAgeGroup === 'U18')) {
      return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（U23选手仅能进入U23分组，不能进入Open或U18分组）`
    }
    if (regAgeGroup === 'Open' && (groupAgeGroup === 'U23' || groupAgeGroup === 'U18')) {
      return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（Open选手仅能进入Open分组，不能进入U23或U18分组）`
    }
    if (regAgeGroup === 'U18' && (groupAgeGroup === 'U23' || groupAgeGroup === 'Open')) {
      return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（U18选手仅能进入U18分组，不能进入U23或Open分组）`
    }
    return `选手「${playerName}」年龄组为 ${regAgeGroup}，不能进入 ${groupAgeGroup} 分组（年龄组不匹配）`
  }

  return null
}

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

    const groupResult = db.exec('SELECT event_id, published, group_name FROM groups WHERE id = ?', [groupId])
    if (!groupResult[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Group not found' })
      return
    }
    const groupEventId = groupResult[0].values[0][0]
    const groupPublished = groupResult[0].values[0][1]
    const groupName = groupResult[0].values[0][2] as string
    const groupAgeGroup = extractAgeGroup(groupName)

    if (groupPublished) {
      res.status(400).json({ success: false, error: '分组已发布，不能再分配选手' })
      return
    }

    const errors: string[] = []
    const validRegs: any[] = []

    for (let i = 0; i < registrationIds.length; i++) {
      const regId = registrationIds[i]

      const regResult = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
      if (!regResult[0]?.values?.length) {
        errors.push(`选手ID ${regId} 不存在`)
        continue
      }

      const reg = regResult[0].values[0]
      const regStatus = reg[11] as string
      const proofVerified = reg[10] as number
      const regEventId = reg[8] as number
      const regBirthYear = reg[4] as number
      const regAgeGroup = reg[5] as string
      const regPlayerName = reg[1] as string

      if (regStatus !== 'paid') {
        errors.push(`选手「${regPlayerName}」未完成缴费，当前状态：${regStatus}`)
        continue
      }
      if (!proofVerified) {
        errors.push(`选手「${regPlayerName}」参赛证明未验证`)
        continue
      }
      if (Number(regEventId) !== Number(groupEventId)) {
        errors.push(`选手「${regPlayerName}」不属于该赛事`)
        continue
      }

      const ageError = validateAgeGroupMatch(regAgeGroup, groupAgeGroup, regPlayerName)
      if (ageError) {
        errors.push(ageError)
        continue
      }

      const currentYear = new Date().getFullYear()
      const age = currentYear - Number(regBirthYear)
      const rulesResult = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ?', [groupEventId])
      const rules = rulesResult[0]?.values?.map(v => ({ group_name: v[0], min_age: v[1], max_age: v[2] })) ?? []
      const ageMatch = rules.some(r => age >= Number(r.min_age) && age <= Number(r.max_age))
      if (!ageMatch) {
        errors.push(`选手「${regPlayerName}」年龄 ${age} 岁不符合赛事年龄限制`)
        continue
      }

      const existingAssignment = db.exec(`
        SELECT ga.id FROM group_assignments ga
        JOIN groups g ON g.id = ga.group_id
        WHERE ga.registration_id = ? AND g.event_id = ? AND ga.is_withdrawn = 0
      `, [regId, groupEventId])
      if (existingAssignment[0]?.values?.length) {
        errors.push(`选手「${regPlayerName}」已分配到该赛事的其他分组`)
        continue
      }

      validRegs.push({ id: regId, name: regPlayerName })
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: `分组分配失败，共 ${errors.length} 项问题`,
        details: errors
      })
      return
    }

    for (let i = 0; i < validRegs.length; i++) {
      const reg = validRegs[i]
      db.run(
        'INSERT INTO group_assignments (group_id, registration_id, slot_number) VALUES (?, ?, ?)',
        [groupId, reg.id, i + 1]
      )
      db.run("UPDATE registrations SET status = 'grouped', updated_at = datetime('now') WHERE id = ?", [reg.id])
      logAction('GROUP_ASSIGN', 'registration', reg.id, `Assigned to group ${groupId}`)
    }

    res.json({ success: true, assigned: validRegs.length })
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

    const groupResult = db.exec('SELECT event_id, published, group_name FROM groups WHERE id = ?', [groupId])
    if (!groupResult[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Group not found' })
      return
    }
    const groupPublished = groupResult[0].values[0][1]
    const groupEventId = groupResult[0].values[0][0]
    const groupName = groupResult[0].values[0][2] as string
    const groupAgeGroup = extractAgeGroup(groupName)

    if (groupPublished) {
      res.status(400).json({ success: false, error: '分组已发布，不能修改' })
      return
    }

    const errors: string[] = []
    for (const regId of registrationIds) {
      const regResult = db.exec('SELECT * FROM registrations WHERE id = ?', [regId])
      if (!regResult[0]?.values?.length) {
        errors.push(`选手ID ${regId} 不存在`)
        continue
      }
      const reg = regResult[0].values[0]
      const regStatus = reg[11] as string
      const proofVerified = reg[10] as number
      const regEventId = reg[8] as number
      const regAgeGroup = reg[5] as string
      const regPlayerName = reg[1] as string
      const regBirthYear = reg[4] as number

      if (regStatus !== 'paid' && regStatus !== 'grouped') {
        errors.push(`选手「${regPlayerName}」状态为 ${regStatus}，无法加入分组`)
        continue
      }
      if (!proofVerified) {
        errors.push(`选手「${regPlayerName}」参赛证明未验证`)
        continue
      }
      if (Number(regEventId) !== Number(groupEventId)) {
        errors.push(`选手「${regPlayerName}」不属于该赛事`)
        continue
      }

      const ageError = validateAgeGroupMatch(regAgeGroup, groupAgeGroup, regPlayerName)
      if (ageError) {
        errors.push(ageError)
        continue
      }

      const currentYear = new Date().getFullYear()
      const age = currentYear - Number(regBirthYear)
      const rulesResult = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ?', [groupEventId])
      const rules = rulesResult[0]?.values?.map(v => ({ group_name: v[0], min_age: v[1], max_age: v[2] })) ?? []
      const ageMatch = rules.some(r => age >= Number(r.min_age) && age <= Number(r.max_age))
      if (!ageMatch) {
        errors.push(`选手「${regPlayerName}」年龄 ${age} 岁不符合赛事年龄限制`)
        continue
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: `分组更新失败，共 ${errors.length} 项问题`,
        details: errors
      })
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

    let slotOffset = 0
    const existingSlots = db.exec('SELECT COALESCE(MAX(slot_number), 0) FROM group_assignments WHERE group_id = ?', [groupId])
    slotOffset = existingSlots[0]?.values?.[0]?.[0] as number ?? 0

    for (const regId of registrationIds) {
      if (!currentRegIds.has(regId)) {
        slotOffset++
        db.run('INSERT INTO group_assignments (group_id, registration_id, slot_number) VALUES (?, ?, ?)', [groupId, regId, slotOffset])
        db.run("UPDATE registrations SET status = 'grouped', updated_at = datetime('now') WHERE id = ?", [regId])
        logAction('GROUP_ASSIGN', 'registration', regId as number, `Added to group ${groupId}`)
      }
    }

    res.json({ success: true, message: '分组更新成功' })
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

    const errors: string[] = []

    for (const groupId of groupIds) {
      const groupResult = db.exec('SELECT id, event_id, group_name, published FROM groups WHERE id = ?', [groupId])
      if (!groupResult[0]?.values?.length) {
        errors.push(`分组ID ${groupId} 不存在`)
        continue
      }

      const group = groupResult[0].values[0]
      const groupPublished = group[3] as number
      const groupName = group[2] as string
      const groupAgeGroup = extractAgeGroup(groupName)

      if (groupPublished) {
        errors.push(`分组「${groupName}」已发布，无需重复发布`)
        continue
      }

      const assignments = db.exec(`
        SELECT ga.id, r.player_name, r.age_group
        FROM group_assignments ga
        JOIN registrations r ON r.id = ga.registration_id
        WHERE ga.group_id = ? AND ga.is_withdrawn = 0
      `, [groupId])

      if (!assignments[0]?.values?.length) {
        errors.push(`分组「${groupName}」为空，至少需要1名选手才能发布`)
        continue
      }

      for (const assign of assignments[0].values) {
        const playerName = assign[1] as string
        const playerAgeGroup = assign[2] as string
        const ageError = validateAgeGroupMatch(playerAgeGroup, groupAgeGroup, playerName)
        if (ageError) {
          errors.push(ageError + '，不能发布')
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: `发布失败，共 ${errors.length} 项问题`,
        details: errors
      })
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
