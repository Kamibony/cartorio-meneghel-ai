import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
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
    let snapshotUnsubscribe: (() => void) | undefined;

    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          // Force token refresh on load to ensure custom claims are fresh (for Admin UI access)
          await user.getIdToken(true);

          // Set up real-time listener for the user document to act as an immediate kill switch
          snapshotUnsubscribe = onSnapshot(doc(db, 'users', user.uid), (userDoc) => {
              if (userDoc.exists()) {
                  const data = userDoc.data() as FirestoreUser;

                  // Immediate kill switch if status is revoked
                  if ((data as any).status === 'revoked') {
                      console.warn("User access revoked. Signing out immediately.");
                      signOut(auth);
                      return;
                  }

                  setCartorioId(data.cartorio_id);
                  setUserRole(data.role);
              } else {
                  setCartorioId('default_cartorio'); // Fallback
                  setUserRole('escrevente');
              }
              setIsLoading(false);
          }, (error) => {
              console.error("User snapshot listener error:", error);
              setIsLoading(false);
          });
        } catch (e) {
          console.error("Failed to set up user context listener", e);
          setCartorioId('default_cartorio');
          setUserRole('escrevente');
          setIsLoading(false);
        }
      } else {
        if (snapshotUnsubscribe) {
            snapshotUnsubscribe();
        }
        setCartorioId(null);
        setUserRole(null);
        setIsLoading(false);
      }
    });

    return () => {
        authUnsubscribe();
        if (snapshotUnsubscribe) {
            snapshotUnsubscribe();
        }
    };
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
