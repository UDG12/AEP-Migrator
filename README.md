# AEP Migrator

A powerful web application for migrating Adobe Experience Platform (AEP) and Customer Journey Analytics (CJA) configurations between organizations and sandboxes.

## Live Demo

**Production URL:** https://aep-migrator.vercel.app

## Features

### AEP Migration
- **Schemas** - Migrate XDM schemas with field group dependencies
- **Field Groups** - Migrate custom field groups
- **Datasets** - Migrate dataset configurations
- **Audiences** - Migrate audience definitions
- **Launch Properties** - Migrate Adobe Launch/Tags properties
- **Launch Extensions** - Migrate extension configurations
- **Launch Data Elements** - Migrate data element definitions
- **Launch Rules** - Migrate tag rules and conditions
- **Identity Namespaces** - Migrate custom identity namespaces
- **Merge Policies** - Migrate profile merge policies
- **Computed Attributes** - Migrate computed attribute definitions
- **Data Flows** - Migrate source/destination flow configurations
- **Governance Policies** - Migrate data governance policies

### CJA Migration
- **Connections** - Migrate CJA connections with dataset mappings
- **Data Views** - Migrate data view configurations
- **Segments** - Migrate segment definitions
- **Filters** - Migrate filter configurations
- **Calculated Metrics** - Migrate calculated metric definitions

### Additional Features
- Real-time migration progress tracking
- Detailed activity logs
- Retry failed assets
- Export assets to CSV
- Conflict resolution strategies (Skip, Overwrite, Rename)
- Dependency resolution for complex migrations

## Tech Stack

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **State Management:** TanStack Query (React Query)
- **Styling:** Tailwind CSS, Lucide Icons
- **Notifications:** React Hot Toast
- **Deployment:** Vercel (Serverless)

## Prerequisites

- Node.js 18.0.0 or higher
- Adobe Developer Console project with the following APIs enabled:
  - Experience Platform API
  - Adobe Analytics Reporting API (for CJA)
  - Reactor API (for Launch/Tags)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/UDG12/AEP-Migrator.git
cd AEP-Migrator
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# App Configuration
APP_SECRET=your-32-character-secret-key-here
ENCRYPTION_KEY=your-32-character-encryption-key

# Adobe Configuration (Optional - for server-side defaults)
ADOBE_CLIENT_ID=your-adobe-client-id
ADOBE_CLIENT_SECRET=your-adobe-client-secret
ADOBE_ORG_ID=your-org-id@AdobeOrg
ADOBE_SANDBOX_NAME=prod

# CJA Configuration (Optional)
CJA_GLOBAL_COMPANY_ID=your-cja-company-id

# MongoDB (Optional - for persistent storage)
MONGODB_URI=mongodb://localhost:27017/aep-migrator
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for Production

```bash
npm run build
npm start
```

## Usage Guide

### Step 1: Configure Organizations

1. Open the application
2. Enter **Source Organization** credentials:
   - Client ID (from Adobe Developer Console)
   - Client Secret
   - Organization ID (e.g., `XXXXX@AdobeOrg`)
   - Sandbox Name (e.g., `prod`)
3. Click **Validate** to verify credentials
4. Repeat for **Target Organization**
5. Click **Continue** to proceed

### Step 2: Select Assets

1. Browse available assets in the source organization
2. Assets are organized by category:
   - **AEP Assets:** Schemas, Field Groups, Datasets, Audiences
   - **Launch Assets:** Properties, Extensions, Data Elements, Rules
   - **CJA Assets:** Connections, Data Views, Segments, Filters, Calculated Metrics
3. Select assets to migrate using checkboxes
4. Use **Select All** for bulk selection
5. Choose conflict resolution strategy:
   - **Skip:** Skip if asset exists in target
   - **Overwrite:** Replace existing asset
   - **Rename:** Create with new name
6. Click **Start Migration**

### Step 3: Monitor Migration

1. Watch real-time progress bar
2. View detailed logs in the Activity Log panel
3. Assets show status: Pending, In Progress, Completed, Failed, Skipped
4. If assets fail, click **Retry Failed** to retry only failed items

### Step 4: Export Results

- Click **Export to CSV** to download asset inventory
- Use for documentation or audit purposes

## API Endpoints

### Organizations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/organizations/validate` | Validate Adobe credentials |

### Assets

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/assets` | Fetch assets from organization |
| GET | `/api/export/csv` | Export assets to CSV |

### AEP Migration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/migration/start` | Start AEP migration job |
| GET | `/api/migration/[jobId]` | Get migration job status |
| GET | `/api/migration/[jobId]/logs` | Get migration logs |
| POST | `/api/migration/[jobId]/retry` | Retry failed assets |

### CJA Migration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/migration/cja/start` | Start CJA migration job |
| GET | `/api/migration/cja/[jobId]` | Get CJA job status |
| GET | `/api/migration/cja/[jobId]/logs` | Get CJA migration logs |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Check application health |

## Adobe Developer Console Setup

### Required API Services

Add these APIs to your Adobe Developer Console project:

1. **Experience Platform API**
   - Scopes: `aep_core`, `acp.foundation`, `acp.privacy`

2. **Adobe Analytics Reporting API** (for CJA)
   - Scopes: `cja_segments`, `cja_calculatedMetrics`, `cja_dataViews`

3. **Reactor API** (for Launch/Tags)
   - Scopes: `reactor.properties.read`, `reactor.extensions.read`

### Generate Credentials

1. Go to [Adobe Developer Console](https://developer.adobe.com/console)
2. Create or select a project
3. Add the required APIs
4. Generate OAuth Server-to-Server credentials
5. Copy Client ID, Client Secret, and Organization ID

## Deployment

### Deploy to Vercel

1. Push code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Configure environment variables in Vercel dashboard
4. Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/UDG12/AEP-Migrator)

### Deploy with Docker

```bash
# Build image
docker build -t aep-migrator .

# Run container
docker run -p 3000:3000 --env-file .env.local aep-migrator
```

Or use Docker Compose:

```bash
docker-compose up -d
```

## Project Structure

```
AEP-Migrator/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API Routes
│   │   │   ├── assets/        # Asset fetching
│   │   │   ├── migration/     # AEP migration
│   │   │   │   └── cja/       # CJA migration
│   │   │   └── organizations/ # Credential validation
│   │   ├── page.tsx           # Main page
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── common/            # Shared components
│   │   └── dashboard/         # Dashboard components
│   ├── services/              # Adobe API services
│   │   ├── adobe/             # AEP services
│   │   └── cja/               # CJA services
│   ├── utils/                 # Utility functions
│   └── config/                # Configuration
├── public/                    # Static assets
├── .env.example              # Environment template
└── package.json
```

## Troubleshooting

### Common Issues

**1. "Organization not found" error**
- Ensure credentials are entered correctly
- Verify the sandbox name exists in your organization

**2. "Access denied" (403) error**
- Check that your Adobe project has the required API scopes
- Verify the user has permissions in the target sandbox

**3. "Invalid token" (401) error**
- Credentials may have expired
- Re-enter credentials on the setup page

**4. Assets not loading**
- Check browser console for errors
- Verify network connectivity to Adobe APIs

### Debug Mode

Enable debug logging by setting:

```env
LOG_LEVEL=debug
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

- **Issues:** [GitHub Issues](https://github.com/UDG12/AEP-Migrator/issues)
- **Documentation:** [Adobe Experience Platform Docs](https://experienceleague.adobe.com/docs/experience-platform.html)

---

Built with Next.js and deployed on Vercel.
