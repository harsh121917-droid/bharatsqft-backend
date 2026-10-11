/**
 * Centralized, Robust Investor Name Matching Service for Bank & Exchange Onboarding
 * Compliant with SEBI Master Circular & NSE MFSS Regulations:
 * - Investments must strictly originate from the investor's own verified bank account
 * - Prevents single common-first-name false positives (e.g. "Harsh Sharma" vs "Harsh Verma")
 * - Handles name transposition (e.g. "Vikas Saini" vs "Saini Vikas")
 * - Supports single-name investors (e.g. "Vikas" on PAN vs "Vikas Saini" on Bank)
 */

function isStrongBankNameMatch(investorName, bankName) {
  if (!investorName || !bankName) {
    return { match: false, reason: 'MISSING_NAME' };
  }

  const cleanA = investorName.toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanB = bankName.toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleanA || !cleanB) {
    return { match: false, reason: 'EMPTY_NAME' };
  }

  // Exact match
  if (cleanA === cleanB) {
    return { match: true, reason: 'EXACT_MATCH' };
  }

  const stopWords = new Set(['MR', 'MRS', 'MS', 'DR', 'SH', 'SHRI', 'SMT', 'KUMAR', 'KUMARI']);
  const tokensA = cleanA.split(/\s+/).filter(t => t.length > 1 && !stopWords.has(t));
  const tokensB = cleanB.split(/\s+/).filter(t => t.length > 1 && !stopWords.has(t));

  // If all tokens were filtered as stop words, fall back to raw tokens
  const rawTokensA = cleanA.split(/\s+/).filter(t => t.length > 1);
  const rawTokensB = cleanB.split(/\s+/).filter(t => t.length > 1);

  const effectiveA = tokensA.length > 0 ? tokensA : rawTokensA;
  const effectiveB = tokensB.length > 0 ? tokensB : rawTokensB;

  const commonTokens = effectiveA.filter(t => effectiveB.includes(t));

  // Case 1: Both names have 2 or more significant tokens
  // e.g. "HARSH SHARMA" vs "HARSH VERMA" -> common: ["HARSH"] (only 1) -> CONFLICT!
  // e.g. "VIKAS SAINI" vs "SAINI VIKAS" -> common: ["VIKAS", "SAINI"] (2) -> MATCH!
  if (effectiveA.length >= 2 && effectiveB.length >= 2) {
    if (commonTokens.length >= 2) {
      return { match: true, reason: 'MULTI_TOKEN_MATCH' };
    }
    // Only 1 token matched while other significant tokens conflict
    return { match: false, reason: 'TOKEN_CONFLICT_SURNAME_MISMATCH' };
  }

  // Case 2: Both names are single-token
  // e.g. "VIKAS" vs "VIKAS"
  if (effectiveA.length === 1 && effectiveB.length === 1) {
    const isMatch = effectiveA[0] === effectiveB[0];
    return {
      match: isMatch,
      reason: isMatch ? 'SINGLE_TOKEN_EXACT' : 'SINGLE_TOKEN_MISMATCH',
    };
  }

  // Case 3: Investor has single name on PAN, bank has multiple tokens
  // e.g. "VIKAS" on PAN vs "VIKAS SAINI" on Bank
  if (effectiveA.length === 1 && effectiveB.length >= 2) {
    if (effectiveB.includes(effectiveA[0])) {
      return { match: true, reason: 'SINGLE_NAME_INVESTOR_MATCH' };
    }
    return { match: false, reason: 'SINGLE_NAME_INVESTOR_MISMATCH' };
  }

  // Case 4: Bank returned single name, investor has full name
  // e.g. "VIKAS SAINI" on PAN vs "VIKAS" on Bank
  if (effectiveB.length === 1 && effectiveA.length >= 2) {
    if (effectiveA.includes(effectiveB[0])) {
      return { match: true, reason: 'BANK_SINGLE_NAME_MATCH' };
    }
    return { match: false, reason: 'BANK_SINGLE_NAME_MISMATCH' };
  }

  return { match: false, reason: 'INSUFFICIENT_NAME_MATCH' };
}

module.exports = {
  isStrongBankNameMatch,
};
