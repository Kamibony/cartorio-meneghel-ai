import { useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../utils/firebase';
import { ENV } from '../config/env';

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadAndExtract = async (file: File, documentType: string = 'id_card') => {
    setIsUploading(true);
    setIsExtracting(false);
    setError(null);
    let extractedData = null;

    try {
      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `scans/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      // Wait for it to be fully uploaded, we only need the gs:// URI

      // Calculate gs:// URI
      const bucket = storageRef.bucket;
      const fullPath = storageRef.fullPath;
      const gcsUri = `gs://${bucket}/${fullPath}`;

      setIsUploading(false);
      setIsExtracting(true);

      // 2. Call backend extract_document_data API
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

    } catch (err: any) {
      console.error('Upload/Extraction error:', err);
      setError(err.message || 'An unknown error occurred');
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
