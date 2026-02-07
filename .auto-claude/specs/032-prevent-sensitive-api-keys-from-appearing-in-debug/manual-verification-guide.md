# Manual Verification Guide: API Key Sanitization in Debug Mode

## Overview
This guide provides step-by-step instructions for manually verifying that sensitive API keys and tokens are properly sanitized in debug mode and do not appear in browser console logs.

## Prerequisites
- Foundry VTT installed and running
- VoxChronicle module installed
- Valid OpenAI API key
- Valid Kanka API token
- Access to browser Developer Tools (F12)

---

## Test Setup

### Step 1: Enable Debug Mode
Open browser console (F12) and enable debug logging:

```javascript
// In browser console:
Logger.setLevel(0); // Enable DEBUG level logging
```

### Step 2: Configure API Keys
1. Open Foundry VTT module settings
2. Configure VoxChronicle with **real** API credentials:
   - OpenAI API Key (sk-...)
   - Kanka API Token

**⚠️ IMPORTANT**: Use real credentials for this test. The purpose is to verify they don't appear in logs.

---

## Verification Tests

### Test 1: OpenAI Client Initialization
**Action**: Initialize OpenAIClient or trigger an OpenAI operation

**Expected Console Output**:
- ✅ Should see: "VoxChronicle | OpenAIClient | Making POST request to https://api.openai.com/v1/***"
- ✅ URLs should show `***` for any sensitive query parameters
- ❌ Should NOT see: Your actual API key (sk-...)
- ❌ Should NOT see: "Bearer sk-..." in plaintext

**Search Console For**:
```javascript
// In console filter, search for:
sk-
sk-proj-
Bearer sk
```
**Expected**: No results (or only results showing "***")

---

### Test 2: OpenAI API Request Error
**Action**: Trigger an OpenAI API error (e.g., invalid request, rate limit)

**Expected Console Output**:
- ✅ Error messages should show: "Bearer ***" instead of actual token
- ✅ Error details should have authorization headers redacted
- ✅ URLs in error messages should be sanitized
- ❌ Should NOT see: Authorization headers with actual values

**Example Expected Error**:
```
VoxChronicle | OpenAIClient | Error - Request failed: 401 Unauthorized
Details: {
  headers: {
    authorization: "Bearer ***"
  },
  message: "Invalid API key provided: ***"
}
```

---

### Test 3: Kanka Client Initialization
**Action**: Initialize KankaClient or trigger a Kanka operation

**Expected Console Output**:
- ✅ Should see: "VoxChronicle | KankaClient | Making GET request to https://api.kanka.io/1.0/***"
- ✅ Authorization headers should show "Bearer ***"
- ❌ Should NOT see: Your actual Kanka token
- ❌ Should NOT see: Full authorization header value

**Search Console For**:
```javascript
// In console filter, search for your actual token pattern
// (Kanka tokens are typically 64+ character alphanumeric strings)
[Your actual token]
```
**Expected**: No results (or only results showing "***")

---

### Test 4: Kanka API Request Error
**Action**: Trigger a Kanka API error (e.g., 404 not found, 429 rate limit)

**Expected Console Output**:
- ✅ Error messages should sanitize any reflected tokens
- ✅ Rate limit headers should be visible (x-ratelimit-remaining, etc.)
- ✅ But authorization should show "Bearer ***"
- ❌ Should NOT see: API token in error details

**Example Expected Error**:
```
VoxChronicle | KankaClient | Error - Request failed: 404 Not Found
Request to /campaigns/*** failed
Details: {
  headers: {
    authorization: "Bearer ***",
    x-ratelimit-remaining: "28"
  }
}
```

---

### Test 5: Network Errors with Request Details
**Action**: Trigger a network error (e.g., disconnect network, use invalid endpoint)

**Expected Console Output**:
- ✅ Network error messages should be sanitized
- ✅ Original request URLs should be sanitized
- ✅ Any error stack traces should have tokens redacted
- ❌ Should NOT see: API keys/tokens in stack traces

---

### Test 6: Success Logs
**Action**: Perform successful API operations (transcription, Kanka entity creation)

**Expected Console Output**:
- ✅ Success logs should show sanitized endpoints
- ✅ Response objects (if logged) should not contain tokens
- ❌ Should NOT see: API keys in success messages

