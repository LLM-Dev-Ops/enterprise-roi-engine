# Enterprise ROI Engine - Deployment Documentation

## 1. SERVICE TOPOLOGY

### Unified Service Name
```
enterprise-roi-engine
```

### Service URL
```
https://enterprise-roi-engine-1062287243982.us-central1.run.app
```

### Agent Endpoints Exposed

| Endpoint | Method | Agent | Description |
|----------|--------|-------|-------------|
| `/health` | GET | - | Health check and contract schema info |
| `/v1/roi` | POST | ROI Engine | Core ROI calculation and projection |
| `/v1/strategy` | POST | Enterprise Strategy Agent | Strategic ROI modeling, NPV, IRR analysis |

### Confirmation
- ✅ No agent is deployed as a standalone service
- ✅ Shared runtime, configuration, and telemetry stack
- ✅ Single container, single service

---

## 2. ENVIRONMENT CONFIGURATION

### Required Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `NODE_ENV` | Environment (production) | Direct |
| `PORT` | Service port (8080) | Direct |
| `PLATFORM_ENV` | Platform environment (dev/staging/prod) | Direct |
| `SERVICE_NAME` | Service identifier | Direct |
| `SERVICE_VERSION` | Deployment version/commit SHA | Direct |
| `RUVECTOR_SERVICE_URL` | ruvector-service endpoint | Secret Manager |
| `RUVECTOR_API_KEY` | ruvector-service authentication | Secret Manager |
| `TELEMETRY_ENDPOINT` | LLM-Observatory endpoint | Direct |

### Confirmation
- ✅ No agent hardcodes service names or URLs
- ✅ No agent embeds credentials or secrets
- ✅ All dependencies resolve via environment variables or Secret Manager

---

## 3. GOOGLE SQL / ROI MEMORY WIRING

### ruvector-service Integration
```
URL: https://ruvvector-service-1062287243982.us-central1.run.app
```

### Confirmation
- ✅ enterprise-roi-engine does NOT connect directly to Google SQL
- ✅ ALL DecisionEvents written via ruvector-service
- ✅ Schema compatible with agentics-contracts
- ✅ Append-only persistence behavior
- ✅ Idempotent writes with retry safety

### Persistence Flow
```
Enterprise Strategy Agent
    │
    ├── execute()
    │       │
    │       ▼
    │   DecisionEvent generated
    │       │
    │       ▼
    └── RuvectorClient.persistDecisionEvent()
                │
                ▼
        ruvector-service (HTTP POST)
                │
                ▼
        Google SQL (Postgres)
```

---

## 4. CLOUD BUILD & DEPLOYMENT

### Deployment Command (Direct)
```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"

gcloud run deploy enterprise-roi-engine \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300s \
  --set-env-vars "NODE_ENV=production,PLATFORM_ENV=dev,SERVICE_NAME=enterprise-roi-engine,TELEMETRY_ENDPOINT=https://llm-observatory-1062287243982.us-central1.run.app" \
  --set-env-vars "RUVECTOR_SERVICE_URL=https://ruvvector-service-1062287243982.us-central1.run.app"
```

### Cloud Build Deployment
```bash
gcloud builds submit --config=deploy/cloudbuild.yaml \
  --substitutions=_PLATFORM_ENV=dev
```

### IAM Requirements (Least Privilege)
- `roles/run.invoker` - For internal service invocation
- `roles/secretmanager.secretAccessor` - For accessing secrets
- `roles/logging.logWriter` - For Cloud Logging
- `roles/cloudtrace.agent` - For Cloud Trace

### Networking
- Ingress: All (public, for CLI access)
- Internal invocation supported via service mesh

---

## 5. CLI ACTIVATION VERIFICATION

### CLI Commands

| Command | Description | Agent Endpoint |
|---------|-------------|----------------|
| `agentics quantify create` | Create ROI projection | `/v1/roi` |
| `agentics quantify compare` | Compare projections | `/v1/roi` |
| `agentics quantify list` | List projections | `/v1/roi` |
| `agentics quantify inspect` | Inspect projection | `/v1/roi` |
| `agentics strategy analyze` | Perform strategy analysis | `/v1/strategy` |
| `agentics strategy model` | Generate ROI model | `/v1/strategy` |
| `agentics strategy inspect` | Inspect analysis | `/v1/strategy` |

### Example Invocations

```bash
# Strategy Analysis
agentics strategy analyze --input signals.json --output result.json

# ROI Model Generation
agentics strategy model \
  --scenario-id scn-001 \
  --name "Cloud Migration" \
  --time-horizon 36

# Inspect Previous Analysis
agentics strategy inspect --execution-id abc123
```

### Expected Success Output
```json
{
  "success": true,
  "data": {
    "execution_id": "...",
    "scenario_id": "...",
    "strategic_value": {
      "total_investment": {"amount": "...", "currency": "USD"},
      "roi": 0.25,
      "npv": {"amount": "...", "currency": "USD"}
    }
  }
}
```

---

## 6. PLATFORM & CORE INTEGRATION

### Input Sources (Read-Only)
- **Analytics-Hub**: Usage and performance inputs
- **CostOps**: Cost baselines and forecasts
- **Research-Lab**: Experimental signals

### Output Consumers
- **agentics-dev-platform**: Executive synthesis
- **Diligence artifacts**: ROI output references

### Non-Invocation Boundaries
enterprise-roi-engine MUST NOT directly invoke:
- ❌ Runtime execution paths
- ❌ Inference gateways
- ❌ Enforcement layers
- ❌ Optimization agents
- ❌ Analytics pipelines
- ❌ Incident workflows

---

## 7. POST-DEPLOY VERIFICATION CHECKLIST

```bash
# Run verification script
./deploy/verify-deployment.sh
```

### Manual Checklist
- [ ] enterprise-roi-engine service is live
- [ ] Health endpoint returns 200
- [ ] Strategy agent endpoint responds to valid input
- [ ] ROI evaluations are deterministic (same inputs_hash)
- [ ] Scenario outputs are consistent and reproducible
- [ ] DecisionEvents appear in ruvector-service
- [ ] Telemetry appears in LLM-Observatory
- [ ] CLI ROI commands function end-to-end
- [ ] No direct SQL access from enterprise-roi-engine
- [ ] No agent bypasses agentics-contracts
- [ ] No agent mutates upstream systems

---

## 8. FAILURE MODES & ROLLBACK

### Common Deployment Failures

| Failure | Detection | Resolution |
|---------|-----------|------------|
| Build failure | Cloud Build logs | Fix TypeScript errors, rebuild |
| Container crash | Cloud Run logs | Check memory limits, startup probe |
| ruvector-service unavailable | 500 errors on persistence | Verify ruvector-service health |
| Schema mismatch | Contract validation errors | Align with agentics-contracts |
| Secret access denied | IAM errors in logs | Grant secretAccessor role |

### Detection Signals
- Missing ROI artifacts in ruvector-service
- Schema validation failures in response
- Telemetry gaps in LLM-Observatory
- 5xx error rate increase

### Rollback Procedure
```bash
# List previous revisions
gcloud run revisions list --service enterprise-roi-engine --region us-central1

# Rollback to previous revision
gcloud run services update-traffic enterprise-roi-engine \
  --region us-central1 \
  --to-revisions PREVIOUS_REVISION=100
```

### Safe Redeploy Strategy
1. Deploy to staging first
2. Run verification script
3. Promote to production
4. Monitor for 15 minutes
5. Keep previous revision for instant rollback
