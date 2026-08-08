# Architecture Plan: Transition RBAC to Firebase Auth Custom Claims

## 1. The Problem
Currently, Firebase Storage security rules (`storage.rules`) rely on cross-service Firestore reads (`firestore.get()`) to fetch user data (such as `role` and `cartorio_id`) for authorizing file uploads to paths like `/scans/`.
This approach has several drawbacks:
- It is inherently susceptible to IAM propagation delays.
- It slows down the upload pipeline, which blocks E2E extraction testing.
- It can cause latency issues and potentially result in 403 errors during operations.

## 2. The Solution
Transition the RBAC mechanism to utilize Firebase Auth Custom Claims.
Custom claims allow us to embed necessary user metadata (`cartorio_id` and `role`) directly into the user's authentication token at the time of creation or update.

This entirely eliminates the need for `firestore.get()` reads in Firebase Storage and Firestore security rules, increasing performance and reliability.

### Implementation Steps

#### A. Backend Updates (Cloud Functions)
Update backend user management functions (e.g., `inviteEmployee`, role assignments) to set custom claims using the Firebase Admin SDK.

```javascript
// Example in Node.js / TypeScript (or Python equivalent using python-firebase-admin):
admin.auth().setCustomUserClaims(uid, {
  cartorio_id: "CARTORIO_UUID",
  role: "cartorio_admin" // or 'escrevente', 'super_admin'
});
```

#### B. Storage Rules Refactor (`storage.rules`)
Refactor the Storage rules to read from `request.auth.token` instead of `firestore.get()`.

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function isAuthenticated() {
      return request.auth != null;
    }

    // New helper functions using custom claims
    function hasRole(role) {
      return isAuthenticated() && request.auth.token.role == role;
    }

    function belongsToCartorio(cartorioId) {
      return isAuthenticated() && request.auth.token.cartorio_id == cartorioId;
    }

    match /cartorios/{cartorioId} {
      match /templates/{templateId} {
        allow read: if belongsToCartorio(cartorioId);
        allow write: if belongsToCartorio(cartorioId) && (hasRole('cartorio_admin') || hasRole('super_admin'));
      }

      match /generated/{documentId} {
        allow read, write: if belongsToCartorio(cartorioId);
      }

      match /scans/{documentId} {
        allow read, write: if belongsToCartorio(cartorioId);
      }
    }
  }
}
```

#### C. Firestore Rules Refactor (`firestore.rules`)
Update Firestore rules to utilize the custom claims as well, removing `firestore.get()` for basic authorization checks (unless fetching dynamic flags like `isActive`).

#### D. Frontend Handling
- Implement a token refresh mechanism on the frontend to ensure that when a user's claims are updated, the client fetches the new token to reflect the updated permissions immediately.
- E.g., `await user.getIdToken(true);`

## 3. Rollout Strategy
1. **Cloud Functions Deployment:** Update and deploy user creation functions to attach custom claims to all newly created users.
2. **Backfill Script:** Run a script to backfill existing users in Firebase Auth, mapping their existing `cartorio_id` and `role` from Firestore into custom claims.
3. **Rules Update:** Deploy the refactored `storage.rules` and `firestore.rules`.
4. **Remove Hotfix:** Once fully transitioned, remove the temporary hotfix in `storage.rules` (which falls back to `isAuthenticated()`) and fully rely on Custom Claims.
