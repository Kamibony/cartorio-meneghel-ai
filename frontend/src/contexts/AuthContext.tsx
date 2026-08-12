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
          const tokenResult = await user.getIdTokenResult();
          const tokenRole = tokenResult.claims.role as UserRole | undefined;
          const tokenCartorioId = tokenResult.claims.cartorio_id as string | undefined;

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

                  // Force token refresh if role in Firestore doesn't match current token claims
                  if (data.role && tokenRole && data.role !== tokenRole) {
                      console.warn("Role mismatch detected. Forcing token refresh.");
                      user.getIdToken(true).then(() => {
                          // we could parse new token, or just let the next reload get it,
                          // but the assignment below might be stale. However, re-fetching token
                          // usually means we just update the token for next requests.
                          // To update UI instantly, we'll use the firestore data:
                      }).catch(e => console.error("Failed to force refresh token", e));

                      setUserRole(data.role || null);
                      setCartorioId(data.cartorio_id || null);
                  } else {
                      setCartorioId(tokenCartorioId || data.cartorio_id || null);
                      setUserRole(tokenRole || data.role || null);
                  }
              } else {
                  setCartorioId(tokenCartorioId || null);
                  setUserRole(tokenRole || null);
              }
              setIsLoading(false);
          }, (error) => {
              console.error("User snapshot listener error:", error);
              // Fallback to token claims if Firestore listener fails (e.g. permission denied)
              setCartorioId(tokenCartorioId || null);
              setUserRole(tokenRole || null);
              setIsLoading(false);
          });
        } catch (e) {
          console.error("Failed to set up user context listener", e);
          // If we fail before or during token fetch, these might not be defined.
          // But if we fail later, they might be. Since they are let/const scoped inside the try block,
          // they won't be accessible here. We should declare them outside.
          setCartorioId(null);
          setUserRole(null);
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
