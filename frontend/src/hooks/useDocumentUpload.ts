import { useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { storage, db, auth } from '../utils/firebase';
import { ENV } from '../config/env';
import type { Minuta } from '../types/firestore';

export function useDocumentUpload() {
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
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User must be authenticated to upload and extract documents');
      }

      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `scans/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);

      // Calculate gs:// URI
      const bucket = storageRef.bucket;
      const fullPath = storageRef.fullPath;
      const gcsUri = `gs://${bucket}/${fullPath}`;

      // 2. Initialize Minuta in Firestore
      const minutasRef = collection(db, 'cartorios', cartorioId, 'minutas');
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
      const apiUrl = ENV.apiUrl;
      const endpoint = `${apiUrl}/extract_document_data`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gcs_uri: gcsUri,
          document_type: documentType,
          // minuta_id: minutaDocRef.id, // we might pass this to the backend in the future
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Erro no servidor: Resposta não está em formato JSON. Por favor, tente novamente.');
      }

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Serviço temporariamente indisponível devido ao alto volume (Rate Limit). Por favor, tente novamente em alguns segundos.');
        }
        throw new Error(data.error || 'Falha ao extrair dados');
      }

      extractedData = data.data;

      // 4. Update Minuta with extracted data
      if (minutaDocRef) {
        await updateDoc(doc(db, 'cartorios', cartorioId, 'minutas', minutaDocRef.id), {
          status: 'hitl_required', // Assume it needs HitL or let backend decide
          ai_extracted_data: extractedData,
          updatedAt: Timestamp.now(),
        });
      }

    } catch (err: any) {
      console.error('Upload/Extraction error:', err);
      setError(err.message || 'An unknown error occurred');

      // Optionally update the minuta state to 'error'
      if (minutaDocRef) {
        try {
           await updateDoc(doc(db, 'cartorios', cartorioId, 'minutas', minutaDocRef.id), {
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
