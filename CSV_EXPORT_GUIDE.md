# CSV Export Guide - AEP Migrator

This document describes the CSV export functionality for creating comprehensive inventories of your Adobe Experience Platform (AEP), Customer Journey Analytics (CJA), and Adobe Launch configurations.

## Overview

The CSV export feature allows you to download detailed inventories of all your Adobe assets in CSV format. This is useful for:
- Documentation and auditing
- Reporting to stakeholders
- Planning migration strategies
- Creating backups of configuration metadata

### Enhanced Export Features

**All CSV exports now include:**

1. **Detailed Field Breakdown** - Individual columns for key properties
2. **Full JSON Response** - Complete API response in `fullResponse` column for:
   - Advanced analysis and processing
   - Backup of complete configuration
   - Restoration or migration reference
   - Accessing nested properties not in individual columns

**Pro Tip:** The `fullResponse` column contains the complete JSON object from Adobe's API, allowing you to access any property not explicitly exported as a separate column.

## How to Use

1. **Select an Organization**: Choose your source organization in the Asset Selector
2. **Load Assets**: Click "Load Assets" to fetch all assets from Adobe
3. **Export Individual Categories**: Click the download icon (⬇) next to any category to export that category's data to CSV

## Available Exports

### Adobe Experience Platform (AEP)

#### 1. Schemas
**Export includes:**
- Schema ID
- Title, Type, Version
- Description
- Created and Updated dates
- Schema Class
- **Field Groups:**
  - Count of field groups
  - List of field group references (semicolon-separated)
- **Fields:**
  - Count of fields
  - List of field names (semicolon-separated)
  - Detailed field information (JSON) including type, title, description, metadata
- Meta information (extends, intendedToExtend)
- **Full Response:** Complete schema JSON object

**File naming:** `schemas_{orgId}_{timestamp}.csv`

#### 2. Datasets
**Export includes:**
- Dataset ID
- Name and Description
- **Schema Information:**
  - Schema reference ID
  - Schema class/content type
- **Configuration:**
  - State and Status
  - Profile enabled flag
  - Identity enabled flag
  - File description (JSON)
  - Version
- **Observability:**
  - Observable schema (JSON)
- Timestamps (created, updated)
- Tags (semicolon-separated)
- IMS Organization ID
- **Full Response:** Complete dataset JSON object

**File naming:** `datasets_{orgId}_{timestamp}.csv`

#### 3. Audiences (Segments)
**Export includes:**
- Audience ID
- Name and Description
- Type and Status (lifecycle state)
- **Evaluation:**
  - Method (Streaming/Batch)
- **Schema and Expression:**
  - Schema name
  - Expression type and format
  - PQL (Profile Query Language) expression
- Timestamps (creation, update, update epoch)
- Merge policy ID
- Labels (JSON)
- **Full Response:** Complete audience JSON object including full expression details

**File naming:** `audiences_{orgId}_{timestamp}.csv`

### Customer Journey Analytics (CJA)

#### 1. CJA Connections
**Export includes:**
- Connection ID
- Name
- Description
- Owner name and ID
- Created date
- Modified date
- Number of datasets
- List of dataset IDs (semicolon-separated)

**File naming:** `cja_connections_{orgId}_{timestamp}.csv`

#### 2. CJA Data Views
**Export includes:**
- Data View ID
- Name and Description
- Connection ID
- Owner name and ID
- Created and Modified dates
- **Configuration:**
  - Timezone
  - Session timeout (value and unit)
  - Complete session definition (JSON)
  - Container names (JSON)
- **Components:**
  - Dimensions count
  - Metrics count
  - List of dimension names (semicolon-separated)
  - List of metric names (semicolon-separated)
  - **Detailed dimensions** (JSON array with all dimension properties)
  - **Detailed metrics** (JSON array with all metric properties)
- **Full Response:** Complete data view JSON object

**File naming:** `cja_dataviews_{orgId}_{timestamp}.csv`

#### 3. CJA Segments
**Export includes:**
- Segment ID
- Name
- Description
- Data View ID
- Owner name and ID
- Created date
- Modified date
- Tags (semicolon-separated)
- Compatibility status

**File naming:** `cja_segments_{orgId}_{timestamp}.csv`

#### 4. CJA Calculated Metrics
**Export includes:**
- Calculated Metric ID
- Name
- Description
- Data View ID
- Owner name and ID
- Created date
- Modified date
- Tags (semicolon-separated)
- Type

