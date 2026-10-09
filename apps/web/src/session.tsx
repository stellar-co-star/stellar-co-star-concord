import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { UNAUTHORIZED, api, showOrg, type AuthConfig, type Me, type Network } from "./api";

interface Session {
  config: AuthConfig;
  /** Null when nobody is signed in. */
  me: Me | null;
  /** Take the signed-in state the server just returned, or ask it again. */
  adopt: (me?: Me | null) => Promise<void>;
  signOut: () => Promise<void>;
  network: Network;
  setNetwork: (network: Network) => void;
}

const SessionContext = createContext<Session | null>(null);
const NETWORK_KEY = "stellar-co-star-stellar-co-star-stellar-co-star-concord.network";

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

/** The signed-in user. Only for screens that render behind the sign-in check. */
export function useMe(): Me {
  const { me } = useSession();
  if (!me) throw new Error("no session");
  return me;
}

function storedNetwork(): Network | undefined {
  try {
    const value = localStorage.getItem(NETWORK_KEY);
    return value === "mainnet" || value === "testnet" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: (error?: string) => ReactNode }) {
  const [config, setConfig] = useState<AuthConfig>();
  const [me, setMe] = useState<Me | null>();
  const [error, setError] = useState<string>();
  const [network, pick] = useState<Network | undefined>(storedNetwork);

  const adopt = useCallback(async (next?: Me | null) => {
    if (next !== undefined) {
      showOrg(next?.org.id);
      setMe(next);
      return;
    }
    const fresh = (await api<{ me: Me | null }>("/auth/session")).me;
    showOrg(fresh?.org.id);
    setMe(fresh);
  }, []);

  useEffect(() => {
    // Earlier builds kept a shared token and a free-text signer here; neither is used now.
    try {
      localStorage.removeItem("stellar-co-star-stellar-co-star-stellar-co-star-concord.token");
      localStorage.removeItem("stellar-co-star-stellar-co-star-stellar-co-star-concord.author");
    } catch {
      // Storage can be unavailable; nothing depends on it.
    }
    api<AuthConfig>("/auth/config")
      .then(setConfig)
      .then(() => adopt())
      .catch((e: Error) => setError(e.message));
  }, [adopt]);

  useEffect(() => {
    const on = () => {
      showOrg(undefined);
      setMe(null);
    };
    addEventListener(UNAUTHORIZED, on);
    return () => removeEventListener(UNAUTHORIZED, on);
  }, []);

  const setNetwork = useCallback((next: Network) => {
    pick(next);
    try {
      localStorage.setItem(NETWORK_KEY, next);
    } catch {
      // The choice still holds for this visit.
    }
  }, []);

  const signOut = useCallback(async () => {
    await api("/auth/signout", { method: "POST" }).catch(() => undefined);
    showOrg(undefined);
    setMe(null);
  }, []);

  const value = useMemo<Session | null>(() => {
    if (!config || me === undefined) return null;
    const chosen = network && config.networks.includes(network) ? network : config.defaultNetwork;
    return { config, me, adopt, signOut, network: chosen, setNetwork };
  }, [config, me, adopt, signOut, network, setNetwork]);

  if (!value) return <>{fallback(error)}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
