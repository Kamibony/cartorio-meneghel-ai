# WORKSPACE_ARCHITECTURE.md

## 1. Executive Summary

This document outlines the holistic technical and UI/UX design strategy for the daily operations within the Cartório Meneghel AI platform. As the system scales to support multiple concurrent workers (Escreventes) and managerial oversight, we need a unified workspace architecture that ensures robust state persistence, logical task management, and clear role-based separation of concerns, all while maintaining our lightweight, single-page application (SPA) architecture without external routing libraries.

## 2. Escrevente Workspace (Dashboard)

The core workflow for an Escrevente revolves around the validation and generation of legal minutes. The architecture must guarantee that work is never lost during a session interruption and that tasks are clearly organized.

### 2.1 State Persistence and Session Recovery
To prevent data loss upon page refresh or accidental navigation:
* **Hybrid Caching Strategy:** The current architecture uses instantaneous `localStorage` saves for the HitL validation state, followed by a 30-second debounced sync to the Firestore `minutas/{document_id}` document under the `draft_state` map, and a `beforeunload` flush.
* **URL-Driven State:** The active task ID is represented in the URL (e.g., `?docId={document_id}`). On load, `App.tsx` parses this ID. It first attempts to hydrate from `localStorage` for any unsynced progress, falling back to the Firestore document if `localStorage` is empty. Successfully syncing to Firestore clears the local cache.
* **Resilience:** This ensures that if a user accidentally closes the tab, returning to the URL immediately restores the exact state of the character-level diffs and validation progress.

### 2.2 Task Inbox and Queue Management
Currently, the system processes single validation flows. We will introduce a **Task Inbox (Fila de Tarefas)**:
* **Status-Based Queues:** Utilizing the transactional state machine in the `minutas` Firestore collection, the inbox will categorize tasks by status:
  * `processing`: AI extraction is in progress.
  * `hitl_required`: Awaiting human validation and conflict resolution.
  * `completed`: Verified and ready for minute generation.
* **UI Implementation:** A sidebar or a dedicated "Minhas Tarefas" view will query the `minutas` collection where `cartorio_id` matches the user's context. Tasks can be claimed, effectively assigning an `assigned_to` field to prevent duplicate effort among multiple Escreventes.

## 3. Managerial Admin Panel

Managers (`cartorio_admin` and `super_admin`) require tools to oversee operations, manage resources, and ensure compliance. These functions should be distinct from the daily validation workspace to prevent clutter.

### 3.1 Template Management (`TemplateManager`)
* **UX Strategy:** A dedicated view for uploading `.docx` templates, parsing Jinja2 tags, and managing active/inactive states.
* **Data Flow:** Templates are stored in GCS with metadata in the `templates` Firestore collection, partitioned by `cartorio_id`.

### 3.2 Team Activity & Access (`TeamManagement`)
* **UX Strategy:** An interface to invite employees, assign roles (`escrevente`, `cartorio_admin`), and instantly revoke access.
* **Security:** Actions strictly rely on the backend Cloud Functions (e.g., `inviteEmployee`, `revokeEmployeeAccess`) using `firebase-admin` to set custom claims, preventing client-side privilege escalation. The frontend's `AuthContext` instantly responds to revoked status via a real-time `onSnapshot` listener.

### 3.3 Audit Logging and Oversight (`useAuditLog`)
* **UX Strategy:** A "Histórico de Auditoria" view providing a read-only table of all HitL corrections, tracking who made the change, when, and what field was altered.
* **Data Flow:** Queries the `AuditLog` Firestore collection, providing LGPD compliance and managerial oversight over manual interventions.

## 4. UI/UX Routing Strategy

To support this expanded functionality while honoring our constraint of not using heavy external routing libraries (like `react-router-dom`), we will implement a robust custom routing solution based on `window.history` and React state.

### 4.1 Unified Layout Architecture
We propose a **Sidebar Navigation Layout** that logically separates concerns:

* **Global Container:** The `App.tsx` acts as the root controller, authenticated via `AuthContext`.
* **Sidebar (Left):** Context-aware navigation menu.
  * **Workspace Section (All Users):**
    * Inbox / Fila de Tarefas
    * Validação (Active Task)
    * Gerador de Minutas
  * **Admin Section (Admins Only):** Rendered conditionally based on `userRole === 'cartorio_admin' || userRole === 'super_admin'`.
    * Templates
    * Gestão de Equipe
    * Auditoria
* **Main Content Area (Right):** Renders the component corresponding to the active selection.

### 4.2 Custom State-Based Routing
* **State Management:** The `currentView` state in `App.tsx` will manage the active component (e.g., `'inbox'`, `'validation'`, `'templates'`).
* **URL Synchronization:** When a user clicks a sidebar item, `window.history.pushState` updates the URL (e.g., `?view=templates`) without a full page reload.
* **Deep Linking:** The `useEffect` hook in `App.tsx` will parse `window.location.search` on initial load to set the correct `currentView` and active `docId`, enabling direct links to specific views or active validation sessions.
