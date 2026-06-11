#!/bin/bash
set -e

BASE_URL="${1:-http://localhost:3001}"
PASS=0
FAIL=0

ok() { echo "  ✅ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL + 1)); }

echo ""
echo "========================================="
echo "  体育赛事报名分组系统 - 集成验证"
echo "  目标: $BASE_URL"
echo "========================================="
echo ""

echo "--- 检查服务是否运行 ---"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/events")
if [ "$HTTP" = "200" ]; then ok "服务正常响应"; else fail "服务返回 $HTTP"; exit 1; fi
echo ""

echo "--- 测试1: 重复证件号报名应被拒绝 ---"
REG1=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=测试选手A" \
  -F "id_number=DUPLICATE001" \
  -F "phone=13800001111" \
  -F "birth_year=2000" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900001111")
echo "  首次报名: $REG1"

REG2=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=测试选手B" \
  -F "id_number=DUPLICATE001" \
  -F "phone=13800002222" \
  -F "birth_year=2001" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900002222")
HTTP2=$(echo "$REG2" | tail -1)
BODY2=$(echo "$REG2" | sed '$d')
echo "  重复报名: HTTP=$HTTP2, Body=$BODY2"

if [ "$HTTP2" = "400" ] || echo "$BODY2" | grep -qi "duplicate\|重复\|already"; then
  ok "重复证件号报名被拒绝"
else
  fail "重复证件号报名未被拒绝"
fi
echo ""

echo "--- 测试2: 未缴费选手入组应失败 ---"
REG3=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=未缴费选手" \
  -F "id_number=UNPAID001" \
  -F "phone=13800003333" \
  -F "birth_year=2000" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900003333")
REG3_ID=$(echo "$REG3" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "  创建报名 ID=$REG3_ID"

ASSIGN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":1,\"registrationIds\":[$REG3_ID]}")
HTTP3=$(echo "$ASSIGN" | tail -1)
BODY3=$(echo "$ASSIGN" | sed '$d')
echo "  入组结果: HTTP=$HTTP3, Body=$BODY3"

if [ "$HTTP3" = "400" ] || echo "$BODY3" | grep -qi "not.*paid\|must be.*paid\|status"; then
  ok "未缴费选手入组被拒绝"
else
  fail "未缴费选手入组未被拒绝"
fi
echo ""

echo "--- 测试3: 完整流程 (报名→缴费→入组→发布→退赛) ---"

REG4=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=全流程选手" \
  -F "id_number=FULLFLOW001" \
  -F "phone=13800004444" \
  -F "birth_year=2000" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900004444")
REG4_ID=$(echo "$REG4" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "  创建报名 ID=$REG4_ID"

VERIFY=$(curl -s -X POST "$BASE_URL/api/registrations/$REG4_ID/proof" \
  -F "proof=@/dev/null;filename=proof.pdf")
echo "  验证证明: $VERIFY"

PAY=$(curl -s -X POST "$BASE_URL/api/payments/$REG4_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"amount":200}')
echo "  确认缴费: $PAY"

ASSIGN4=$(curl -s -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":1,\"registrationIds\":[$REG4_ID]}")
echo "  分组结果: $ASSIGN4"

if echo "$ASSIGN4" | grep -q '"success":true'; then
  ok "缴费+验证后选手成功入组"
else
  fail "缴费+验证后选手入组失败"
fi

PUB=$(curl -s -X POST "$BASE_URL/api/groupings/publish" \
  -H "Content-Type: application/json" \
  -d '{"groupIds":[1]}')
echo "  发布分组: $PUB"

WITHDRAW=$(curl -s -X POST "$BASE_URL/api/withdrawals" \
  -H "Content-Type: application/json" \
  -d "{\"registrationId\":$REG4_ID,\"groupId\":1,\"reason\":\"测试退赛\"}")
echo "  提交退赛: $WITHDRAW"

WITHDRAW_ID=$(echo "$WITHDRAW" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

if [ -n "$WITHDRAW_ID" ]; then
  ok "已发布分组选手可提交退赛"
else
  fail "已发布分组选手提交退赛失败"
fi

APPROVE=$(curl -s -X PUT "$BASE_URL/api/withdrawals/$WITHDRAW_ID/approve")
echo "  批准退赛: $APPROVE"

if echo "$APPROVE" | grep -q '"success":true'; then
  ok "退赛审批成功"
else
  fail "退赛审批失败"
fi
echo ""

echo "--- 测试4: 未上传证明选手入组应失败 ---"
REG5=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=无证明选手" \
  -F "id_number=NOPROOF001" \
  -F "phone=13800005555" \
  -F "birth_year=2000" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900005555")
REG5_ID=$(echo "$REG5" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')

PAY5=$(curl -s -X POST "$BASE_URL/api/payments/$REG5_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"amount":200}')
echo "  确认缴费: $PAY5"

ASSIGN5=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":2,\"registrationIds\":[$REG5_ID]}")
HTTP5=$(echo "$ASSIGN5" | tail -1)
BODY5=$(echo "$ASSIGN5" | sed '$d')
echo "  入组结果: HTTP=$HTTP5, Body=$BODY5"

if [ "$HTTP5" = "400" ] || echo "$BODY5" | grep -qi "proof\|证明"; then
  ok "未验证证明选手入组被拒绝"
else
  fail "未验证证明选手入组未被拒绝"
fi
echo ""

echo "========================================="
echo "  验证结果: $PASS 通过, $FAIL 失败"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then exit 1; fi
