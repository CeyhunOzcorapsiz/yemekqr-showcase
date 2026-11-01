import { useCallback, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import { api, ApiError, errorMessage } from "../api/client";
import type { Restaurant, User } from "../api/client";
import { AuthContext } from "./context";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const retry = useCallback(() => {
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    api
      .me()
      .then((r) => {
        if (ticket !== generation.current) return;
        setUser(r.user);
        setRestaurant(r.restaurant);
      })
      .catch((e) => {
        if (ticket !== generation.current) return;
        if (e instanceof ApiError && e.status === 401) {
          setUser(null);
          setRestaurant(null);
        } else setError(errorMessage(e));
      })
      .finally(() => {
        if (ticket === generation.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    try {
      localStorage.removeItem("yemekqr_token");
    } catch {
      /* Old client token migration. */
    }
    retry();
    const expired = () => {
      generation.current++;
      setLoading(false);
      setUser(null);
      setRestaurant(null);
    };
    window.addEventListener("yemekqr:unauthorized", expired);
    return () => window.removeEventListener("yemekqr:unauthorized", expired);
  }, [retry]);
  async function login(email: string, password: string) {
    const r = await api.login({ email, password });
    generation.current++;
    setLoading(false);
    setUser(r.user);
    setRestaurant(r.restaurant);
    setError("");
  }
  async function registerRestaurant(data: {
    restaurantName: string;
    adminName: string;
    email: string;
    password: string;
  }) {
    const r = await api.registerRestaurant(data);
    generation.current++;
    setLoading(false);
    setUser(r.user);
    setRestaurant(r.restaurant);
    setError("");
  }
  async function logout() {
    await api.logout();
    generation.current++;
    setLoading(false);
    setUser(null);
    setRestaurant(null);
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        restaurant,
        loading,
        error,
        retry,
        login,
        registerRestaurant,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
