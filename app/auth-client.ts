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
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "Unable to complete that request.");
  return data;
}

function save(session: Law18Session | null) {
  if (session) localStorage.setItem(storageKey, JSON.stringify(session));
  else localStorage.removeItem(storageKey);
  listeners.forEach((listener) => listener(session));
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
    user: { id: "", email: "" },
  };
  save(session);
  history.replaceState(null, "", window.location.pathname);
  return { session, recovery: params.get("type") === "recovery" || params.get("type") === "invite" };
}

export const auth = {
  initialize() {
    const linked = fromUrl();
    if (linked.session) return linked;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { session: null, recovery: false };
    try {
      return { session: JSON.parse(raw) as Law18Session, recovery: false };
    } catch {
      localStorage.removeItem(storageKey);
      return { session: null, recovery: false };
    }
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
  async signUp(email: string, password: string, fullName: string) {
    return request("/signup", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName },
        email_redirect_to: window.location.origin,
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
