import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import type { User as FirestoreUser } from '../types/firestore';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  cartorioId: string | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [cartorioId, setCartorioId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setCartorioId((userDoc.data() as FirestoreUser).cartorio_id);
          } else {
            setCartorioId('default_cartorio'); // Fallback
          }
        } catch (e) {
          console.error("Failed to load user cartorio context", e);
          setCartorioId('default_cartorio');
        }
      } else {
        setCartorioId(null);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    currentUser,
    cartorioId,
    isLoading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
