import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../utils/firebase';
import type { User as FirestoreUser, UserRole } from '../types/firestore';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  cartorioId: string | null;
  userRole: UserRole | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [cartorioId, setCartorioId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as FirestoreUser;
            setCartorioId(data.cartorio_id);
            setUserRole(data.role);
          } else {
            setCartorioId('default_cartorio'); // Fallback
            setUserRole('escrevente');
          }
        } catch (e) {
          console.error("Failed to load user context", e);
          setCartorioId('default_cartorio');
          setUserRole('escrevente');
        }
      } else {
        setCartorioId(null);
        setUserRole(null);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    currentUser,
    cartorioId,
    userRole,
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