**Example Expected Success Log**:
```
VoxChronicle | OpenAIClient | Request to /audio/transcriptions completed successfully
VoxChronicle | KankaClient | Request to /campaigns/***/entities completed successfully
```

---

## Comprehensive Console Search Checklist

After performing all tests above, search the browser console for these patterns:

### 1. Search for OpenAI Keys
```javascript
// Console filter:
sk-
```
**Expected**: All results should show `***` instead of actual key

### 2. Search for Bearer Tokens
```javascript
// Console filter:
Bearer sk
Bearer [a-zA-Z0-9]
```
**Expected**: All should show "Bearer ***"

### 3. Search for Authorization Headers
```javascript
// Console filter:
authorization
Authorization
```
**Expected**: Values should be `***` or "Bearer ***"

### 4. Search for API Key Patterns
```javascript
// Console filter (paste your actual key):
[paste first 10 chars of your API key]
```
**Expected**: NO MATCHES (except in settings UI, not console logs)

### 5. Search for Kanka Tokens
```javascript
// Console filter (paste your actual token):
[paste first 10 chars of your Kanka token]
```
**Expected**: NO MATCHES (except in settings UI, not console logs)

---

## Automated Verification

After manual testing, run these automated checks:

### 1. Check for Hardcoded Secrets in Source
```bash
cd /path/to/VoxChronicle
grep -r 'sk-[a-zA-Z0-9]\{32,\}\|Bearer [a-zA-Z0-9]' scripts/ || echo "✅ No secrets found"
```
**Expected**: "✅ No secrets found"

### 2. Run Unit Tests
```bash
npm test -- SensitiveDataFilter
```
**Expected**: All tests pass

### 3. Run Full Test Suite
```bash
npm test
```
**Expected**: All tests pass with no regressions

---

## Success Criteria

This verification is successful if **ALL** of the following are true:

- [ ] No plaintext API keys/tokens found in console output
- [ ] All authorization headers show "Bearer ***" in logs
- [ ] Error objects have sensitive fields redacted to "***"
- [ ] URLs don't expose sensitive query parameters
- [ ] Console searches for actual key/token values return no results
- [ ] All unit tests pass
- [ ] No regressions in existing functionality
- [ ] Module operates normally with sanitization enabled

---

## Failure Scenarios

If you find ANY of the following, the verification has **FAILED**:

❌ Actual API key appears in console (even once)
❌ Bearer token with actual value appears in logs
❌ Authorization header with full value in error details
❌ API key visible in URL query parameters
❌ Token reflected in error messages without redaction
❌ Sensitive data in stack traces

**If verification fails**: Document the exact console output where sensitive data appears and report for immediate fix.

---

## Documentation of Results

After completing verification, document:

1. **Test Date**: [Date]
2. **Foundry VTT Version**: [Version]
3. **Module Version**: [Version]
4. **Browser**: [Chrome/Firefox/etc.]
5. **Tests Performed**: [List which tests from above]
6. **Results**: PASS / FAIL
7. **Notes**: [Any observations, edge cases found, etc.]

---

## Example Verification Session

```
=== VoxChronicle API Key Sanitization Verification ===
Date: 2026-02-07
Tester: [Your Name]
Browser: Chrome 120

✅ Test 1: OpenAI Client Initialization - PASS
   - Debug logs show sanitized URLs
   - No API keys visible in console

✅ Test 2: OpenAI API Error - PASS
   - Authorization shows "Bearer ***"
   - Error details properly sanitized

✅ Test 3: Kanka Client Initialization - PASS
   - Request URLs sanitized
   - No token exposure

✅ Test 4: Kanka API Error - PASS
   - Error messages sanitized
   - Token redacted in all logs

✅ Test 5: Network Errors - PASS
   - Stack traces clean
   - No sensitive data exposure

✅ Test 6: Success Logs - PASS
   - Endpoints sanitized
   - No token leakage

✅ Console Search - PASS
   - Search for "sk-" shows only "***"
   - Search for actual API key: 0 results
   - Search for actual Kanka token: 0 results

✅ Automated Tests - PASS
   - SensitiveDataFilter tests: 55/55 passed
   - Full test suite: All passed

=== VERIFICATION RESULT: ✅ PASS ===
```
