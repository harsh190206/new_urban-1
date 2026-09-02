import { createContext, useContext, useState, type ReactNode } from "react";

type Role = "USER" | "ADMIN" | "AGENT";

interface AuthUser {
  id: number;
  email: string;
  name?: string;
  role: Role;
  [key: string]: any;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  role: Role | null;
  login: (token: string, user: AuthUser, role: Role) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [role, setRole] = useState<Role | null>(() => localStorage.getItem("role") as Role | null);

  const login = (token: string, user: AuthUser, role: Role) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("role", role);
    setToken(token);
    setUser(user);
    setRole(role);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    setToken(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, role, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
