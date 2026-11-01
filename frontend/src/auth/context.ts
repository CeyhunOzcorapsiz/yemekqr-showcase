import { createContext, useContext } from "react";
import type { Restaurant, User } from "../api/client";
export interface AuthContextValue {
  user: User | null;
  restaurant: Restaurant | null;
  loading: boolean;
  error: string;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  registerRestaurant: (data: {
    restaurantName: string;
    adminName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider gerekli.");
  return value;
}
