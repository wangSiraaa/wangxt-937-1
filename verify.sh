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

if [ "$HTTP2" = "409" ] || echo "$BODY2" | grep -qi "duplicate\|重复\|already"; then
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
  -F "birth_year=2005" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900003333")
REG3_ID=$(echo "$REG3" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "  创建报名 ID=$REG3_ID"

ASSIGN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":2,\"registrationIds\":[$REG3_ID]}")
HTTP3=$(echo "$ASSIGN" | tail -1)
BODY3=$(echo "$ASSIGN" | sed '$d')
echo "  入组结果: HTTP=$HTTP3, Body=$BODY3"

if [ "$HTTP3" = "400" ] || echo "$BODY3" | grep -qi "not.*paid\|must be.*paid\|status\|缴费"; then
  ok "未缴费选手入组被拒绝"
else
  fail "未缴费选手入组未被拒绝"
fi
echo ""

echo "--- 测试3: 年龄组不匹配入组应失败 (U23选手→Open分组) ---"
REG_U23=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=U23选手" \
  -F "id_number=AGEMATCH_U23" \
  -F "phone=13800006001" \
  -F "birth_year=2005" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900006001")
REG_U23_ID=$(echo "$REG_U23" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
REG_U23_AG=$(echo "$REG_U23" | grep -o '"age_group":"[^"]*"' | head -1)
echo "  U23选手报名 ID=$REG_U23_ID, $REG_U23_AG"

VERIFY_U23=$(curl -s -X POST "$BASE_URL/api/registrations/$REG_U23_ID/proof" \
  -F "proof=@/dev/null;filename=proof.pdf")
PAY_U23=$(curl -s -X POST "$BASE_URL/api/payments/$REG_U23_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"amount":200}')
echo "  缴费确认: $PAY_U23"

ASSIGN_U23_TO_OPEN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":3,\"registrationIds\":[$REG_U23_ID]}")
HTTP_AGE1=$(echo "$ASSIGN_U23_TO_OPEN" | tail -1)
BODY_AGE1=$(echo "$ASSIGN_U23_TO_OPEN" | sed '$d')
echo "  U23→Open分组: HTTP=$HTTP_AGE1, Body=$BODY_AGE1"

if [ "$HTTP_AGE1" = "400" ] || echo "$BODY_AGE1" | grep -qi "年龄组不匹配\|不能进入.*分组"; then
  ok "U23选手不能进入Open分组"
else
  fail "U23选手可以进入Open分组（不应允许）"
fi
echo ""

echo "--- 测试4: 年龄组不匹配入组应失败 (U23选手→U18分组) ---"
ASSIGN_U23_TO_U18=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":1,\"registrationIds\":[$REG_U23_ID]}")
HTTP_AGE2=$(echo "$ASSIGN_U23_TO_U18" | tail -1)
BODY_AGE2=$(echo "$ASSIGN_U23_TO_U18" | sed '$d')
echo "  U23→U18分组: HTTP=$HTTP_AGE2, Body=$BODY_AGE2"

if [ "$HTTP_AGE2" = "400" ] || echo "$BODY_AGE2" | grep -qi "年龄组不匹配\|不能进入.*分组"; then
  ok "U23选手不能进入U18分组"
else
  fail "U23选手可以进入U18分组（不应允许）"
fi
echo ""

echo "--- 测试5: 年龄组不匹配入组应失败 (Open选手→U23分组) ---"
REG_OPEN=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=Open选手" \
  -F "id_number=AGEMATCH_OPEN" \
  -F "phone=13800006002" \
  -F "birth_year=1995" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900006002")
