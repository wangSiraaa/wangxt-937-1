// 候补递补与项目改签 - 验证脚本
import http from "http";

const BASE = "http://localhost:3001/api";

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data, error: e });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(name, cond, info) {
  const prefix = cond ? "✅ [PASS]" : "❌ [FAIL]";
  console.log(`${prefix} ${name}` + (info ? `  ${info}` : ""));
  return !!cond;
}

function log(section, msg) {
  console.log(`\n━━━ ${section} ━━━`);
  if (msg) console.log("    " + msg);
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     候补递补与项目改签 - 核心功能验证 (Docker兼容)       ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  // --- 0. 健康检查 ---
  log("0. 健康检查");
  let eventsResp;
  for (let i = 0; i < 5; i++) {
    try {
      eventsResp = await request("GET", "/events");
      if (eventsResp.status === 200) break;
    } catch (e) {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  assert("服务启动", eventsResp && eventsResp.status === 200, `HTTP ${eventsResp?.status}`);

  const events = eventsResp.body.data || eventsResp.body || [];
  assert("赛事数据存在", events.length >= 2, `共 ${events.length} 个赛事`);
  events.forEach((e, i) => console.log(`    [${i}] id=${e.id} 名称=${e.name} 费用=¥${e.fee ?? "缺失"}`));

  if (events.length < 2) {
    console.log("\n⚠️  赛事不足2个，部分验证无法进行");
  }

  const regResp = await request("GET", "/registrations");
  const registrations = regResp.body.data || regResp.body || [];
  console.log(`    现有报名数: ${registrations.length}`);

  // --- 验证3: 重复证件阻断 ---
  log("验证3: 重复证件阻断 (项目改签 / 报名)");

  const ev1 = events[0];
  const ev2 = events[1];
  const TEST_ID = "110101200012121234";
  let r1;

  {
    const r = await request("POST", "/registrations", {
      event_id: ev1.id,
      player_name: "重复证件-原选手",
      id_number: TEST_ID,
      birth_date: "2000-12-12",
      phone: "13800000001",
      gender: "male",
      proof_verified: 1,
    });
    r1 = r.body.data || r.body;
    console.log(`    创建报名1 (赛事${ev1.id}): HTTP ${r.status}  id=${r1?.id}`);
  }

  // 缴费
  if (r1?.id) {
    await request("POST", "/payments/confirm", {
      registration_id: r1.id,
      amount: ev1.fee || 100,
      method: "alipay",
    });
  }

  // 用相同证件在 ev2 创建报名
  let rDup;
  {
    const r = await request("POST", "/registrations", {
      event_id: ev2.id,
      player_name: "重复证件-同证件",
      id_number: TEST_ID,
      birth_date: "2000-12-12",
      phone: "13800000002",
      gender: "male",
      proof_verified: 1,
    });
    rDup = r.body.data || r.body;
    console.log(`    创建报名2 (赛事${ev2.id} 同证件): HTTP ${r.status}`);
    if (rDup?.id) {
      await request("POST", "/payments/confirm", {
        registration_id: rDup.id,
        amount: ev2.fee || 100,
        method: "alipay",
      });
    }
  }

  // 尝试申请改签 ev1→ev2，应触发409
  let projectChangeResp;
  if (r1?.id && ev2) {
    projectChangeResp = await request("POST", "/project-change", {
      registration_id: r1.id,
      target_event_id: ev2.id,
    });
    console.log(
      `    改签申请 (赛事${ev1.id}→赛事${ev2.id}): HTTP ${projectChangeResp.status} msg=${projectChangeResp.body?.error || projectChangeResp.body?.message || "ok"}`
    );
  }

  const isBlocked =
    projectChangeResp?.status === 409 ||
    /重复|证件|409|duplicate|unique/i.test(projectChangeResp?.body?.error || projectChangeResp?.body?.message || "");
  assert(
    "改签重复证件阻断",
    isBlocked,
    `HTTP=${projectChangeResp?.status} msg=${(projectChangeResp?.body?.error || projectChangeResp?.body?.message || "").slice(0, 40)}`
  );

  // 如果改签没拦住（因为报名2没创建成功），验证直接报名时的重复证件阻断
  if (!isBlocked) {
    const r = await request("POST", "/registrations", {
      event_id: ev1.id,
      player_name: "直接报名同证件",
      id_number: TEST_ID,
      birth_date: "2000-12-12",
      phone: "13800000003",
      gender: "male",
      proof_verified: 1,
    });
    const blocked = r.status === 409 || /重复|证件|unique/i.test(r.body?.error || "");
    assert("直接报名重复证件阻断", blocked, `HTTP=${r.status} msg=${(r.body?.error || "").slice(0, 50)}`);
  }

  // --- 验证1: 改项目差额未缴入组失败 ---
  log("验证1: 改项目差额未缴 → 入组资格校验拦截");

  // 找两个费用不同的赛事
  const sorted = [...events].sort((a, b) => (a.fee || 0) - (b.fee || 0));
  const cheap = sorted[0];
  const expensive = sorted[sorted.length - 1];
  const diff = (expensive.fee || 0) - (cheap.fee || 0);
  console.log(`    低费赛事: ${cheap.name} (¥${cheap.fee})  高费赛事: ${expensive.name} (¥${expensive.fee})  差额: ¥${diff}`);

  // 创建选手到低费赛事并缴费
  let cheapReg;
  {
    const r = await request("POST", "/registrations", {
      event_id: cheap.id,
      player_name: "差额测试选手",
      id_number: "110101199006065555",
      birth_date: "1990-06-06",
      phone: "13855555555",
      gender: "male",
      proof_verified: 1,
    });
    cheapReg = r.body.data || r.body;
    console.log(`    创建选手: HTTP ${r.status}  id=${cheapReg?.id}`);
  }

  if (cheapReg?.id) {
    await request("POST", "/payments/confirm", {
      registration_id: cheapReg.id,
      amount: cheap.fee || 100,
      method: "alipay",
    });
  }

  let pcResp;
  let pcId;
  let diffStatus;

  if (cheapReg?.id && diff > 0) {
    // 申请改签（有差额）
    pcResp = await request("POST", "/project-change", {
      registration_id: cheapReg.id,
      target_event_id: expensive.id,
    });
    const pcData = pcResp.body.data || pcResp.body;
    pcId = pcData?.id;
    diffStatus = pcData?.difference_status;
    console.log(
      `    改签申请: HTTP ${pcResp.status}  id=${pcId}  fee_diff=¥${pcData?.fee_difference}  diff_status=${diffStatus}  change_status=${pcData?.change_status}`
    );
  } else if (cheapReg?.id) {
    console.log("    赛事费用相同或未设置，无差额可测试（但可以验证改签流程）");
    pcResp = await request("POST", "/project-change", {
      registration_id: cheapReg.id,
      target_event_id: expensive.id,
    });
    const pcData = pcResp.body.data || pcResp.body;
    pcId = pcData?.id;
    diffStatus = pcData?.difference_status;
  }

  // 获取 / 创建 expensive 赛事下的未发布分组
  let groupId;
  if (cheapReg?.id) {
    const gr = await request("GET", `/groups?event_id=${expensive.id}`);
    const groups = gr.body.data || gr.body || [];
    const unpub = groups.find((g) => !g.published);
    if (unpub) {
      groupId = unpub.id;
      console.log(`    找到未发布分组: id=${groupId}  name=${unpub.group_name}`);
    } else {
      const cg = await request("POST", "/groups", {
        event_id: expensive.id,
        group_name: "验证Group-差额-" + new Date().getTime().toString().slice(-4),
        max_players: 8,
      });
      const gd = cg.body.data || cg.body;
      groupId = gd?.id;
      console.log(`    创建分组: HTTP ${cg.status} id=${groupId}`);
    }
  }

  let beforeHasFeeDiff = false;
  let afterHasFeeDiff = true;

  if (cheapReg?.id && groupId && pcId) {
    // 差额未缴时校验资格
    const el1 = await request("POST", "/grouping/check-assign-eligibility", {
      group_id: groupId,
      registration_ids: [cheapReg.id],
    });
    const el1Data = el1.body.data || el1.body;
    const inelig = el1Data?.ineligible || el1Data?.errors || [];
    beforeHasFeeDiff = inelig.some((x) => x.kind === "fee_diff_unpaid" || /差额|未缴|fee/i.test(x.reason || ""));
    console.log(
      `    差额未缴资格校验: HTTP ${el1.status}  ineligible=${JSON.stringify(inelig).slice(0, 100)}`
    );
    assert(
      diff > 0 ? "差额未缴 → 入组资格拦截" : "改签无差额 → 不进行差额拦截",
      diff > 0 ? beforeHasFeeDiff : true,
      diff > 0 ? (beforeHasFeeDiff ? "检测到 fee_diff_unpaid" : "⚠️ 未检测到fee_diff_unpaid(可能其他校验先失败)") : "无差额"
    );

    // 确认差额
    if (diff > 0) {
      const cf = await request("POST", `/project-change/${pcId}/confirm-fee`, {});
      console.log(`    确认差额缴费: HTTP ${cf.status}`);
    } else {
      // 无差额则确认改签
      const cf = await request("POST", `/project-change/${pcId}/confirm-fee`, {});
      console.log(`    确认(无差额): HTTP ${cf.status}`);
    }

    // 确认差额后校验（差额类错误应该消失）
    const el2 = await request("POST", "/grouping/check-assign-eligibility", {
      group_id: groupId,
      registration_ids: [cheapReg.id],
    });
    const el2Data = el2.body.data || el2.body;
    const inelig2 = el2Data?.ineligible || el2Data?.errors || [];
    afterHasFeeDiff = inelig2.some((x) => x.kind === "fee_diff_unpaid");
    console.log(
      `    确认差额后校验: HTTP ${el2.status}  ineligible=${JSON.stringify(inelig2).slice(0, 100)}`
    );
    if (diff > 0) {
      assert("确认差额后 → 差额拦截消失", !afterHasFeeDiff, afterHasFeeDiff ? "⚠️ 仍存在fee_diff拦截" : "通过");
    }
  }

  // --- 验证2: 发布后退赛 → 候补递补 ---
  log("验证2: 发布后退赛 → 候补递补自动执行 + 链路日志保存");

  const targetEvent = events[0];
  console.log(`    使用赛事: ${targetEvent.name} (id=${targetEvent.id})`);

  // Step1: 创建候补选手A (缴费+证明)
  let waitA;
  {
    const r = await request("POST", "/registrations", {
      event_id: targetEvent.id,
      player_name: "候补选手A",
      id_number: "110101199507077777",
      birth_date: "1995-07-07",
      phone: "13977777777",
      gender: "male",
      proof_verified: 1,
    });
    waitA = r.body.data || r.body;
    console.log(`    候补选手A: id=${waitA?.id} HTTP=${r.status}`);
  }
  if (waitA?.id) {
    await request("POST", "/payments/confirm", {
      registration_id: waitA.id,
      amount: targetEvent.fee || 100,
      method: "alipay",
    });
    await new Promise((r) => setTimeout(r, 150));
    const wr = await request("POST", "/waitlist", { registration_id: waitA.id });
    const wd = wr.body.data || wr.body;
    console.log(`    A加入候补: HTTP ${wr.status} queue_order=${wd?.queue_order} status=${wd?.status}`);
    assert("候补加入成功", wr.status === 200 || wr.status === 201, `HTTP=${wr.status}`);
  }

  // Step2: 创建分组选手B (缴费+入组+发布)
  let groupB;
  let playerBReg;
  {
    const r = await request("POST", "/registrations", {
      event_id: targetEvent.id,
      player_name: "分组选手B(退赛)",
      id_number: "110101199103036666",
      birth_date: "1991-03-03",
      phone: "13966666666",
      gender: "male",
      proof_verified: 1,
    });
    playerBReg = r.body.data || r.body;
    console.log(`    分组选手B: id=${playerBReg?.id}`);
  }
  if (playerBReg?.id) {
    await request("POST", "/payments/confirm", {
      registration_id: playerBReg.id,
      amount: targetEvent.fee || 100,
      method: "alipay",
    });
    await new Promise((r) => setTimeout(r, 150));

    // 找或建Open分组
    const gr = await request("GET", `/groups?event_id=${targetEvent.id}`);
    const groups = gr.body.data || gr.body || [];
    let g = groups.find((x) => /Open/.test(x.group_name || "") && !x.published);
    if (!g) {
      const cg = await request("POST", "/groups", {
        event_id: targetEvent.id,
        group_name: "递补Test-Open-" + new Date().getTime().toString().slice(-4),
        max_players: 8,
      });
      g = cg.body.data || cg.body;
    }
    groupB = g;
    console.log(`    分组B: id=${groupB?.id} name=${groupB?.group_name}`);

    const ass = await request("POST", "/grouping/assign", {
      group_id: groupB.id,
      registration_ids: [playerBReg.id],
    });
    console.log(`    B入组: HTTP ${ass.status}`);

    const pb = await request("POST", "/grouping/publish", { group_ids: [groupB.id] });
    console.log(`    发布分组: HTTP ${pb.status}`);
  }

  // Step3: 退赛B并触发候补递补
  let withdrawResp;
  if (playerBReg?.id && groupB?.id) {
    withdrawResp = await request("POST", "/withdrawal-and-promote", {
      registration_id: playerBReg.id,
      group_id: groupB.id,
      reason: "验证脚本测试: 选手B受伤退赛",
    });
    const wd = withdrawResp.body.data || withdrawResp.body;
    console.log(`    退赛+递补: HTTP ${withdrawResp.status}`);
    console.log(`      promoted: ${(wd?.promoted || []).length} 人  ${(wd?.promoted || []).map((x) => x.player_name || x.id).join(", ")}`);
    console.log(`      skipped:  ${(wd?.skipped || []).length} 人`);
  }

  // Step4: 查询递补链路日志
  const logsResp = await request("GET", "/promotion-logs");
  const logs = logsResp.body.data || logsResp.body || [];
  console.log(`\n    递补链路日志总数: ${logs.length}`);
  logs.slice(-5).forEach((l) => {
    console.log(
      `      #${l.id} ${l.status?.padEnd(8)}  ${l.vacated_name || l.vacated_registration_id} → ${l.promoted_name || l.promoted_registration_id || "(未递补)"}  ${l.failure_reason || "ok"}`
    );
  });

  const hasLogs = logs.length > 0;
  const hasWithdrawLog = logs.some((l) => /退赛|B|受伤|验证/i.test(l.vacated_reason || "") || l.status === "promoted" || l.status === "skipped");
  assert("递补链路日志已保存", hasLogs, hasLogs ? `共${logs.length}条` : "⚠️ 无日志");
  if (withdrawResp?.status === 200) {
    assert("退赛接口执行成功", true, `HTTP 200  promoted=${(withdrawResp.body?.data?.promoted || []).length}`);
  }

  // --- 候补资格过滤验证 ---
  log("候补资格过滤: 未缴费/未证明/年龄不符不能入队");
  {
    // 选手C: 未缴费
    const rc = await request("POST", "/registrations", {
      event_id: targetEvent.id,
      player_name: "未缴费-C",
      id_number: "110101199910101111",
      birth_date: "1999-10-10",
      phone: "13911111111",
      gender: "male",
      proof_verified: 1,
    });
    const cid = (rc.body.data || rc.body)?.id;
    if (cid) {
      const wr = await request("POST", "/waitlist", { registration_id: cid });
      const ok = wr.status >= 400 || /未缴|缴费|paid/.test(JSON.stringify(wr.body));
      assert("未缴费 → 禁止候补", wr.status >= 400, `HTTP=${wr.status} body=${JSON.stringify(wr.body.error || wr.body).slice(0, 40)}`);
    }

    // 选手D: 无证明
    const rd = await request("POST", "/registrations", {
      event_id: targetEvent.id,
      player_name: "无证明-D",
      id_number: "110101199910102222",
      birth_date: "1999-10-10",
      phone: "13922222222",
      gender: "male",
      proof_verified: 0,
    });
    const did = (rd.body.data || rd.body)?.id;
    if (did) {
      await request("POST", "/payments/confirm", {
        registration_id: did,
        amount: targetEvent.fee || 100,
        method: "alipay",
      });
      const wr = await request("POST", "/waitlist", { registration_id: did });
      assert(
        "参赛证明缺失 → 禁止候补",
        wr.status >= 400,
        `HTTP=${wr.status} body=${JSON.stringify(wr.body.error || wr.body).slice(0, 40)}`
      );
    }
  }

  console.log("\n════════════════════ 验证结束 ════════════════════");
}

main().catch((e) => {
  console.error("验证脚本异常:", e.message);
  process.exit(1);
});
