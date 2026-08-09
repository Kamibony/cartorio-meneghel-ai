# MASTER_DASHBOARD_ARCHITECTURE.md

## 1. Executive Summary
As the platform transitions into a B2B SaaS model, a dedicated Master Dashboard is required for Super Admins to manage tenant (Cartório) lifecycles. Crucially, to comply with the Lei Geral de Proteção de Dados (LGPD), Super Admins must be strictly isolated from sensitive client data (e.g., legal drafts, scanned IDs) by default. Access to sensitive data for debugging or support will be governed by a rigorous "Break-Glass" protocol requiring explicit, time-bound client consent and generating an immutable audit trail.

## 2. Master Dashboard (Super Admin View)

### UI/UX Overview
The Master Dashboard acts as the central control plane, completely separate from the daily operational UI (Escrevente Workspace).
* **Navigation:** Accessible only to users with the `super_admin` role.
* **Tenant Management Hub:**
  * **View:** A data table listing all active Cartórios, their status, subscription tier, and creation dates.
  * **Create Tenant:** A modal to register a new Cartório. This action provisions a new `/cartorios/{cartorioId}` document.
  * **Provision Admin:** An interface to create the initial `cartorio_admin` for a tenant, utilizing the backend secure invite flow.
* **Aggregated Statistics (Non-Sensitive):**
  * Displays macro-level metrics such as total documents processed, API usage, and active tenant counts, without exposing PII or document contents.
* **Support Inbox:**
  * A view dedicated to active Break-Glass Support Requests granted by tenants.

## 3. LGPD-Compliant Data Isolation (Firestore & Storage Rules)

Currently, the `super_admin` role has blanket access to all data. To comply with LGPD, we will enforce a **Deny-by-Default** stance for Super Admins on all sensitive collections.

### Updated Firestore Security Rules Strategy
* **Metadata Access:** `super_admin` retains read/write access to root tenant documents (`/cartorios/{cartorioId}`), user management (`/users`), and non-sensitive configurations (`/templates`).
* **Restricted Sensitive Access:** Access to `/minutas`, `/audit_logs`, and Storage paths (`cartorios/{cartorioId}/scans/`) is strictly restricted to `belongsToCartorio(cartorioId)`. The global `hasRole('super_admin')` bypass will be removed from these match blocks.
* **Dynamic Support Bypass:** Read access to a specific minuta or scan will only be granted if a valid, unexpired "Break-Glass" support grant exists for that specific resource.

## 4. Break-Glass Support Protocol

When a Cartório encounters an issue requiring backend debugging, they must explicitly grant temporary access to a specific document.

### Technical Mechanism
1. **Initiation (Cartório Admin):**
   * The `cartorio_admin` clicks a "Solicitar Suporte" button on a specific document (`minuta`) in their dashboard.
   * This triggers a Cloud Function: `grantSupportAccess(documentId, durationInHours)`.
2. **State Management:**
   * The function sets a securely nested field on the `minuta` document itself (e.g., `support_grant: { expires_at: Timestamp, granted_by: uid }`).
   * A dedicated `support_requests` root collection could also map `document_id` to expiration timestamps for easier aggregate querying by Super Admins.
3. **Firestore Rule Implementation:**
   ```javascript
   function hasValidSupportGrant(minutaId) {
     let grant = get(/databases/$(database)/documents/minutas/$(minutaId)).data.support_grant;
     return hasRole('super_admin') && grant != null && grant.expires_at > request.time;
   }

   match /minutas/{minutaId} {
     allow read: if belongsToCartorio(resource.data.cartorio_id) || hasValidSupportGrant(minutaId);
     allow write: if belongsToCartorio(resource.data.cartorio_id); // Super admins still cannot modify
   }
   ```
4. **Immutable Audit Logging:**
   * Upon granting access, a mandatory log entry is appended to the `audit_logs` collection: `"[Timestamp] Cartório Admin X granted 24h support access for Document Y."`
   * Every time the `super_admin` reads the document via the Support Inbox, a Cloud Function or frontend interceptor logs: `"[Timestamp] Super Admin Z viewed Document Y under Support Grant."`

## 5. Implementation Roadmap

### Phase 1: Security Hardening (Backend & Rules)
1. **Refactor Rules:** Remove blanket `super_admin` read/write access from sensitive paths in `firestore.rules` and `storage.rules`.
2. **Support Grant API:** Create the `grantSupportAccess` Cloud Function to securely manage the timestamped authorization flags on `minutas`.
3. **Implement Rule Bypasses:** Update rules to allow `super_admin` reads ONLY when `support_expires_at > request.time`.

### Phase 2: Super Admin UI Construction (Frontend)
1. **Master Layout:** Create a dedicated `SuperAdminLayout` in the frontend, conditionally rendered in `App.tsx` when `userRole === 'super_admin'`.
2. **Tenant Manager:** Build the "Gestão de Cartórios" UI for creating new tenants and assigning the initial `cartorio_admin`.
3. **Admin Cloud Functions:** Ensure backend functions (`inviteEmployee`) correctly handle `super_admin` creating users in *other* tenants.

### Phase 3: Break-Glass UI & Audit Integration
1. **Client UI:** Add "Solicitar Suporte" actions to the Escrevente/Manager views for individual tasks.
2. **Support Inbox:** Build the Super Admin view to query and display documents where a valid support grant is active.
3. **Audit Visibility:** Expose the Break-Glass audit trails in the `cartorio_admin`'s "Histórico de Auditoria" view.
