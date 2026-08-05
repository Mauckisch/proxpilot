import {
  createContext,
  type ReactNode,
  useContext,
} from 'react';

export type UserRole = 'admin' | 'viewer';
export type UserSource = 'local' | 'ldap';

export type AuthUser = {
  username: string;
  role: UserRole;
  source: UserSource;
};

type AuthContextValue = {
  user: AuthUser;
  isAdmin: boolean;
};

const AuthContext =
  createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  user: AuthUser;
  children: ReactNode;
};

export function AuthProvider({
  user,
  children,
}: AuthProviderProps) {
  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: user.role === 'admin',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      'useAuth must be used inside AuthProvider.',
    );
  }

  return context;
}
