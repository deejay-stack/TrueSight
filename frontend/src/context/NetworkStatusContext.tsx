import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import {
  getConnectivityState,
  probeBackend,
  setBrowserOnline,
  subscribeConnectivity,
  type ConnectivityState,
} from "../services/connectivity";

export const RECONNECTED_EVENT = "truesight:connection-restored";

type NetworkStatusContextValue = ConnectivityState & {
  online: boolean;
  refreshConnectivity: () => Promise<boolean>;
};

const NetworkStatusContext = createContext<NetworkStatusContextValue | undefined>(
  undefined,
);

type NetworkStatusProviderProps = {
  children: ReactNode;
};

export function NetworkStatusProvider({ children }: NetworkStatusProviderProps) {
  const [status, setStatus] = useState<ConnectivityState>(getConnectivityState);
  const wasOfflineRef = useRef(false);

  const online = status.browserOnline && status.backendReachable !== false;

  useEffect(() => subscribeConnectivity(setStatus), []);

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      void probeBackend();
    };
    const handleOffline = () => {
      setBrowserOnline(false);
    };

    setBrowserOnline(navigator.onLine);
    void probeBackend();

    const interval = window.setInterval(() => {
      void probeBackend();
    }, 30_000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      return;
    }

    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      window.dispatchEvent(new CustomEvent(RECONNECTED_EVENT));
    }
  }, [online]);

  const value = useMemo<NetworkStatusContextValue>(
    () => ({
      ...status,
      online,
      refreshConnectivity: probeBackend,
    }),
    [online, status],
  );

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
      {!online && (
        <OfflineBanner
          checking={status.checking}
          browserOnline={status.browserOnline}
        />
      )}
    </NetworkStatusContext.Provider>
  );
}

function OfflineBanner({
  checking,
  browserOnline,
}: {
  checking: boolean;
  browserOnline: boolean;
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex justify-center px-3 pt-3 pointer-events-none">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-4xl items-center gap-3 rounded-2xl border border-amber-400/30 bg-[color-mix(in_srgb,var(--app-surface)_92%,#111827)] px-4 py-3 text-sm text-[var(--app-text)] shadow-[var(--app-shadow)] backdrop-blur-xl"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
          {checking ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-bold">
            {browserOnline ? "Server Connection Unavailable" : "No Internet Connection"}
          </p>
          <p className="mt-0.5 text-xs theme-muted">
            {browserOnline
              ? "Your internet is available, but the application server cannot be reached. Retrying automatically."
              : "Your device is offline. Previously loaded content remains available."}
          </p>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useNetworkStatus = () => {
  const context = useContext(NetworkStatusContext);

  if (!context) {
    throw new Error("useNetworkStatus must be used within NetworkStatusProvider");
  }

  return context;
};
