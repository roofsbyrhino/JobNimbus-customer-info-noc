# Rhino Roofs — Automated NOC Generator

Automatically generates a pre-filled **Florida Notice of Commencement (NOC)**
(Florida Statute § 713.13) whenever a new lead is created in JobNimbus, then
uploads the completed PDF back to the job file.

---

## How It Works

```
JobNimbus new lead
       │
       ▼
POST /api/webhook
       │
       ├─► Fetch full job record from JobNimbus
       ├─► Pull property data from BatchData API
       │     (legal description, tax folio, owner name,
       │      mailing address, lender info, roof age)
       ├─► Generate pre-filled Florida NOC PDF
       ├─► Upload PDF to JobNimbus job file
       └─► Add confirmation note to job
```

---

## Project Structure

```
├── api/
│   ├── webhook.js        ← JobNimbus webhook receiver (main flow)
│   ├── generate-noc.js   ← Manual trigger endpoint (for testing)
│   └── health.js         ← Liveness check
├── lib/
│   ├── jobnimbus.js      ← JobNimbus API client
│   ├── batchdata.js      ← BatchData API client (+ mock mode)
│   ├── noc-generator.js  ← Florida NOC PDF generator
│   └── contractor.js     ← Rhino Roofs contractor details ← FILL THIS IN
├── .env.example
├── vercel.json
└── package.json
```

---

## Setup

### 1. Fill in your contractor details

Open `lib/contractor.js` and replace every `PLACEHOLDER` with your real info:

- Florida contractor license number
- Company address
- Phone number
- Insurance carrier, policy number, expiration date

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `JOBNIMBUS_API_KEY` | Your JobNimbus API key |
| `BATCHDATA_API_KEY` | BatchData API key (get one at batchdata.com) |
| `WEBHOOK_SECRET` | Any random string — set the same in JobNimbus webhook config |
| `BATCHDATA_MOCK` | Set to `true` to use sample data without a live BatchData key |

### 3. Install dependencies

```bash
npm install
```

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Vercel will give you a deployment URL like:
`https://your-project.vercel.app`

### 5. Configure the JobNimbus Webhook

1. In JobNimbus: **Settings → Webhooks → Add Webhook**
2. Set URL to: `https://your-project.vercel.app/api/webhook`
3. Select trigger: **Record Created** (for Contacts or Jobs)
4. Optionally add header: `x-webhook-secret: YOUR_RANDOM_WEBHOOK_SECRET`

---

## Testing Without a Live Webhook

Use the manual trigger endpoint:

```bash
curl -X POST https://your-project.vercel.app/api/generate-noc \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_RANDOM_WEBHOOK_SECRET" \
  -d '{"jobId": "YOUR_JOB_ID", "address": "1234 Main St, Port Saint Lucie, FL 34952"}'
```

Or test locally:

```bash
npm run dev
# Then in another terminal:
curl -X POST http://localhost:3000/api/generate-noc \
  -H "Content-Type: application/json" \
  -d '{"jobId": "test-001", "address": "1234 Main St, Port Saint Lucie, FL 34952"}'
```

Check health / env config:

```bash
curl https://your-project.vercel.app/api/health
```

---

## Going Live with BatchData

1. Sign up at [batchdata.com](https://batchdata.com)
2. Get your API key
3. Set `BATCHDATA_API_KEY=your_key` in `.env` (and in Vercel environment variables)
4. Set `BATCHDATA_MOCK=false`

BatchData fields used:
- Legal property description
- Tax folio / APN number
- Owner's full legal name
- Owner mailing address
- Mortgage / lender name and amount
- Home estimated value
- Year built / roof age

---

## NOC Form Fields

The generated PDF includes all fields required by **Florida Statute § 713.13**:

| Field | Source |
|---|---|
| Property address | JobNimbus lead |
| Legal description | BatchData |
| Tax folio / APN | BatchData |
| Owner full legal name | BatchData |
| Owner mailing address | BatchData |
| Lender / mortgagee | BatchData |
| Contractor name | `lib/contractor.js` |
| Contractor address | `lib/contractor.js` |
| FL license number | `lib/contractor.js` |
| General description of improvement | Hardcoded (roofing replacement) |
| NOC expiration date | Auto-calculated (1 year from today) |
| Signature / notary block | Left blank for owner to complete |

---

## Important Legal Note

The NOC must be **recorded with the St. Lucie County Clerk of Courts** before
the first building inspection. The homeowner must sign in the presence of a
notary public before recording. This tool generates the pre-filled form — the
recording step is the owner's responsibility.
