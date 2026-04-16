// ============================================================================
// CSV Export Utilities
// ============================================================================

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV<T extends Record<string, any>>(
  data: T[],
  headers?: string[]
): string {
  if (!data || data.length === 0) {
    return '';
  }

  // Get headers from first object if not provided
  const csvHeaders = headers || Object.keys(data[0]);

  // Escape CSV value
  const escapeValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string
    let stringValue = String(value);

    // If value contains comma, newline, or quotes, wrap in quotes and escape quotes
    if (
      stringValue.includes(',') ||
      stringValue.includes('\n') ||
      stringValue.includes('"')
    ) {
      stringValue = `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  // Create header row
  const headerRow = csvHeaders.map(escapeValue).join(',');

  // Create data rows
  const dataRows = data.map((row) => {
    return csvHeaders
      .map((header) => {
        const value = row[header];
        return escapeValue(value);
      })
      .join(',');
  });

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Download CSV file in browser
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Format date for CSV
 */
export function formatDateForCSV(date: string | Date | undefined): string {
  if (!date) return '';

  try {
    const d = new Date(date);
    return d.toISOString();
  } catch {
    return String(date);
  }
}

/**
 * Flatten nested object for CSV (convert objects/arrays to JSON strings)
 */
export function flattenForCSV<T extends Record<string, any>>(obj: T): Record<string, any> {
  const flattened: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      flattened[key] = '';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // For objects, convert to JSON string
      flattened[key] = JSON.stringify(value);
    } else if (Array.isArray(value)) {
      // For arrays, join with semicolons or convert to JSON
      if (value.length > 0 && typeof value[0] === 'object') {
        flattened[key] = JSON.stringify(value);
      } else {
        flattened[key] = value.join('; ');
      }
    } else {
      flattened[key] = value;
    }
  }

  return flattened;
}
