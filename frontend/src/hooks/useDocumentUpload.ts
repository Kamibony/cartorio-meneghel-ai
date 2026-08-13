import { useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { collection, addDoc, updateDoc, doc, Timestamp, onSnapshot } from 'firebase/firestore';
import { storage, db } from '../utils/firebase';
import { ENV } from '../config/env';
import type { Minuta } from '../types/firestore';
import { useAuth } from '../contexts/AuthContext';

export function useDocumentUpload() {
  const { currentUser } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadAndExtract = async (file: File, documentType: string = 'id_card', cartorioId: string) => {
    setIsUploading(true);
    setIsExtracting(false);
    setError(null);
    let extractedData = null;
    let minutaDocRef = null;

    try {
      if (!currentUser) {
        throw new Error('User must be authenticated to upload and extract documents');
      }

      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `cartorios/${cartorioId}/scans/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);

      // Calculate gs:// URI
      const bucket = storageRef.bucket;
      const fullPath = storageRef.fullPath;
      const gcsUri = `gs://${bucket}/${fullPath}`;

      // 2. Initialize Minuta in Firestore
      const minutasRef = collection(db, 'minutas');
      const initialMinuta: Minuta = {
        cartorio_id: cartorioId,
        status: 'processing',
        raw_pdf_gcs_uri: gcsUri,
        document_type: documentType,
        createdBy: currentUser.uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      minutaDocRef = await addDoc(minutasRef, initialMinuta);

      setIsUploading(false);
      setIsExtracting(true);

      // 3. Call backend extract_document_data API
      // We rely on Firestore listener for the final data to avoid the 60s timeout wall.
      const extractionPromise = new Promise<any>((resolve, reject) => {
        const unsub = onSnapshot(doc(db, 'minutas', minutaDocRef!.id), (snap) => {
          const data = snap.data();
          if (data) {
            if (data.status === 'hitl_required' && data.ai_extracted_data) {
              unsub();
              resolve(data.ai_extracted_data);
            } else if (data.status === 'error') {
              unsub();
              reject(new Error(data.error || 'Falha ao extrair dados na nuvem.'));
            }
          }
        });
      });

      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/extract_document_data`;

      const token = await currentUser.getIdToken();
      // We don't await the fetch directly for its data if it takes too long.
      // But we still await it here so if it fails fast (like 400 Bad Request), we catch it.
      // The 502 Bad Gateway will throw an error, but since we are polling, we shouldn't throw immediately
      // if the backend is actually still processing.
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Cartorio-ID': cartorioId
        },
        body: JSON.stringify({
          gcs_uri: gcsUri,
          document_type: documentType,
          minuta_id: minutaDocRef.id,
        }),
      }).then(async (response) => {
        if (!response.ok && response.status !== 502 && response.status !== 504) {
             const responseText = await response.text();
             let data;
             try {
               data = JSON.parse(responseText);
             } catch (parseErr) {
               // ignore
             }
             let errMsg = data?.error || 'Falha ao extrair dados';
             if (response.status === 429) {
                 errMsg = 'Rate limit reached';
             }
             console.error(errMsg);
             // Update Firestore to error state so the snapshot listener rejects
             await updateDoc(doc(db, 'minutas', minutaDocRef!.id), {
                 status: 'error',
                 error: errMsg,
                 updatedAt: Timestamp.now(),
             });
        }
      }).catch(async (e) => {
          console.warn('Fetch connection closed (expected if > 60s):', e);
          // If the network completely fails (e.g. offline), we should also fail
          // But a 502 won't hit catch(), it hits the .then() block with !response.ok
          // This is mostly for CORS or network dropping.
          // Wait, if it's a timeout error thrown by fetch, it hits here.
          // In standard browser fetch, timeouts might throw. We can set a timeout fallback if needed, but
          // we don't want to fail if the backend is still working.
      });

      extractedData = await extractionPromise;
    } catch (err: any) {
      console.error('Upload/Extraction error:', err);
      setError(err.message || 'An unknown error occurred');

      // Optionally update the minuta state to 'error'
      if (minutaDocRef) {
        try {
           await updateDoc(doc(db, 'minutas', minutaDocRef.id), {
             status: 'error',
             updatedAt: Timestamp.now(),
           });
        } catch (updateErr) {
           console.error('Failed to update minuta error state:', updateErr);
        }
      }
      throw err;
    } finally {
      setIsUploading(false);
      setIsExtracting(false);
    }

    return extractedData;
  };

  return {
    uploadAndExtract,
    isUploading,
    isExtracting,
    error,
  };
}