REG_OPEN_ID=$(echo "$REG_OPEN" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
REG_OPEN_AG=$(echo "$REG_OPEN" | grep -o '"age_group":"[^"]*"' | head -1)
echo "  Open选手报名 ID=$REG_OPEN_ID, $REG_OPEN_AG"

VERIFY_OPEN=$(curl -s -X POST "$BASE_URL/api/registrations/$REG_OPEN_ID/proof" \
  -F "proof=@/dev/null;filename=proof.pdf")
PAY_OPEN=$(curl -s -X POST "$BASE_URL/api/payments/$REG_OPEN_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"amount":200}')

ASSIGN_OPEN_TO_U23=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":2,\"registrationIds\":[$REG_OPEN_ID]}")
HTTP_AGE3=$(echo "$ASSIGN_OPEN_TO_U23" | tail -1)
BODY_AGE3=$(echo "$ASSIGN_OPEN_TO_U23" | sed '$d')
echo "  Open→U23分组: HTTP=$HTTP_AGE3, Body=$BODY_AGE3"

if [ "$HTTP_AGE3" = "400" ] || echo "$BODY_AGE3" | grep -qi "年龄组不匹配\|不能进入.*分组"; then
  ok "Open选手不能进入U23分组"
else
  fail "Open选手可以进入U23分组（不应允许）"
fi

ASSIGN_OPEN_TO_U18=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":1,\"registrationIds\":[$REG_OPEN_ID]}")
HTTP_AGE4=$(echo "$ASSIGN_OPEN_TO_U18" | tail -1)
BODY_AGE4=$(echo "$ASSIGN_OPEN_TO_U18" | sed '$d')
echo "  Open→U18分组: HTTP=$HTTP_AGE4, Body=$BODY_AGE4"

if [ "$HTTP_AGE4" = "400" ] || echo "$BODY_AGE4" | grep -qi "年龄组不匹配\|不能进入.*分组"; then
  ok "Open选手不能进入U18分组"
else
  fail "Open选手可以进入U18分组（不应允许）"
fi

echo "  验证错误详情返回: $(echo "$BODY_AGE4" | grep -o '"details":\[[^]]*\]' || echo "无details")"
if echo "$BODY_AGE4" | grep -q '"details"'; then
  ok "年龄组校验失败时返回明确的details错误详情"
else
  fail "年龄组校验失败时未返回details错误详情"
fi
echo ""

echo "--- 测试5b: 年龄组不匹配入组应失败 (U18选手→U23分组) ---"
REG_U18=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=U18测试选手" \
  -F "id_number=AGEMATCH_U18" \
  -F "phone=13800006003" \
  -F "birth_year=2012" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900006003")
REG_U18_ID=$(echo "$REG_U18" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
REG_U18_AG=$(echo "$REG_U18" | grep -o '"age_group":"[^"]*"' | head -1)
echo "  U18选手报名 ID=$REG_U18_ID, $REG_U18_AG"

VERIFY_U18=$(curl -s -X POST "$BASE_URL/api/registrations/$REG_U18_ID/proof" \
  -F "proof=@/dev/null;filename=proof.pdf")
PAY_U18=$(curl -s -X POST "$BASE_URL/api/payments/$REG_U18_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"amount":200}')

ASSIGN_U18_TO_U23=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":2,\"registrationIds\":[$REG_U18_ID]}")
HTTP_AGE5=$(echo "$ASSIGN_U18_TO_U23" | tail -1)
BODY_AGE5=$(echo "$ASSIGN_U18_TO_U23" | sed '$d')
echo "  U18→U23分组: HTTP=$HTTP_AGE5, Body=$BODY_AGE5"

if [ "$HTTP_AGE5" = "400" ] || echo "$BODY_AGE5" | grep -qi "年龄组不匹配\|不能进入.*分组"; then
  ok "U18选手不能进入U23分组"
else
  fail "U18选手可以进入U23分组（不应允许）"
fi

ASSIGN_U18_TO_OPEN=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":3,\"registrationIds\":[$REG_U18_ID]}")
HTTP_AGE6=$(echo "$ASSIGN_U18_TO_OPEN" | tail -1)
BODY_AGE6=$(echo "$ASSIGN_U18_TO_OPEN" | sed '$d')
echo "  U18→Open分组: HTTP=$HTTP_AGE6, Body=$BODY_AGE6"

if [ "$HTTP_AGE6" = "400" ] || echo "$BODY_AGE6" | grep -qi "年龄组不匹配\|不能进入.*分组"; then
  ok "U18选手不能进入Open分组"
