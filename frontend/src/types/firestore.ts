import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'escrevente';

export interface User {
  uid: string; // Firebase Auth UID
  email: string;
  displayName: string;
  role: UserRole;
  cartorio_id: string; // Multi-tenant partition key
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type MinutaState = 'processing' | 'hitl_required' | 'completed' | 'error';

export interface Minuta {
  id?: string;
  cartorio_id: string; // Multi-tenant partition key
  status: MinutaState;

  // Storage references
  raw_pdf_gcs_uri: string;

  // Data tracking
  ai_extracted_data?: Record<string, any>;
  human_final_data?: Record<string, any>;

  // Metadata
  document_type: string;
  createdBy: string; // User UID
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditLog {
  id?: string;
  cartorio_id: string; // Multi-tenant partition key
  minuta_id: string; // Reference to the Minuta

  // Who changed what
  userId: string; // User UID
  userName: string;

  // What changed
  fieldChanged: string;
  oldValue: any; // AI value
  newValue: any; // Human value

  // When
  timestamp: Timestamp;
}
