/**
 * PmoDecline (processing result) code table for Kapital Bank's TXPG gateway.
 *
 * Source: Kapital TXPG docs, "PmoDecline Codes (Processing Error codes)" table.
 *   - https://brawny-airport-7ca.notion.site/Kapital-bank-E-commerce-API-Documentation-6dd6a228c40644e3bef034bca7845e3c
 *   - https://pg.kapitalbank.az/docs
 *
 * Codes not present in the published table (5, 28, 31-39, 42-48, 70, 76-79,
 * 86-89, 97) are intentionally omitted rather than guessed.
 */

export const PMO_RESULT_CODES: Readonly<Record<string, string>> = Object.freeze({
  '0': 'None',
  '1': 'Approved',
  '2': 'Approved Partial',
  '3': 'Approved Purchase Only',
  '4': 'Postponed',
  '6': 'Strong customer authentication required',
  '7': "Need Checker's confirmation",
  '8': 'Telebank customer already exists',
  '9': 'Should select virtual card product',
  '10': 'Should select account number',
  '11': 'Should change PVV',
  '12': 'Confirm payment precheck',
  '13': 'Select bill',
  '14': 'Customer confirmation requested',
  '15': 'Original transaction not found',
  '16': 'Slip already received',
  '17': 'Personal information input error',
  '18': 'SMS/EMail dynamic password requested',
  '19': 'DPA/CAP dynamic password requested',
  '20': 'Prepaid code not found',
  '21': 'Corresponding account exhausted',
  '22': 'Acquirer limit exceeded',
  '23': 'Cutover in process',
  '24': 'Dynamic PVV Expired',
  '25': 'Weak PIN',
  '26': 'External authentication required',
  '27': 'Additional data required',
  '29': 'Closed account',
  '30': 'Blocked',
  '40': 'Lost card',
  '41': 'Stolen card',
  '49': 'Ineligible vendor account',
  '50': 'Unauthorized usage',
  '51': 'Expired card',
  '52': 'Invalid card',
  '53': 'Invalid PIN',
  '54': 'System error',
  '55': 'Ineligible transaction',
  '56': 'Ineligible account',
  '57': 'Transaction not supported',
  '58': 'Restricted card',
  '59': 'Insufficient funds',
  '60': 'Uses limit exceeded',
  '61': 'Withdrawal limit would be exceeded',
  '62': 'PIN tries limit was reached',
  '63': 'Withdrawal limit already reached',
  '64': 'Credit amount limit',
  '65': 'No statement information',
  '66': 'Statement not available',
  '67': 'Invalid amount',
  '68': 'External decline',
  '69': 'No sharing',
  '71': 'Contact card issuer',
  '72': 'Destination not available',
  '73': 'Routing error',
  '74': 'Format error',
  '75': 'External decline special condition',
  '80': 'Bad CVV',
  '81': 'Bad CVV2',
  '82': 'Invalid transaction',
  '83': 'PIN tries limit was exceeded',
  '84': 'Bad CAVV',
  '85': 'Bad ARQC',
  '90': 'Approve administrative card operation inside window',
  '91': 'Approve administrative card operation outside of window',
  '92': 'Approve administrative card operation',
  '93': 'Should select card',
  '94': 'Confirm Issuer Fee',
  '95': 'Insufficient cash',
  '96': 'Approved frictionless',
  '98': 'Invalid merchant',
});

/** Human-readable title for a PmoDecline code, or null if the code is not in the published table. */
export function describePmoResultCode(code: string): string | null {
  return PMO_RESULT_CODES[code] ?? null;
}

/**
 * Approval codes: '0' None, '1' Approved, '2' Approved Partial, '3' Approved Purchase Only.
 * The docs list 2 and 3 as approvals, so a transaction ending on either of them must not be
 * reported as a failure.
 */
export function isPmoApproval(code: string): boolean {
  return code === '0' || code === '1' || code === '2' || code === '3';
}
