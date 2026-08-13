# Authentication & Authorization Architecture Analysis

This document provides a systemic architectural review of the current authentication, authorization, and onboarding flows, addressing critical pain points and proposing robust, scalable solutions.

## 1. The User Onboarding Lifecycle

**Current State & Issue:**
The current `inviteEmployee` Cloud Function creates a new user and relies on `auth.generate_password_reset_link(email)`, sending a generic "Reset Password" email. This provides a confusing and poor UX for a newly invited user.

**Proposed Architecture:**
To simulate a proper "Accept Invite" flow, we must replace the generic password reset email with a custom onboarding workflow.

*   **Generate OOB (Out-of-Band) Action Code:** We can still utilize Firebase's underlying password reset mechanism securely by generating an Out-of-Band (OOB) link via the Admin SDK, but we intercept the email delivery.
*   **Custom Email Delivery Service:** Instead of Firebase sending the email, the `inviteEmployee` backend function should:
    1.  Call `auth.generate_password_reset_link(email)`.
    2.  Extract the OOB code from the generated link.
    3.  Construct a custom URL pointing to our frontend (e.g., `https://our-app.com/accept-invite?oobCode=<CODE>`).
    4.  Dispatch an email using a dedicated transactional email service (like SendGrid, AWS SES, or a Firebase Extension for SendGrid/Mailchimp) using a polished HTML template titled "Welcome to the Platform - Accept Your Invitation".
*   **Frontend Resolution:** The frontend `/accept-invite` route captures the `oobCode` and uses the standard Firebase client SDK (`confirmPasswordReset`) to allow the user to set their initial password seamlessly.

## 2. State Syncing (Firestore vs. Custom Claims)

**Current State & Issue:**
The system uses both Firestore user documents (`/users/{uid}`) and Firebase Auth Custom Claims (`role`, `cartorio_id`) to manage authorization. Discrepancies between these two sources can lead to states where a user sees data they shouldn't or is blocked from data they should access, as the frontend UI might read from Firestore while backend rules read from Custom Claims.

**Proposed Architecture:**
The core principle must be a **Single Source of Truth (SSOT)**. Since Custom Claims are injected into the auth token and are the most secure way to enforce rules without incurring extra database reads, they must be the SSOT for authorization.

*   **Auth Blocking Functions (Before Sign-in):** We should implement Firebase Auth Blocking Functions (`beforeSignIn`). When a user signs in, this function can compare their current Custom Claims against their Firestore document. If there's a discrepancy, it forcefully updates the Custom Claims to match the Firestore state *before* the session token is minted. This guarantees synchronization upon every login.
*   **Firestore Write Triggers:** To ensure claims are updated while a user is actively logged in, any modification to a user's `role` or `cartorio_id` in the `users` collection must be performed via a secure backend endpoint (like our current Admin functions) which atomically updates both Firestore and Auth Claims. However, to guard against manual database edits, a Firestore Trigger (`on_document_written` for `/users/{uid}`) should be deployed. This trigger listens for changes to `role`, `cartorio_id`, or `status` and strictly propagates them to Firebase Auth Custom Claims.

## 3. Tenant Isolation & Security Rules

**Current State & Issue:**
The system relies on a multi-tenant structure partitioned by `cartorio_id`. The current `firestore.rules` and `storage.rules` implement `belongsToCartorio(cartorioId)` checks. However, historical implementations sometimes suffer from global bypasses for `super_admin` or fail to enforce strict isolation on related entities.

**Proposed Architecture:**
The security rules must enforce impenetrable data isolation (LGPD compliance) by default, adhering to the principle of least privilege.

*   **Strict Claim-Based Evaluation:** Security rules must evaluate the `cartorio_id` Custom Claim. The current `hasRole` and `belongsToCartorio` helper functions in `firestore.rules` correctly check `request.auth.token`. This is good.
*   **Removal of Implicit Global Bypasses:** The `super_admin` role must **not** have implicit read/write access to sensitive tenant data (e.g., Minutas, Audit Logs, Scanned Documents). The current rules allow `super_admin` to read `/cartorios/{cartorioId}`. We must ensure that deeply nested, sensitive collections within a cartorio restrict `super_admin` unless a specific, time-bound "Break-Glass" support grant is active.
*   **Resource Data Verification:** When creating or updating records (like a `minuta`), rules must enforce that the client is not attempting to inject a payload belonging to another tenant. Example:
    ```javascript
    allow write: if belongsToCartorio(cartorioId) && request.resource.data.cartorio_id == cartorioId;
    ```
*   **Storage Rules:** The `storage.rules` currently allow restricted access to `/cartorios/{cartorioId}/scans/{documentId}` based on `belongsToCartorio`. This is correct. We must ensure no `hasRole('super_admin')` OR conditions are accidentally added to these sensitive paths in the future.

## 4. Immediate Access Revocation

**Current State & Issue:**
When a user is revoked via the `revokeEmployeeAccess` function, Firebase Auth session tokens (JWTs) remain valid for up to 1 hour (their TTL). This means a malicious user could continue interacting with the system for an hour after revocation.

**Proposed Architecture:**
We need a multi-layered approach to instantly terminate access across the entire stack.

*   **Immediate Refresh Token Revocation:** The `revokeEmployeeAccess` function currently calls `auth.revoke_refresh_tokens(target_uid)`. This is correct and prevents the minting of *new* session tokens, but doesn't invalidate the current active 1-hour token.
*   **Firestore Kill-Switch (Backend Rules):** We must leverage the Firestore user document `status` field as an active kill-switch. The current `firestore.rules` implements `isActiveUser()`:
    ```javascript
    function isActiveUser() {
      let data = getUserData();
      return data == null || !('status' in data) || data.status != 'revoked';
    }
    ```
    This function reads the user document (`get(/databases/$(database)/documents/users/$(request.auth.uid))`). While this incurs a document read per request, it is the *only* way to instantly block backend access for a compromised token. The architectural trade-off of an extra read is absolutely necessary for immediate revocation security.
*   **Frontend Real-time Listener (UI Kill-Switch):** The frontend `AuthContext` must maintain an active `onSnapshot` listener on the user's Firestore document. The moment the `status` field changes to `'revoked'`, the callback fires, and the client-side code immediately executes `signOut(auth)`, forcefully terminating the UI session.
*   **Custom Claims Clearing:** As an additional safeguard, when revoking a user, their Custom Claims (`role`, `cartorio_id`) should be actively cleared or set to a "nullified" state in Firebase Auth.
