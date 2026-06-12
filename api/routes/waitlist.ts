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
  if (regAgeGroup === groupAgeGroup) return null
  const allowedTransitions: Record<string, string[]> = {
    'U18': ['U18'], 'U23': ['U23'], 'Open': ['Open'],
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

function getEventFee(db: any, eventId: number): number {
  const eventRes = db.exec('SELECT fee FROM events WHERE id = ?', [eventId])
  if (!eventRes[0]?.values?.length) return 100
  return Number(eventRes[0].values[0][0]) || 100
}

router.post('/waitlist', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id, age_group, registration_id, note } = req.body
    if (!event_id || !age_group || !registration_id) {
      res.status(400).json({ success: false, error: 'event_id, age_group, registration_id are required' })
      return
    }
    const regRes = db.exec('SELECT * FROM registrations WHERE id = ?', [registration_id])
    if (!regRes[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Registration not found' })
      return
    }
    const reg = regRes[0].values[0]
    const regIdNum = reg[2] as string
    const regBirthYear = reg[4] as number
    const regAgeGroup = reg[5] as string
    const regProofVerified = reg[10] as number
    const regStatus = reg[11] as string
    const regEventId = reg[8] as number

    if (regAgeGroup !== age_group) {
      res.status(400).json({ success: false, error: `选手年龄组 ${regAgeGroup} 与候补年龄组 ${age_group} 不匹配` })
      return
    }
    if (Number(regEventId) !== Number(event_id)) {
      res.status(400).json({ success: false, error: '选手不属于该赛事' })
      return
    }
    if (!regProofVerified) {
      res.status(400).json({ success: false, error: '参赛证明缺失，不能进入候补队列' })
      return
    }
    const currentYear = new Date().getFullYear()
    const age = currentYear - Number(regBirthYear)
    const rulesRes = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ?', [event_id])
    const rules = rulesRes[0]?.values?.map(v => ({ group_name: v[0], min_age: v[1], max_age: v[2] })) ?? []
    const ageMatch = rules.some(r => age >= Number(r.min_age) && age <= Number(r.max_age) && r.group_name === age_group)
    if (!ageMatch) {
      res.status(400).json({ success: false, error: `年龄 ${age} 岁不符合该赛事 ${age_group} 年龄组要求，不能进入候补` })
      return
    }
    const payRes = db.exec('SELECT status, paid_at FROM payments WHERE registration_id = ?', [registration_id])
    const pay = payRes[0]?.values?.[0]
    if (!pay || pay[0] !== 'confirmed') {
      res.status(400).json({ success: false, error: '未完成缴费，不能进入候补递补' })
      return
    }
    const dupRes = db.exec("SELECT id FROM waitlist_entries WHERE registration_id = ? AND status = 'waiting'", [registration_id])
    if (dupRes[0]?.values?.length) {
      res.status(409).json({ success: false, error: '选手已在候补队列中' })
      return
    }
    const dupEvent = db.exec(`
      SELECT ga.id FROM group_assignments ga
      JOIN groups g ON g.id = ga.group_id
      WHERE ga.registration_id = ? AND g.event_id = ? AND ga.is_withdrawn = 0
    `, [registration_id, event_id])
    if (dupEvent[0]?.values?.length) {
      res.status(409).json({ success: false, error: '选手已分配到该赛事分组，不能进入候补' })
      return
    }
    const orderRes = db.exec('SELECT COALESCE(MAX(queue_order), 0) FROM waitlist_entries WHERE event_id = ? AND age_group = ?', [event_id, age_group])
    const nextOrder = (orderRes[0]?.values?.[0]?.[0] as number ?? 0) + 1
    db.run(`INSERT INTO waitlist_entries (event_id, age_group, registration_id, queue_order, status, payment_time, note)
            VALUES (?, ?, ?, ?, 'waiting', ?, ?)`,
      [event_id, age_group, registration_id, nextOrder, pay[1] || new Date().toISOString(), note || ''])
    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
    logAction('WAITLIST_ADD', 'waitlist_entries', newId, `Added ${registration_id} to waitlist queue ${nextOrder}`)
    const entry = db.exec('SELECT * FROM waitlist_entries WHERE id = ?', [newId])
    const e = entry[0].values[0]
    res.status(201).json({
      success: true, data: {
        id: e[0], event_id: e[1], age_group: e[2], registration_id: e[3],
        queue_order: e[4], status: e[5], payment_time: e[6], note: e[12]
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/waitlist', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id, age_group, status } = req.query
    let sql = `SELECT we.id, we.event_id, we.age_group, we.registration_id, we.queue_order, we.status,
                      we.payment_time, we.promoted_at, we.cancelled_at, we.note, we.created_at,
                      r.player_name, r.id_number, r.phone, r.birth_year,
                      e.name as event_name
               FROM waitlist_entries we
               JOIN registrations r ON r.id = we.registration_id
               LEFT JOIN events e ON e.id = we.event_id WHERE 1=1`
    const params: any[] = []
    if (event_id) { sql += ' AND we.event_id = ?'; params.push(event_id) }
    if (age_group) { sql += ' AND we.age_group = ?'; params.push(age_group) }
    if (status) { sql += ' AND we.status = ?'; params.push(status) }
    sql += ' ORDER BY we.event_id, we.age_group, we.queue_order'
    const result = db.exec(sql, params)
    const rows = result[0]?.values?.map(v => ({
      id: v[0], event_id: v[1], age_group: v[2], registration_id: v[3],
      queue_order: v[4], status: v[5], payment_time: v[6], promoted_at: v[7],
      cancelled_at: v[8], note: v[9], created_at: v[10],
      player_name: v[11], id_number: v[12], phone: v[13], birth_year: v[14],
      event_name: v[15]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/project-change', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { registration_id, target_event_id, requester_note } = req.body
    if (!registration_id || !target_event_id) {
      res.status(400).json({ success: false, error: 'registration_id, target_event_id required' })
      return
    }
    const regRes = db.exec('SELECT * FROM registrations WHERE id = ?', [registration_id])
    if (!regRes[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Registration not found' })
      return
    }
    const reg = regRes[0].values[0]
    const originalEventId = reg[8] as number
    if (Number(originalEventId) === Number(target_event_id)) {
      res.status(400).json({ success: false, error: '目标赛事与原赛事相同' })
      return
    }
    const groupCheck = db.exec(`
      SELECT g.id, g.published, g.group_name FROM group_assignments ga
      JOIN groups g ON g.id = ga.group_id
      WHERE ga.registration_id = ? AND g.event_id = ? AND ga.is_withdrawn = 0
    `, [registration_id, originalEventId])
    if (groupCheck[0]?.values?.length && groupCheck[0].values[0][1]) {
      res.status(400).json({ success: false, error: '选手已在已发布分组，裁判长发布分组前才能申请改签' })
      return
    }
    const dupRes = db.exec('SELECT id FROM registrations WHERE id_number = ? AND event_id = ? AND id != ?',
      [reg[2], target_event_id, registration_id])
    if (dupRes[0]?.values?.length) {
      res.status(409).json({ success: false, error: '该证件号已在目标赛事中存在报名记录（重复证件阻断）' })
      return
    }
    const targetEventRes = db.exec('SELECT id FROM events WHERE id = ?', [target_event_id])
    if (!targetEventRes[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Target event not found' })
      return
    }
    const regBirthYear = reg[4] as number
    const currentYear = new Date().getFullYear()
    const age = currentYear - Number(regBirthYear)
    const rulesRes = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ? ORDER BY min_age', [target_event_id])
    const rules = rulesRes[0]?.values?.map(v => ({ group_name: v[0], min_age: v[1], max_age: v[2] })) ?? []
    let targetAgeGroup = ''
    for (const rule of rules) {
      if (age >= rule.min_age && age <= rule.max_age) {
        targetAgeGroup = rule.group_name as string
        break
      }
    }
    if (!targetAgeGroup) {
      res.status(400).json({ success: false, error: `年龄 ${age} 岁不符合目标赛事年龄限制（年龄不符）` })
      return
    }
    const proofVerified = Number(reg[10]) > 0 ? 1 : 0
    const ageVerified = 1
    const idNumberVerified = 1
    const originalFee = getEventFee(db, originalEventId as number)
    const targetFee = getEventFee(db, target_event_id as number)
    const feeDifference = Number(targetFee) - Number(originalFee)
    const differenceStatus = feeDifference > 0 ? 'unpaid' : (feeDifference < 0 ? 'unpaid' : 'waived')
    const existingGroup = groupCheck[0]?.values?.[0]
    if (existingGroup) {
      db.run("UPDATE group_assignments SET is_withdrawn = 1, withdrawal_reason = '项目改签申请' WHERE registration_id = ? AND group_id = ? AND is_withdrawn = 0",
        [registration_id, existingGroup[0]])
      db.run("UPDATE registrations SET status = 'paid', updated_at = datetime('now') WHERE id = ? AND status = 'grouped'", [registration_id])
    }
    db.run(`INSERT INTO project_changes
            (registration_id, original_event_id, target_event_id, original_age_group, target_age_group,
             fee_difference, difference_status, id_number_verified, age_verified, proof_verified, requester_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [registration_id, originalEventId, target_event_id, reg[5], targetAgeGroup,
        feeDifference, differenceStatus, idNumberVerified, ageVerified, proofVerified, requester_note || ''])
    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
    if (feeDifference !== 0) {
      const adjType = feeDifference > 0 ? 'supplement' : 'refund'
      db.run(`INSERT INTO payment_adjustments
              (registration_id, project_change_id, original_amount, new_amount, difference, adjustment_type, status)
              VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [registration_id, newId, originalFee, targetFee, Math.abs(feeDifference), adjType])
    }
    const verificationErrors: string[] = []
    if (!proofVerified) verificationErrors.push('参赛证明未重新核验')
    const allPassed = verificationErrors.length === 0
    if (allPassed && feeDifference <= 0) {
      db.run("UPDATE project_changes SET change_status = 'approved', approved_at = datetime('now') WHERE id = ?", [newId])
      db.run('UPDATE registrations SET event_id = ?, age_group = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [target_event_id, targetAgeGroup, registration_id])
      if (feeDifference !== 0) {
        db.run("UPDATE payment_adjustments SET status = 'confirmed', finance_confirmed = 1, confirmed_at = datetime('now') WHERE project_change_id = ?", [newId])
      }
    }
    logAction('PROJECT_CHANGE_REQUEST', 'project_changes', newId,
      `Change ${originalEventId}->${target_event_id}, fee_diff=${feeDifference}, id_num=${reg[2]}, proof=${proofVerified}`)
    const pc = db.exec('SELECT * FROM project_changes WHERE id = ?', [newId])
    const p = pc[0].values[0]
    const adjRes = db.exec('SELECT * FROM payment_adjustments WHERE project_change_id = ?', [newId])
    const adj = adjRes[0]?.values?.[0]
    res.status(201).json({
      success: true,
      data: {
        id: p[0], registration_id: p[1], original_event_id: p[2], target_event_id: p[3],
        original_age_group: p[4], target_age_group: p[5], fee_difference: p[6],
        difference_status: p[7], change_status: p[9],
        id_number_verified: !!p[10], age_verified: !!p[11], proof_verified: !!p[12],
        verification_passed: allPassed,
        verification_errors: verificationErrors,
        needs_finance_confirm: feeDifference > 0,
        payment_adjustment: adj ? {
          id: adj[0], difference: adj[4], adjustment_type: adj[5], status: adj[9]
        } : null
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/project-changes', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { status, registration_id } = req.query
    let sql = `SELECT pc.*, r.player_name, r.id_number, e1.name as orig_event_name, e2.name as target_event_name
               FROM project_changes pc
               JOIN registrations r ON r.id = pc.registration_id
               JOIN events e1 ON e1.id = pc.original_event_id
               JOIN events e2 ON e2.id = pc.target_event_id WHERE 1=1`
    const params: any[] = []
    if (status) { sql += ' AND pc.change_status = ?'; params.push(status) }
    if (registration_id) { sql += ' AND pc.registration_id = ?'; params.push(registration_id) }
    sql += ' ORDER BY pc.id DESC'
    const result = db.exec(sql, params)
    const rows = result[0]?.values?.map(v => ({
      id: v[0], registration_id: v[1], original_event_id: v[2], target_event_id: v[3],
      original_age_group: v[4], target_age_group: v[5], fee_difference: v[6],
      difference_status: v[7], paid_at: v[8], change_status: v[9],
      id_number_verified: !!v[10], age_verified: !!v[11], proof_verified: !!v[12],
      rejection_reason: v[13], approved_at: v[14], requester_note: v[15], created_at: v[16],
      player_name: v[17], id_number: v[18], orig_event_name: v[19], target_event_name: v[20]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/project-change/:id/confirm-fee', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const changeId = req.params.id
    const { confirmed_by, payment_reference } = req.body
    const pcRes = db.exec('SELECT * FROM project_changes WHERE id = ?', [changeId])
    if (!pcRes[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Project change not found' })
      return
    }
    const pc = pcRes[0].values[0]
    const feeDiff = pc[6] as number
    if (feeDiff <= 0) {
      res.status(400).json({ success: false, error: '无需差额缴费' })
      return
    }
    if (pc[9] !== 'pending') {
      res.status(400).json({ success: false, error: `改签状态为 ${pc[9]}，不能确认缴费` })
      return
    }
    db.run("UPDATE payment_adjustments SET status = 'confirmed', finance_confirmed = 1, confirmed_at = datetime('now'), confirmed_by = ?, payment_reference = ? WHERE project_change_id = ?",
      [confirmed_by || 'system', payment_reference || '', changeId])
    db.run("UPDATE project_changes SET difference_status = 'paid', paid_at = datetime('now'), change_status = 'approved', approved_at = datetime('now') WHERE id = ?", [changeId])
    const regId = pc[1]
    const targetEvent = pc[3]
    const targetAgeGroup = pc[5]
    db.run('UPDATE registrations SET event_id = ?, age_group = ?, updated_at = datetime(\'now\') WHERE id = ?', [targetEvent, targetAgeGroup, regId])
    logAction('PROJECT_CHANGE_FEE_CONFIRMED', 'project_changes', changeId,
      `Finance confirmed fee diff=${feeDiff} for registration ${regId}`)
    res.json({ success: true, message: '差额缴费财务确认完成，改签已生效' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/promote-waitlist', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id, age_group } = req.body
    if (!event_id || !age_group) {
      res.status(400).json({ success: false, error: 'event_id, age_group required' })
      return
    }
    const vacancyGroup = db.exec(`
      SELECT g.id, g.group_name, g.published,
             (SELECT COUNT(*) FROM group_assignments ga WHERE ga.group_id = g.id AND ga.is_withdrawn = 0) as active_count
      FROM groups g
      WHERE g.event_id = ? AND g.group_name LIKE ?
      ORDER BY g.id LIMIT 1
    `, [event_id, `%-${age_group}`])
    if (!vacancyGroup[0]?.values?.length) {
      res.status(404).json({ success: false, error: '未找到对应分组' })
      return
    }
    const group = vacancyGroup[0].values[0]
    const groupId = group[0] as number
    const groupPublished = group[2] as number
    if (!groupPublished) {
      res.status(400).json({ success: false, error: '分组未发布，候补递补仅在发布后退赛触发' })
      return
    }
    const waitlistRes = db.exec(`
      SELECT we.id, we.registration_id, we.queue_order, r.player_name, r.id_number,
             r.status, r.proof_verified, p.status as pay_status
      FROM waitlist_entries we
      JOIN registrations r ON r.id = we.registration_id
      LEFT JOIN payments p ON p.registration_id = r.id
      WHERE we.event_id = ? AND we.age_group = ? AND we.status = 'waiting'
      ORDER BY we.queue_order ASC, we.payment_time ASC
    `, [event_id, age_group])
    const waiters = waitlistRes[0]?.values ?? []
    if (waiters.length === 0) {
      res.json({ success: true, promoted: [], skipped: [], message: '候补队列为空' })
      return
    }
    const promotedList: any[] = []
    const skippedList: any[] = []
    let promIdx = 0
    const slotNumRes = db.exec('SELECT COALESCE(MAX(slot_number), 0) FROM group_assignments WHERE group_id = ?', [groupId])
    let slotNumber = (slotNumRes[0]?.values?.[0]?.[0] as number ?? 0)
    for (const w of waiters) {
      const entryId = w[0] as number
      const regId = w[1] as number
      const playerName = w[3] as string
      const regStatus = w[5] as string
      const proofVer = w[6] as number
      const payStatus = w[7] as string
      const failureReasons: string[] = []
      if (payStatus !== 'confirmed') failureReasons.push('未缴费')
      if (!proofVer) failureReasons.push('参赛证明缺失')
      const adjCheckRes = db.exec(`SELECT id FROM payment_adjustments WHERE registration_id = ? AND finance_confirmed = 0 AND status = 'pending'`, [regId])
      if (adjCheckRes[0]?.values?.length) failureReasons.push('差额缴费未确认，不可递补')
      const rulesRes2 = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ?', [event_id])
      const rules2 = rulesRes2[0]?.values?.map(v2 => ({ group_name: v2[0], min_age: v2[1], max_age: v2[2] })) ?? []
      const regRes2 = db.exec('SELECT birth_year, age_group FROM registrations WHERE id = ?', [regId])
      const reg2 = regRes2[0]?.values?.[0]
      let ageOk = false
      if (reg2) {
        const age2 = new Date().getFullYear() - Number(reg2[0])
        ageOk = rules2.some(r2 => age2 >= Number(r2.min_age) && age2 <= Number(r2.max_age) && r2.group_name === age_group)
        if (!ageOk) failureReasons.push('年龄不符合')
        const ageMatchErr = validateAgeGroupMatch(reg2[1] as string, age_group, playerName)
        if (ageMatchErr) failureReasons.push(ageMatchErr)
      }
      if (failureReasons.length > 0) {
        skippedList.push({ registration_id: regId, player_name: playerName, reasons: failureReasons })
        db.run(`INSERT INTO waitlist_promotion_logs
                (event_id, age_group, group_id, promoted_registration_id, promotion_order, queued_waitlist_entry_id, status, failure_reason)
                VALUES (?, ?, ?, ?, ?, ?, 'skipped', ?)`,
          [event_id, age_group, groupId, regId, promIdx + 1, entryId, failureReasons.join('；')])
        continue
      }
      slotNumber++
      db.run('INSERT INTO group_assignments (group_id, registration_id, slot_number) VALUES (?, ?, ?)', [groupId, regId, slotNumber])
      const newAsgnId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
      db.run("UPDATE registrations SET status = 'grouped', updated_at = datetime('now') WHERE id = ?", [regId])
      promIdx++
      db.run("UPDATE waitlist_entries SET status = 'promoted', promoted_at = datetime('now') WHERE id = ?", [entryId])
      db.run(`INSERT INTO waitlist_promotion_logs
              (event_id, age_group, group_id, promoted_registration_id, promotion_order, queued_waitlist_entry_id, promoted_assignment_id, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
        [event_id, age_group, groupId, regId, promIdx, entryId, newAsgnId])
      promotedList.push({ registration_id: regId, player_name: playerName, slot_number: slotNumber, assignment_id: newAsgnId })
      break
    }
    logAction('WAITLIST_PROMOTION_EXEC', 'waitlist_promotion_logs', event_id,
      `Promoted ${promotedList.length}, skipped ${skippedList.length} for ${event_id}/${age_group}`)
    res.json({ success: true, promoted: promotedList, skipped: skippedList })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/withdrawal-and-promote', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { registration_id, group_id, reason, approve } = req.body
    if (!registration_id || !group_id) {
      res.status(400).json({ success: false, error: 'registration_id, group_id required' })
      return
    }
    const grpRes = db.exec('SELECT event_id, published, group_name FROM groups WHERE id = ?', [group_id])
    if (!grpRes[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Group not found' })
      return
    }
    const grp = grpRes[0].values[0]
    const eventId = grp[0] as number
    const published = grp[1] as number
    const groupName = grp[2] as string
    if (!published) {
      res.status(400).json({ success: false, error: '发布分组才能触发退赛-递补流程；未发布分组请直接调整选手' })
      return
    }
    const asgnRes = db.exec('SELECT slot_number FROM group_assignments WHERE registration_id = ? AND group_id = ? AND is_withdrawn = 0', [registration_id, group_id])
    if (!asgnRes[0]?.values?.length) {
      res.status(400).json({ success: false, error: '选手不在该分组或已退赛' })
      return
    }
    const slotNumber = asgnRes[0].values[0][0]
    if (approve !== false) {
      const existingWd = db.exec("SELECT id FROM withdrawals WHERE registration_id = ? AND group_id = ? AND status = 'pending'", [registration_id, group_id])
      let wdId: any
      if (existingWd[0]?.values?.length) {
        wdId = existingWd[0].values[0][0]
        db.run("UPDATE withdrawals SET status = 'approved', approved_at = datetime('now') WHERE id = ?", [wdId])
      } else {
        db.run(`INSERT INTO withdrawals (registration_id, group_id, reason, status, approved_at) VALUES (?, ?, ?, 'approved', datetime('now'))`,
          [registration_id, group_id, reason || '发布后退赛'])
        wdId = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
      }
      db.run('UPDATE group_assignments SET is_withdrawn = 1, withdrawal_reason = ? WHERE registration_id = ? AND group_id = ? AND is_withdrawn = 0',
        [reason || '发布后退赛', registration_id, group_id])
      db.run("UPDATE registrations SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?", [registration_id])
      logAction('WITHDRAWAL_AND_VACANCY', 'withdrawals', wdId,
        `Withdrawal reg ${registration_id} from group ${group_id}, slot ${slotNumber} vacated: ${groupName}`)
      const ageGroup = extractAgeGroup(groupName)
      const promoted: any[] = []
      const skipped: any[] = []
      const wlRes = db.exec(`
        SELECT we.id, we.registration_id, we.queue_order, r.player_name, r.status, r.proof_verified, p.status as pay_status, r.birth_year, r.age_group
        FROM waitlist_entries we
        JOIN registrations r ON r.id = we.registration_id
        LEFT JOIN payments p ON p.registration_id = r.id
        WHERE we.event_id = ? AND we.age_group = ? AND we.status = 'waiting'
        ORDER BY we.queue_order ASC, we.payment_time ASC
      `, [eventId, ageGroup])
      const wls = wlRes[0]?.values ?? []
      let promOrder = 0
      let nextSlot = slotNumber
      for (const w of wls) {
        const entryId = w[0] as number
        const regId = w[1] as number
        const pName = w[3] as string
        const rStatus = w[4] as string
        const proofV = w[5] as number
        const payS = w[6] as string
        const reasons: string[] = []
        if (payS !== 'confirmed') reasons.push('未缴费')
        if (!proofV) reasons.push('证明缺失')
        const adjRes = db.exec(`SELECT id FROM payment_adjustments WHERE registration_id = ? AND finance_confirmed = 0 AND status = 'pending'`, [regId])
        if (adjRes[0]?.values?.length) reasons.push('差额缴费未确认，不可递补')
        const rulesR = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ?', [eventId])
        const rules = rulesR[0]?.values?.map(v2 => ({ group_name: v2[0], min_age: v2[1], max_age: v2[2] })) ?? []
        const age2 = new Date().getFullYear() - Number(w[7])
        const ageOk = rules.some(r2 => age2 >= Number(r2.min_age) && age2 <= Number(r2.max_age) && r2.group_name === ageGroup)
        if (!ageOk) reasons.push('年龄不符')
        const ageErr = validateAgeGroupMatch(w[8] as string, ageGroup, pName)
        if (ageErr) reasons.push(ageErr)
        if (reasons.length > 0) {
          promOrder++
          skipped.push({ registration_id: regId, player_name: pName, reasons })
          db.run(`INSERT INTO waitlist_promotion_logs
                  (event_id, age_group, group_id, vacated_slot_number, vacated_registration_id, vacated_reason,
                   promoted_registration_id, promotion_order, queued_waitlist_entry_id, status, failure_reason)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'skipped', ?)`,
            [eventId, ageGroup, group_id, slotNumber, registration_id, reason || '发布后退赛',
              regId, promOrder, entryId, reasons.join('；')])
          continue
        }
        promOrder++
        nextSlot++
        db.run('INSERT INTO group_assignments (group_id, registration_id, slot_number) VALUES (?, ?, ?)', [group_id, regId, nextSlot])
        const asgnId2 = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
        db.run("UPDATE registrations SET status = 'grouped', updated_at = datetime('now') WHERE id = ?", [regId])
        db.run("UPDATE waitlist_entries SET status = 'promoted', promoted_at = datetime('now') WHERE id = ?", [entryId])
        db.run(`INSERT INTO waitlist_promotion_logs
                (event_id, age_group, group_id, vacated_slot_number, vacated_registration_id, vacated_reason,
                 promoted_registration_id, promotion_order, queued_waitlist_entry_id, promoted_assignment_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
          [eventId, ageGroup, group_id, slotNumber, registration_id, reason || '发布后退赛',
            regId, promOrder, entryId, asgnId2])
        promoted.push({ registration_id: regId, player_name: pName, assignment_id: asgnId2, slot_number: nextSlot })
        break
      }
      res.json({
        success: true,
        withdrawal: { registration_id, group_id, vacated_slot: slotNumber },
        waitlist_promotion: { promoted, skipped },
        message: `已记录退赛，释放空位${promoted.length ? '，候补递补成功' : skipped.length ? '，但候补被跳过（见skipped）' : '，无可用候补'}`
      })
    } else {
      res.json({ success: true, message: '仅模拟不批准' })
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/promotion-logs', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { event_id, group_id } = req.query
    let sql = `SELECT wpl.*, e.name as event_name, g.group_name,
                      r1.player_name as vacated_name, r2.player_name as promoted_name,
                      we.queue_order
               FROM waitlist_promotion_logs wpl
               JOIN events e ON e.id = wpl.event_id
               LEFT JOIN groups g ON g.id = wpl.group_id
               LEFT JOIN registrations r1 ON r1.id = wpl.vacated_registration_id
               LEFT JOIN registrations r2 ON r2.id = wpl.promoted_registration_id
               LEFT JOIN waitlist_entries we ON we.id = wpl.queued_waitlist_entry_id
               WHERE 1=1`
    const params: any[] = []
    if (event_id) { sql += ' AND wpl.event_id = ?'; params.push(event_id) }
    if (group_id) { sql += ' AND wpl.group_id = ?'; params.push(group_id) }
    sql += ' ORDER BY wpl.id DESC'
    const result = db.exec(sql, params)
    const rows = result[0]?.values?.map(v => ({
      id: v[0], event_id: v[1], age_group: v[2], group_id: v[3],
      vacated_slot_number: v[4], vacated_registration_id: v[5], vacated_reason: v[6],
      promoted_registration_id: v[7], promotion_order: v[8], queued_waitlist_entry_id: v[9],
      promoted_assignment_id: v[10], status: v[11], failure_reason: v[12], created_at: v[13],
      event_name: v[14], group_name: v[15], vacated_name: v[16], promoted_name: v[17], queue_order: v[18]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/payment-adjustments', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { status, registration_id } = req.query
    let sql = `SELECT pa.*, r.player_name, e.name as orig_event,
                      pc.original_event_id, pc.target_event_id, pc.original_age_group, pc.target_age_group,
                      e2.name as target_event
               FROM payment_adjustments pa
               JOIN registrations r ON r.id = pa.registration_id
               LEFT JOIN project_changes pc ON pc.id = pa.project_change_id
               LEFT JOIN events e ON e.id = pc.original_event_id
               LEFT JOIN events e2 ON e2.id = pc.target_event_id WHERE 1=1`
    const params: any[] = []
    if (status) { sql += ' AND pa.status = ?'; params.push(status) }
    if (registration_id) { sql += ' AND pa.registration_id = ?'; params.push(registration_id) }
    sql += ' ORDER BY pa.id DESC'
    const result = db.exec(sql, params)
    const rows = result[0]?.values?.map(v => ({
      id: v[0], registration_id: v[1], project_change_id: v[2],
      original_amount: v[3], new_amount: v[4], difference: v[5], adjustment_type: v[6],
      finance_confirmed: !!v[7], confirmed_by: v[8], confirmed_at: v[9], payment_reference: v[10],
      status: v[11], created_at: v[12], player_name: v[13],
      original_event: v[14], original_event_id: v[15], target_event_id: v[16],
      original_age_group: v[17], target_age_group: v[18], target_event: v[19]
    })) ?? []
    res.json({ success: true, data: rows })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/payment-adjustments/:id/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const adjId = req.params.id
    const { confirmed_by, payment_reference } = req.body
    const adjRes = db.exec('SELECT * FROM payment_adjustments WHERE id = ?', [adjId])
    if (!adjRes[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Adjustment not found' })
      return
    }
    const adj = adjRes[0].values[0]
    if (adj[11] !== 'pending') {
      res.status(400).json({ success: false, error: '状态非待确认' })
      return
    }
    const projChangeId = adj[2]
    db.run("UPDATE payment_adjustments SET status = 'confirmed', finance_confirmed = 1, confirmed_at = datetime('now'), confirmed_by = ?, payment_reference = ? WHERE id = ?",
      [confirmed_by || 'finance', payment_reference || '', adjId])
    if (projChangeId) {
      db.run("UPDATE project_changes SET difference_status = 'paid', change_status = 'approved', paid_at = datetime('now'), approved_at = datetime('now') WHERE id = ?", [projChangeId])
      const pcRes = db.exec('SELECT registration_id, target_event_id, target_age_group FROM project_changes WHERE id = ?', [projChangeId])
      if (pcRes[0]?.values?.length) {
        const pc = pcRes[0].values[0]
        db.run('UPDATE registrations SET event_id = ?, age_group = ?, updated_at = datetime(\'now\') WHERE id = ?',
          [pc[1], pc[2], pc[0]])
      }
    }
    logAction('PAYMENT_ADJUST_CONFIRM', 'payment_adjustments', adjId, `Finance confirmed, diff=${adj[5]}`)
    res.json({ success: true, message: '财务确认完成，差额缴费已入组' })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/grouping/check-assign-eligibility', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb()
    const { registration_ids, group_id } = req.body
    if (!registration_ids || !group_id) {
      res.status(400).json({ success: false, error: 'registration_ids, group_id required' })
      return
    }
    const grpRes = db.exec('SELECT event_id, published, group_name FROM groups WHERE id = ?', [group_id])
    if (!grpRes[0]?.values?.length) {
      res.status(404).json({ success: false, error: 'Group not found' })
      return
    }
    const g = grpRes[0].values[0]
    const eventId = g[0] as number
    const published = g[1] as number
    const groupName = g[2] as string
    const groupAgeGroup = extractAgeGroup(groupName)
    if (published) {
      res.status(400).json({ success: false, error: '分组已发布，不可入组' })
      return
    }
    const errors: any[] = []
    const ok: any[] = []
    for (const rid of registration_ids) {
      const regRes = db.exec('SELECT * FROM registrations WHERE id = ?', [rid])
      if (!regRes[0]?.values?.length) {
        errors.push({ registration_id: rid, reason: '不存在' })
        continue
      }
      const r = regRes[0].values[0]
      const rStatus = r[11] as string
      const rProof = r[10] as number
      const rEvent = r[8] as number
      const rName = r[1] as string
      const rBirth = r[4] as number
      const rAgeG = r[5] as string
      const pcPendingRes = db.exec(`
        SELECT pc.id, pc.fee_difference, pc.difference_status, pc.change_status
        FROM project_changes pc
        WHERE pc.registration_id = ? AND pc.change_status = 'pending'
          AND pc.target_event_id = ? AND pc.difference_status = 'unpaid'
        ORDER BY pc.id DESC LIMIT 1
      `, [rid, eventId])
      if (pcPendingRes[0]?.values?.length) {
        errors.push({ registration_id: rid, player_name: rName, reason: '改项目产生的差额未缴费，财务确认前不得入组', kind: 'fee_diff_unpaid' })
        continue
      }
      if (Number(rEvent) !== Number(eventId)) {
        errors.push({ registration_id: rid, player_name: rName, reason: '赛事不匹配' })
        continue
      }
      if (rStatus !== 'paid' && rStatus !== 'grouped') {
        errors.push({ registration_id: rid, player_name: rName, reason: `状态 ${rStatus} 不可入组` })
        continue
      }
      if (!rProof) {
        errors.push({ registration_id: rid, player_name: rName, reason: '参赛证明未验证' })
        continue
      }
      const ageErr = validateAgeGroupMatch(rAgeG, groupAgeGroup, rName)
      if (ageErr) {
        errors.push({ registration_id: rid, player_name: rName, reason: ageErr })
        continue
      }
      const age = new Date().getFullYear() - Number(rBirth)
      const rulesR = db.exec('SELECT group_name, min_age, max_age FROM age_rules WHERE event_id = ?', [eventId])
      const rules = rulesR[0]?.values?.map(v2 => ({ group_name: v2[0], min_age: v2[1], max_age: v2[2] })) ?? []
      const ok2 = rules.some(r2 => age >= Number(r2.min_age) && age <= Number(r2.max_age))
      if (!ok2) {
        errors.push({ registration_id: rid, player_name: rName, reason: `年龄 ${age} 不符赛事限制` })
        continue
      }
      ok.push({ registration_id: rid, player_name: rName })
    }
    res.json({ success: true, eligible: ok, ineligible: errors, can_assign: errors.length === 0 })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