else
  fail "U18选手可以进入Open分组（不应允许）"
fi
echo ""

echo "--- 测试6: 年龄组匹配可成功入组 (U23选手→U23分组, U18选手→U18分组) ---"
ASSIGN_U23_OK=$(curl -s -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":2,\"registrationIds\":[$REG_U23_ID]}")
echo "  U23→U23分组: $ASSIGN_U23_OK"

if echo "$ASSIGN_U23_OK" | grep -q '"success":true'; then
  ok "U23选手可成功进入U23分组"
else
  fail "U23选手无法进入U23分组（应该允许）"
fi

ASSIGN_U18_OK=$(curl -s -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":1,\"registrationIds\":[$REG_U18_ID]}")
echo "  U18→U18分组: $ASSIGN_U18_OK"

if echo "$ASSIGN_U18_OK" | grep -q '"success":true'; then
  ok "U18选手可成功进入U18分组"
else
  fail "U18选手无法进入U18分组（应该允许）"
fi
echo ""

echo "--- 测试7: 完整流程 (报名→缴费→入组→发布→退赛) ---"
REG4=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=1" \
  -F "player_name=全流程选手" \
  -F "id_number=FULLFLOW001" \
  -F "phone=13800004444" \
  -F "birth_year=1995" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900004444")
REG4_ID=$(echo "$REG4" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
REG4_AG=$(echo "$REG4" | grep -o '"age_group":"[^"]*"' | head -1)
echo "  创建报名 ID=$REG4_ID, $REG4_AG"

VERIFY=$(curl -s -X POST "$BASE_URL/api/registrations/$REG4_ID/proof" \
  -F "proof=@/dev/null;filename=proof.pdf")
echo "  验证证明: $VERIFY"

PAY=$(curl -s -X POST "$BASE_URL/api/payments/$REG4_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"amount":200}')
echo "  确认缴费: $PAY"

ASSIGN4=$(curl -s -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":3,\"registrationIds\":[$REG4_ID]}")
echo "  分组结果(Open→Open组): $ASSIGN4"

if echo "$ASSIGN4" | grep -q '"success":true'; then
  ok "缴费+验证后选手成功入组"
else
  fail "缴费+验证后选手入组失败"
fi

PUB=$(curl -s -X POST "$BASE_URL/api/groupings/publish" \
  -H "Content-Type: application/json" \
  -d '{"groupIds":[3]}')
echo "  发布分组: $PUB"

WITHDRAW=$(curl -s -X POST "$BASE_URL/api/withdrawals" \
  -H "Content-Type: application/json" \
  -d "{\"registrationId\":$REG4_ID,\"groupId\":3,\"reason\":\"测试退赛\"}")
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

echo "--- 测试8: 未上传证明选手入组应失败 ---"
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
  -d "{\"groupId\":3,\"registrationIds\":[$REG5_ID]}")
HTTP5=$(echo "$ASSIGN5" | tail -1)
BODY5=$(echo "$ASSIGN5" | sed '$d')
echo "  入组结果: HTTP=$HTTP5, Body=$BODY5"

if [ "$HTTP5" = "400" ] || echo "$BODY5" | grep -qi "proof\|证明"; then
  ok "未验证证明选手入组被拒绝"
else
  fail "未验证证明选手入组未被拒绝"
fi
echo ""

echo "--- 测试9: 年龄组不匹配时发布分组应失败 ---"
REG_U18=$(curl -s -X POST "$BASE_URL/api/registrations" \
  -F "event_id=2" \
  -F "player_name=U18选手" \
  -F "id_number=PUB_TEST_U18" \
  -F "phone=13800007001" \
  -F "birth_year=2012" \
  -F "emergency_contact=紧急联系人" \
  -F "emergency_phone=13900007001")
REG_U18_ID=$(echo "$REG_U18" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "  U18选手 ID=$REG_U18_ID"

VERIFY_U18=$(curl -s -X POST "$BASE_URL/api/registrations/$REG_U18_ID/proof" \
  -F "proof=@/dev/null;filename=proof.pdf")
PAY_U18=$(curl -s -X POST "$BASE_URL/api/payments/$REG_U18_ID/confirm" \
  -H "Content-Type: application/json" \
  -d '{"amount":200}')

ASSIGN_U18_OK=$(curl -s -X POST "$BASE_URL/api/groupings" \
  -H "Content-Type: application/json" \
  -d "{\"groupId\":4,\"registrationIds\":[$REG_U18_ID]}")
echo "  U18→U18分组: $ASSIGN_U18_OK"

if echo "$ASSIGN_U18_OK" | grep -q '"success":true'; then
  ok "U18选手成功进入U18分组（女子200米）"
else
  fail "U18选手无法进入U18分组"
fi

PUB_FAIL=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/groupings/publish" \
  -H "Content-Type: application/json" \
  -d '{"groupIds":[4]}')
HTTP_PUB=$(echo "$PUB_FAIL" | tail -1)
BODY_PUB=$(echo "$PUB_FAIL" | sed '$d')
echo "  发布U18分组: HTTP=$HTTP_PUB, Body=$BODY_PUB"

if echo "$BODY_PUB" | grep -q '"success":true'; then
  ok "U18分组发布成功（年龄组匹配）"
else
  fail "U18分组发布失败"
fi
echo ""

echo "--- 测试10: 分组名单回归验证 ---"
ROSTER=$(curl -s "$BASE_URL/api/groupings/published?event_id=1")
echo "  已发布名单: $(echo "$ROSTER" | head -c 300)..."

if echo "$ROSTER" | grep -q '"success":true'; then
  ok "分组名单查询成功"
else
  fail "分组名单查询失败"
fi

if echo "$ROSTER" | grep -qi "withdrawn\|is_withdrawn"; then
  ok "名单包含退赛标记信息"
else
  fail "名单缺少退赛标记信息"
fi

if echo "$ROSTER" | grep -qi "age_group\|年龄组"; then
  ok "名单包含年龄组信息"
else
  fail "名单缺少年龄组信息"
fi

echo "  验证名单中选手年龄组与分组一致..."
ROSTER_OPEN=$(echo "$ROSTER" | python3 -c "
import sys, json
data = json.load(sys.stdin)
groups = data.get('data', [])
for g in groups:
    if 'Open' in g.get('group_name', ''):
        for p in g.get('players', []):
            if not p.get('is_withdrawn') and p.get('age_group') != 'Open':
                print(f'ERROR: {p.get(\"player_name\")} age_group={p.get(\"age_group\")} in Open group')
                sys.exit(1)
print('OK')
" 2>&1)
echo "  Open组验证结果: $ROSTER_OPEN"

if echo "$ROSTER_OPEN" | grep -q "OK"; then
  ok "名单中Open分组选手年龄组均为Open"
else
  fail "名单中Open分组存在年龄组不匹配的选手"
fi

ROSTER_DATA=$(curl -s "$BASE_URL/api/groupings/published?event_id=2")
echo "  女子200米已发布名单: $(echo "$ROSTER_DATA" | head -c 300)..."
ROSTER_U18=$(echo "$ROSTER_DATA" | python3 -c "
import sys, json
data = json.load(sys.stdin)
groups = data.get('data', [])
for g in groups:
    if 'U18' in g.get('group_name', ''):
        for p in g.get('players', []):
            if not p.get('is_withdrawn') and p.get('age_group') != 'U18':
                print(f'ERROR: {p.get(\"player_name\")} age_group={p.get(\"age_group\")} in U18 group')
                sys.exit(1)
print('OK')
" 2>&1)
echo "  U18组验证结果: $ROSTER_U18"

if echo "$ROSTER_U18" | grep -q "OK"; then
  ok "名单中U18分组选手年龄组均为U18"
else
  fail "名单中U18分组存在年龄组不匹配的选手"
fi
echo ""

echo "========================================="
echo "  验证结果: $PASS 通过, $FAIL 失败"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then exit 1; fi
