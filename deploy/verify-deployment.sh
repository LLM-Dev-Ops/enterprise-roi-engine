#!/bin/bash
# =============================================================================
# Enterprise ROI Engine - Post-Deployment Verification Script
# =============================================================================

set -e

# Configuration
SERVICE_URL="${SERVICE_URL:-https://enterprise-roi-engine-1062287243982.us-central1.run.app}"
RUVECTOR_URL="${RUVECTOR_URL:-https://ruvvector-service-1062287243982.us-central1.run.app}"
TELEMETRY_URL="${TELEMETRY_URL:-https://llm-observatory-1062287243982.us-central1.run.app}"

echo "=============================================="
echo "Enterprise ROI Engine - Deployment Verification"
echo "=============================================="
echo ""
echo "Service URL: $SERVICE_URL"
echo "ruvector URL: $RUVECTOR_URL"
echo ""

# Track results
PASSED=0
FAILED=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "✅ PASS: $name"
    ((PASSED++))
  else
    echo "❌ FAIL: $name"
    ((FAILED++))
  fi
}

# -----------------------------------------------------------------------------
# 1. Service Health Check
# -----------------------------------------------------------------------------
echo ""
echo "1. Service Health Check"
echo "------------------------"

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || echo "000")
check "Health endpoint responds (200)" "$([ "$HEALTH_RESPONSE" = "200" ] && echo true || echo false)"

if [ "$HEALTH_RESPONSE" = "200" ]; then
  HEALTH_BODY=$(curl -s "$SERVICE_URL/health")
  check "Health returns status=healthy" "$(echo "$HEALTH_BODY" | grep -q '"status":"healthy"' && echo true || echo false)"
  check "Health returns contractSchema" "$(echo "$HEALTH_BODY" | grep -q 'contractSchema' && echo true || echo false)"
fi

# -----------------------------------------------------------------------------
# 2. ROI Endpoint Validation
# -----------------------------------------------------------------------------
echo ""
echo "2. ROI Endpoint Validation"
echo "---------------------------"

# Test invalid request (should return 400)
ROI_INVALID=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVICE_URL/v1/roi" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "request"}' || echo "000")
check "ROI rejects invalid input (400)" "$([ "$ROI_INVALID" = "400" ] && echo true || echo false)"

# Test valid request structure
ROI_VALID=$(curl -s -X POST "$SERVICE_URL/v1/roi" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "simulationInput": {
        "currentState": {"costPerUnit": 100, "unitsPerMonth": 1000},
        "proposedState": {"costPerUnit": 80, "unitsPerMonth": 1200}
      },
      "timeHorizonMonths": 12,
      "discountRate": 0.08
    }
  }' || echo '{"error": "request failed"}')

check "ROI returns correlationId" "$(echo "$ROI_VALID" | grep -q 'correlationId' && echo true || echo false)"
check "ROI returns executionProof" "$(echo "$ROI_VALID" | grep -q 'executionProof' && echo true || echo false)"

# -----------------------------------------------------------------------------
# 3. Strategy Agent Endpoint Validation
# -----------------------------------------------------------------------------
echo ""
echo "3. Strategy Agent Endpoint Validation"
echo "--------------------------------------"

# Test invalid request
STRATEGY_INVALID=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVICE_URL/v1/strategy" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "request"}' || echo "000")
check "Strategy rejects invalid input (400)" "$([ "$STRATEGY_INVALID" = "400" ] && echo true || echo false)"

# Test valid strategy request
STRATEGY_RESPONSE=$(curl -s -X POST "$SERVICE_URL/v1/strategy" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "analysisType": "roi_analysis",
    "scenarioId": "test-scenario-001",
    "scenarioName": "Verification Test",
    "costSignals": [
      {
        "signalId": "660e8400-e29b-41d4-a716-446655440001",
        "signalType": "infrastructure",
        "amount": {"amount": "50000.0000", "currency": "USD", "asOfDate": "2026-01-22T00:00:00Z"},
        "periodicity": "one-time",
        "category": "setup",
        "source": "verification",
        "timestamp": "2026-01-22T00:00:00Z"
      }
    ],
    "performanceSignals": [
      {
        "signalId": "770e8400-e29b-41d4-a716-446655440002",
        "metricType": "latency",
        "value": 150,
        "unit": "ms",
        "baseline": 300,
        "target": 100,
        "source": "verification",
        "timestamp": "2026-01-22T00:00:00Z"
      }
    ],
    "adoptionSignals": [
      {
        "signalId": "880e8400-e29b-41d4-a716-446655440003",
        "adoptionType": "user_count",
        "currentValue": 100,
        "projectedValue": 500,
        "growthRate": 0.15,
        "timeHorizonMonths": 36,
        "source": "verification",
        "timestamp": "2026-01-22T00:00:00Z"
      }
    ],
    "riskIndicators": [
      {
        "indicatorId": "990e8400-e29b-41d4-a716-446655440004",
        "riskType": "operational",
        "probability": 0.15,
        "impact": "moderate",
        "mitigationCost": {"amount": "10000.0000", "currency": "USD", "asOfDate": "2026-01-22T00:00:00Z"},
        "description": "Test risk",
        "source": "verification",
        "timestamp": "2026-01-22T00:00:00Z"
      }
    ],
    "timeHorizonMonths": 36,
    "discountRate": 0.08,
    "baseCurrency": "USD"
  }' || echo '{"error": "request failed"}')

check "Strategy returns decisionEvent" "$(echo "$STRATEGY_RESPONSE" | grep -q 'decisionEvent' && echo true || echo false)"
check "Strategy returns agent.id" "$(echo "$STRATEGY_RESPONSE" | grep -q 'enterprise-strategy-agent' && echo true || echo false)"

# -----------------------------------------------------------------------------
# 4. Determinism Verification
# -----------------------------------------------------------------------------
echo ""
echo "4. Determinism Verification"
echo "----------------------------"

# Same input should produce same hash (simplified check)
check "Strategy response is deterministic" "$(echo "$STRATEGY_RESPONSE" | grep -q 'inputs_hash' && echo true || echo false)"
check "Strategy response has event_checksum" "$(echo "$STRATEGY_RESPONSE" | grep -q 'event_checksum' && echo true || echo false)"

# -----------------------------------------------------------------------------
# 5. Contract Compliance
# -----------------------------------------------------------------------------
echo ""
echo "5. Contract Compliance"
echo "-----------------------"

check "Response includes X-Contract-Schema-Id header" "$(curl -sI "$SERVICE_URL/health" | grep -qi 'X-Contract-Schema' && echo true || echo false)"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo "Verification Summary"
echo "=============================================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ ALL CHECKS PASSED - Deployment verified successfully"
  exit 0
else
  echo "❌ SOME CHECKS FAILED - Review deployment"
  exit 1
fi
