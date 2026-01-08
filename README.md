<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white" alt="Google Cloud"/>
  <img src="https://img.shields.io/badge/Cloud_Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white" alt="Cloud Run"/>
  <img src="https://img.shields.io/badge/JSON_Schema-000000?style=for-the-badge&logo=json&logoColor=white" alt="JSON Schema"/>
</p>

<h1 align="center">Enterprise ROI Engine</h1>

<p align="center">
  <strong>Financial artifact generation engine for enterprise ROI calculations</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square" alt="Version"/>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/contract-enforced-orange?style=flat-square" alt="Contract Enforced"/>
  <img src="https://img.shields.io/badge/coverage-97%25-brightgreen?style=flat-square" alt="Coverage"/>
</p>

---

## Overview

The **Enterprise ROI Engine** is a high-performance financial calculation service that transforms simulation outputs, ERP metadata, and cost baselines into auditable financial artifacts. Built with strict contract enforcement using JSON Schema validation, it ensures data integrity at every boundary.

### Key Features

| Feature | Description |
|---------|-------------|
| **Contract Enforcement** | Strict JSON Schema validation using Ajv at request entry |
| **Execution Proof** | Cryptographic proof of platform participation in every response |
| **5-Phase Pipeline** | Ingestion → Normalization → Attribution → Calculation → Export |
| **Audit Trail** | SHA-256 hashed audit records for every operation |
| **Cloud Native** | Designed for Cloud Run with auto-scaling |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Enterprise ROI Engine                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │  Simulation  │    │     ERP      │    │    Cost      │                   │
│  │    Output    │    │   Metadata   │    │   Baseline   │                   │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                   │
│         │                   │                   │                            │
│         └───────────────────┼───────────────────┘                            │
│                             ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    CONTRACT VALIDATION BOUNDARY                       │   │
│  │              (Ajv Strict Mode + JSON Schema Draft-07)                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                             │                                                │
│         ┌───────────────────┼───────────────────┐                            │
│         ▼                   ▼                   ▼                            │
│  ┌────────────┐      ┌────────────┐      ┌────────────┐                     │
│  │ Ingestion  │ ───▶ │Normalization│ ───▶ │Attribution │                     │
│  └────────────┘      └────────────┘      └────────────┘                     │
│                                                 │                            │
│                      ┌────────────┐      ┌──────┴─────┐                     │
│                      │   Export   │ ◀─── │Calculation │                     │
│                      └─────┬──────┘      └────────────┘                     │
│                            │                                                 │
│                            ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       FINANCIAL ARTIFACTS                             │   │
│  │   • ROI Summary  • NPV Analysis  • Sensitivity Tables  • Audit Trail │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/enterprise-roi-engine.git
cd enterprise-roi-engine

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start the server
npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `NODE_ENV` | `development` | Environment mode |

---

## API Reference

### Base URL

```
https://enterprise-roi-engine-275061967156.us-central1.run.app
```

### Endpoints

#### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "agentics-roi",
  "contractSchema": "https://agentics.ai/contracts/roi/v1/request.schema.json",
  "schemaVersion": "1.0.0"
}
```

#### Calculate ROI

```http
POST /v1/roi
Content-Type: application/json
```

**Request Body:**
```json
{
  "simulation": {
    "metadata": {
      "simulationId": "uuid",
      "engineVersion": "1.0.0",
      "timestamp": "2024-01-01T00:00:00Z",
      "checksum": "sha256-hash"
    },
    "scenario": {
      "name": "Cost Optimization",
      "baselineId": "uuid",
      "timeHorizonMonths": 12,
      "confidenceLevel": 0.9
    },
    "decisions": [],
    "resourceDeltas": [],
    "workflowTraces": [],
    "confidenceIntervals": []
  },
  "erpMetadata": {
    "erpSystem": "SAP",
    "erpVersion": "1.0",
    "extractTimestamp": "2024-01-01T00:00:00Z",
    "entities": [],
    "chartOfAccounts": [],
    "costCenters": [],
    "fiscalCalendar": [],
    "reportingCurrency": "USD"
  },
  "costBaseline": {
    "baselineId": "uuid",
    "snapshotTimestamp": "2024-01-01T00:00:00Z",
    "costModelVersion": "1.0",
    "laborRates": [],
    "infrastructureCosts": [],
    "licenseCosts": [],
    "overheadFactors": [],
    "riskWeights": [],
    "discountRate": 0.1,
    "baselinePeriod": "FY2024"
  }
}
```

**Success Response:**
```json
{
  "correlationId": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "apiVersion": "v1",
  "status": "SUCCESS",
  "result": { ... },
  "executionProof": {
    "proofId": "proof-xxx",
    "platformId": "enterprise-roi-engine",
    "platformVersion": "1.0.0",
    "contractSchemaId": "https://agentics.ai/contracts/roi/v1/request.schema.json",
    "inputHash": "sha256-hash",
    "outputHash": "sha256-hash",
    "signature": "sha256-signature"
  }
}
```

**Validation Error Response:**
```json
{
  "correlationId": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "apiVersion": "v1",
  "status": "FAILED",
  "error": {
    "code": "CONTRACT_VALIDATION_FAILED",
    "message": "Request failed contract validation",
    "details": {
      "schemaId": "https://agentics.ai/contracts/roi/v1/request.schema.json",
      "errors": [
        {
          "path": "/simulation",
          "message": "must have required property 'metadata'",
          "keyword": "required"
        }
      ]
    }
  },
  "executionProof": { ... }
}
```

---

## Contract Enforcement

All incoming requests are validated against the JSON Schema contract at the **single entry boundary**. No bypass paths exist.

### Schema Location

```
src/contracts/schemas/roi-v1-request.schema.json
```

### Validation Features

| Feature | Implementation |
|---------|---------------|
| **Strict Mode** | `additionalProperties: false` on all objects |
| **Format Validation** | UUID, date-time, patterns enforced |
| **Type Safety** | All fields strictly typed |
| **Required Fields** | Mandatory fields enforced at schema level |

### Execution Proof

Every response includes cryptographic execution proof:

```typescript
interface ExecutionProof {
  proofId: string;           // Unique proof identifier
  platformId: string;        // "enterprise-roi-engine"
  platformVersion: string;   // Engine version
  contractSchemaId: string;  // Schema URL
  inputHash: string;         // SHA-256 of input
  outputHash: string;        // SHA-256 of output
  validationDurationMs: number;
  executionDurationMs: number;
  signature: string;         // Cryptographic signature
}
```

---

## Project Structure

```
enterprise-roi-engine/
├── src/
│   ├── api/                 # HTTP API layer
│   │   ├── handlers.ts      # Request handlers
│   │   ├── middleware.ts    # Middleware functions
│   │   ├── routes.ts        # Route definitions
│   │   └── types.ts         # API type definitions
│   ├── attribution/         # Cost/benefit attribution
│   ├── calculation/         # Financial calculations
│   │   ├── NPVEngine.ts     # Net Present Value
│   │   ├── ROICalculator.ts # ROI calculations
│   │   └── SensitivityEngine.ts
│   ├── contracts/           # Type definitions & schemas
│   │   ├── schemas/         # JSON Schema files
│   │   │   └── roi-v1-request.schema.json
│   │   ├── validation.ts    # Contract validator
│   │   └── *.ts             # Type contracts
│   ├── export/              # Artifact generation
│   ├── ingestion/           # Data intake
│   ├── normalization/       # Data standardization
│   ├── index.ts             # Engine orchestration
│   └── server.ts            # HTTP server entry
├── tests/
│   └── unit/                # Unit tests
├── Dockerfile               # Container definition
├── package.json
└── tsconfig.json
```

---

## Development

### Scripts

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Start development server
npm run dev

# Lint code
npm run lint
```

### Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/contracts/validation.test.ts

# Run with coverage
npm run test:coverage
```

---

## Deployment

### Cloud Run

The service is deployed on Google Cloud Run:

```bash
# Set project
gcloud config set project agentics-cloud

# Deploy
gcloud run deploy enterprise-roi-engine \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi
```

### Docker

```bash
# Build image
docker build -t enterprise-roi-engine .

# Run container
docker run -p 8080:8080 enterprise-roi-engine
```

---

## Financial Calculations

### Metrics Generated

| Metric | Description |
|--------|-------------|
| **ROI** | Return on Investment percentage |
| **NPV** | Net Present Value with discount rate |
| **Payback Period** | Time to recover investment |
| **IRR** | Internal Rate of Return |
| **Confidence Intervals** | P10, P50, P90 bounds |

### Sensitivity Analysis

The engine performs sensitivity analysis on key variables:
- Discount rate variations
- Cost estimate ranges
- Timeline variations
- Risk factor adjustments

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with TypeScript and deployed on Google Cloud Run</sub>
</p>