**File naming:** `cja_calculated_metrics_{orgId}_{timestamp}.csv`

#### 5. CJA Projects
**Export includes:**
- Project ID
- Name
- Description
- Data View ID
- Owner name and ID
- Created date
- Modified date
- Tags (semicolon-separated)
- Type

**File naming:** `cja_projects_{orgId}_{timestamp}.csv`

### Adobe Launch

#### 1. Launch Properties
**Export includes:**
- Property ID
- Name
- Platform (web/mobile)
- Development flag
- Enabled status
- Created date
- Updated date

**File naming:** `launch_properties_{orgId}_{timestamp}.csv`

#### 2. Launch Extensions
**Export includes:**
- Extension ID
- Property ID
- Property name
- Extension name
- Display name
- Delegate descriptor ID
- Version
- Settings (JSON)
- Created date
- Updated date

**File naming:** `launch_extensions_{orgId}_{timestamp}.csv`

#### 3. Launch Data Elements
**Export includes:**
- Data Element ID
- Property ID
- Property name
- Name
- Delegate descriptor ID
- Settings (JSON)
- Clean text flag
- Force lowercase flag
- Storage type
- Created date
- Updated date

**File naming:** `launch_dataelements_{orgId}_{timestamp}.csv`

#### 4. Launch Rules
**Export includes:**
- Rule ID
- Property ID
- Property name
- Name
- Enabled status
- Review status
- Created date
- Updated date

**File naming:** `launch_rules_{orgId}_{timestamp}.csv`

## Data Formats

### Nested Objects
When exporting data that contains nested objects (like settings, definitions, etc.), the data is converted to JSON strings in the CSV for preservation.

### Arrays
Arrays are handled in two ways:
- **Simple arrays** (strings, numbers): Joined with semicolons (e.g., "tag1; tag2; tag3")
- **Complex arrays** (objects): Converted to JSON strings

### Date Fields
All date fields are exported in ISO 8601 format (e.g., "2024-03-20T10:30:00.000Z")

### Empty Values
Empty or null values are exported as empty strings in the CSV

## Technical Details

### API Endpoint
The export functionality is powered by the API endpoint:
```
GET /api/export/csv?orgId={orgId}&type={exportType}
```

### Export Types
- `schemas` - AEP Schemas
- `datasets` - AEP Datasets
- `audiences` - AEP Audiences
- `cja-connections` - CJA Connections
- `cja-dataviews` - CJA Data Views
- `cja-segments` - CJA Segments
- `cja-calculatedmetrics` - CJA Calculated Metrics
- `cja-projects` - CJA Projects
- `launch-properties` - Adobe Launch Properties
- `launch-extensions` - Adobe Launch Extensions
- `launch-dataelements` - Adobe Launch Data Elements
- `launch-rules` - Adobe Launch Rules

### Timeout
Export requests have a 5-minute timeout to accommodate large datasets.

### Rate Limiting
Exports use the same Adobe API rate limits as other operations. If you encounter rate limiting, wait a few minutes before retrying.

## Best Practices

1. **Export Regularly**: Create periodic exports for audit trails and documentation
2. **Version Control**: Keep exports in version control to track configuration changes over time
3. **Review Before Migration**: Use exports to review what will be migrated before starting a migration job
4. **Combine with Migration Logs**: Use exports alongside migration logs for complete documentation

## Troubleshooting

### Export Fails with "Unauthorized"
- Verify your Adobe API credentials are valid
- Check that the API credentials have the necessary permissions for the asset type

### Export is Empty
- Confirm assets exist in the source organization
- Verify the correct organization is selected
- Check that assets have finished loading before exporting

### Export Takes Too Long
- Large organizations with many assets may take several minutes
- The export will timeout after 5 minutes
- Consider contacting support if exports consistently timeout

## Support

For issues with CSV exports:
1. Check the browser console for error messages
2. Review the application logs for detailed error information
3. Report issues at https://github.com/anthropics/claude-code/issues

## Example Use Cases

### Documentation for Compliance
Export all schemas, datasets, and audiences to document your data governance setup for compliance audits.

### Pre-Migration Review
Before migrating from one sandbox to another, export all assets to review what will be moved.

### Change Tracking
Export configurations monthly to track how your Adobe implementation evolves over time.

### Knowledge Transfer
Provide CSV exports to new team members as part of onboarding documentation.
