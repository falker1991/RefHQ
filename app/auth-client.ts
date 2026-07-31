export type Law18Session = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const storageKey = "law18referee-session";
const listeners = new Set<(session: Law18Session | null) => void>();
const refreshLeadSeconds = 120;
let currentSession: Law18Session | null = null;
let refreshPromise: Promise<Law18Session> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let lifecycleReady = false;

export class SessionExpiredError extends Error {
  constructor(message = "Your session has expired.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export function isSessionExpiredError(error: unknown): error is SessionExpiredError {
  return error instanceof SessionExpiredError;
}

class AuthRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AuthRequestError";
  }
}

function config() {
  if (!url || !key) throw new Error("Law18Referee Management is missing its Supabase public configuration.");
  return { url, key };
}

async function request(path: string, init: RequestInit = {}, token?: string) {
  const env = config();
  const response = await fetch(`${env.url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: env.key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AuthRequestError(data.msg || data.message || data.error_description || "Unable to complete that request.", response.status);
  return data;
}

function normalizedSession(session: Law18Session): Law18Session {
  return {
    ...session,
    expires_at: session.expires_at || Date.now() / 1000 + 3600,
    user: session.user?.id ? session.user : userFromToken(session.access_token),
  };
}

function scheduleRefresh(session: Law18Session | null) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (!session?.expires_at) return;
  const delay = Math.max(5_000, (session.expires_at - Date.now() / 1000 - refreshLeadSeconds) * 1000);
  refreshTimer = setTimeout(() => {
    void refreshSession(session).catch(() => undefined);
  }, delay);
}

function save(session: Law18Session | null, notify = true) {
  currentSession = session ? normalizedSession(session) : null;
  if (currentSession) localStorage.setItem(storageKey, JSON.stringify(currentSession));
  else localStorage.removeItem(storageKey);
  scheduleRefresh(currentSession);
  if (notify) listeners.forEach((listener) => listener(currentSession));
}

function userFromToken(accessToken: string) {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { id: String(payload.sub || ""), email: String(payload.email || "") };
  } catch {
    return { id: "", email: "" };
  }
}

function fromUrl(): { session: Law18Session | null; recovery: boolean } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return { session: null, recovery: false };
  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() / 1000 + Number(params.get("expires_in") || 3600),
    user: userFromToken(accessToken),
  };
  save(session);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return { session, recovery: params.get("type") === "recovery" || params.get("type") === "invite" };
}

function storedSession() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return normalizedSession(JSON.parse(raw) as Law18Session);
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

async function exchangeRefreshToken(session: Law18Session) {
  try {
    const refreshed = await request("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }) as Law18Session;
    save(refreshed);
    return normalizedSession(refreshed);
  } catch (error) {
    if (error instanceof TypeError) throw error;
    if (error instanceof AuthRequestError && (error.status === 400 || error.status === 401 || error.status === 403)) {
      throw new SessionExpiredError(error.message);
    }
    throw error;
  }
}

async function refreshSession(session: Law18Session) {
  if (refreshPromise) return refreshPromise;
  const refresh = async () => {
    const latest = storedSession() || session;
    if (latest.refresh_token !== session.refresh_token && (latest.expires_at || 0) > Date.now() / 1000 + refreshLeadSeconds) {
      save(latest);
      return latest;
    }
    return exchangeRefreshToken(latest);
  };
  const pending = typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("law18ref-session-refresh", () => refresh()) as unknown as Promise<Law18Session>
    : refresh();
  refreshPromise = pending;
  try {
    return await pending;
  } finally {
    refreshPromise = null;
  }
}

function installLifecycleRefresh() {
  if (lifecycleReady) return;
  lifecycleReady = true;
  const refreshWhenActive = () => {
    if (document.visibilityState === "visible" && currentSession) void auth.ensureValidSession(currentSession).catch(() => undefined);
  };
  document.addEventListener("visibilitychange", refreshWhenActive);
  window.addEventListener("focus", refreshWhenActive);
  window.addEventListener("online", refreshWhenActive);
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    const latest = storedSession();
    if (latest?.refresh_token !== currentSession?.refresh_token) save(latest, true);
  });
}

export const auth = {
  initialize() {
    installLifecycleRefresh();
    const linked = fromUrl();
    if (linked.session) return linked;
    const session = storedSession();
    save(session, false);
    return { session, recovery: false };
  },
  async ensureValidSession(session: Law18Session, force = false) {
    const latest = storedSession() || currentSession || session;
    const expiresSoon = !latest.expires_at || latest.expires_at <= Date.now() / 1000 + refreshLeadSeconds;
    return force || expiresSoon ? refreshSession(latest) : latest;
  },
  subscribe(listener: (session: Law18Session | null) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async signIn(email: string, password: string) {
    const session = await request("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }) as Law18Session;
    save(session);
    return session;
  },
  async verifyPassword(email: string, password: string) {
    const session = await request("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }) as Law18Session;
    save(session);
    return session;
  },
  async sendOrganizationVerification(email: string, challengeId: string) {
    const redirect = `${window.location.origin}/?organization_action=${encodeURIComponent(challengeId)}`;
    await request(`/otp?redirect_to=${encodeURIComponent(redirect)}`, {
      method: "POST",
      body: JSON.stringify({ email, create_user: false }),
    });
  },
  async signUp(email: string, password: string, fullName: string, redirectTo = window.location.origin) {
    return request("/signup", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName },
        email_redirect_to: redirectTo,
      }),
    }) as Promise<Law18Session>;
  },
  async sendRecovery(email: string) {
    await request("/recover", {
      method: "POST",
      body: JSON.stringify({ email, redirect_to: window.location.origin }),
    });
  },
  async updatePassword(session: Law18Session, password: string) {
    const user = await request("/user", {
      method: "PUT",
      body: JSON.stringify({ password }),
    }, session.access_token);
    const next = { ...session, user };
    save(next);
    return next;
  },
  signOut() {
    save(null);
  },
};
