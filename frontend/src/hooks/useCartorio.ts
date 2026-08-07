import { useState, useEffect } from 'react';
import { auth, db } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import type { User } from '../types/firestore';

export function useCartorio() {
  const [cartorioId, setCartorioId] = useState<string | null>('default_cartorio'); // Fallback or loaded

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
             setCartorioId((userDoc.data() as User).cartorio_id);
          }
        } catch (e) {
          console.error("Failed to load user cartorio context", e);
        }
      } else {
        setCartorioId('default_cartorio');
      }
    });

    return () => unsubscribe();
  }, []);

  return { cartorioId };
}
