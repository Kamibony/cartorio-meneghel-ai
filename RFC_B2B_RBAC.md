# Technical Design Proposal: CI/CD Auth Fix & B2B RBAC Architecture

## 1. CI/CD Auth Fix (GitHub Actions & Vite)

### The Problem
The current GitHub Actions workflow (`deploy.yml`) builds the frontend using `npm run build` without injecting the necessary `VITE_FIREBASE_*` environment variables. Vite statically replaces `import.meta.env.*` during the build step. Since the variables are missing in the GitHub Actions environment, the built output receives undefined/fallback values (like `"mock-key"`), causing `auth/api-key-not-valid` in production.

### The Solution
1. **GitHub Secrets:** We need to store all Firebase configuration values as Repository Secrets in GitHub (e.g., `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc.).
2. **Update `deploy.yml`:** Map these secrets into the `env` block of the "Build frontend" step so Vite can bake them into the production bundle.

```yaml
      - name: Build frontend
        working-directory: ./frontend
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
        run: npm run build
```

## 2. Data Model & Security (Firestore)

### Data Model
To support multi-tenancy and RBAC, we should structure our collections to heavily partition data by `cartorio_id`.

- **`users/{uid}`**:
  - `email`: string
  - `role`: string (`"super_admin"`, `"cartorio_admin"`, `"escrevente"`)
  - `cartorio_id`: string (Reference to a cartorio document)
  - `status`: string (`"active"`, `"revoked"`)

- **`cartorios/{cartorio_id}`**:
  - `name`: string
  - `created_at`: timestamp

- **`cartorios/{cartorio_id}/minutas/{minuta_id}`** (Subcollection or Root Collection with `cartorio_id` field)
  - To keep shallow queries simple and security rules clean, keeping core entities root-level but strictly tied to a `cartorio_id` is often preferred, but subcollections provide structural strictness.
  - Given the current `firestore.rules` snippet, the subcollection path `/cartorios/{cartorioId}/minutas/{minutaId}` is already modeled. We should continue with this.

### Security Rules (`firestore.rules`)
We need to enforce that users can only access their `cartorio_id` and respect roles. We add an `isActive()` check to instantly cut off revoked users.

```javascript
    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isActive() {
      return isAuthenticated() && getUserData().status == 'active';
    }

    function hasRole(role) {
      return isActive() && getUserData().role == role;
    }

    function belongsToCartorio(cartorioId) {
      return isActive() && getUserData().cartorio_id == cartorioId;
    }
```
*   **Users Collection:** Users can read their own profile. Only `super_admin` or Backend can write.
*   **Cartorios Collection:** Read access requires `belongsToCartorio(cartorioId)`.
*   **Minutas/Audit:** Read/Write requires `belongsToCartorio(cartorioId)`.

## 3. Secure Invitations (Backend B2B Management)

### The Problem
Allowing the frontend (Cartório Admin) to directly create Auth Users requires client-side admin privileges, which is a massive security risk. Furthermore, public sign-ups must be disabled in Firebase Auth.

### The Solution
Implement a secure, server-side invitation flow using a Firebase Callable Cloud Function (or HTTPS endpoint).

1.  **Endpoint:** `/api/admin/invite_user`
2.  **Auth:** Validates the caller's Firebase Token.
3.  **Authorization:** Checks if the caller is a `"cartorio_admin"` (or `"super_admin"`).
4.  **Logic:**
    - Uses `firebase-admin` Auth SDK to create a new user: `auth.createUser({ email: newEmail })`.
    - Automatically assigns a random secure password (or leaves them without one initially if using magic links).
    - Uses `auth.generatePasswordResetLink(email)` or an email-verification flow to send an invite link to the `Escrevente`.
    - Creates the corresponding `/users/{new_uid}` document in Firestore with `role: "escrevente"`, `cartorio_id: caller.cartorio_id`, and `status: "active"`.
5.  **Revocation Endpoint:** `/api/admin/revoke_user`
    - Disables the user in Firebase Auth: `auth.updateUser(uid, { disabled: true })`.
    - Updates Firestore `status` to `"revoked"`.

## 4. Frontend UX/Routing (Gestão de Equipe)

### Conditional Routing Architecture
We currently have a single-page architecture switching between `<Login />` and `<Dashboard />` in `App.tsx` based on `AuthContext`. We will extend this without adding heavy routers by using the user's role.

1.  **Update `AuthContext`:** Fetch and expose `userRole` and `userStatus` alongside `cartorioId`.
2.  **App.tsx Routing Logic:**
    ```tsx
    if (!currentUser) return <Login />;
    if (userStatus === 'revoked') return <AccessDenied />;

    return (
      <Layout userRole={userRole}>
        {currentView === 'dashboard' && <ValidationDashboard />}
        {currentView === 'team_management' && hasRole('cartorio_admin') && <TeamManagement />}
      </Layout>
    );
    ```

### "Gestão de Equipe" Panel UI
- **Location:** Accessible via a navigation sidebar or header dropdown only visible to `cartorio_admin`.
- **View:** A data table displaying all users linked to their `cartorioId`.
- **Actions:**
  - **"Convidar Escrevente" (Button):** Opens a modal requesting an email address. Submits to `/api/admin/invite_user`.
  - **"Revogar Acesso" (Action Button on Row):** Confirms and calls `/api/admin/revoke_user`.
- **State Handling:** Use optimistic UI updates or re-fetch the user list from Firestore (`where("cartorio_id", "==", myCartorioId)`) after successful API calls.

## Summary & Next Steps
1. Configure GitHub Secrets and update `deploy.yml`.
2. Refactor `firestore.rules` for strict `isActive` and `cartorio_id` isolation.
3. Implement `invite_user` and `revoke_user` Python Cloud Functions.
4. Enhance `AuthContext` and build the "Gestão de Equipe" UI in React.

*Please review this proposal. Once approved, I can begin implementing the CI/CD fix and backend functions as the first step.*
