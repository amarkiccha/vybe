// Typed API client for the VYBE Node/Express backend.
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

export const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const TOKEN_KEY = "vybe.session";
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
export const getToken = () => token;
export async function loadToken() {
  token = (await storage.secureGet(TOKEN_KEY, null)) as string | null;
  return token;
}
export async function saveToken(t: string | null) {
  token = t;
  if (t) await storage.secureSet(TOKEN_KEY, t);
  else await storage.secureRemove(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  data: any;
  constructor(status: number, code: string, message: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, "offline", "Network unavailable");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/login")) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? "generic", data.message ?? data.error ?? "Request failed", data);
  }
  return data as T;
}

// Media is always served through the API with authorization (token in query for <Image>/web).
export const mediaUrl = (id?: string | null) => (id ? `${API_BASE}/media/${id}?token=${token ?? ""}` : undefined);
export const imageSrc = (v?: string | null) => (!v ? undefined : v.startsWith("http") ? v : mediaUrl(v));

export async function uploadFile(uri: string, name: string, type: string) {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }
  const r = await api<{ media: { id: string; mime: string; name: string; size: number } }>("/media/upload", { form });
  return r.media;
}

export const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type User = { id: string; name: string; username?: string; avatar?: string; bio?: string; role?: string; status?: string };
export type Me = User & {
  email: string; phone?: string; language: string; theme: string; contentFilter: boolean; twoStepEnabled: boolean; isAdmin?: boolean;
  closeFriends: string[]; privacy: { readReceipts: boolean; messageRequests: "everyone" | "requests"; storyAudience: "everyone" | "contacts" | "close_friends" };
};
export type MediaRef = { id: string; mime: string; name?: string; size?: number; duration?: number };
export type Conversation = {
  id: string; type: "direct" | "group" | "broadcast"; name: string; avatar?: string; description?: string; otherUserId?: string;
  members: User[]; lastMessage: { text: string; type: string; sender: string; at: string } | null; unread: number;
  muted: boolean; archived: boolean; pinned: boolean; favorite: boolean; request: boolean; myRole: string;
  disappearingSeconds: number; onlyAdminsCanPost: boolean; pinnedMessage: string | null;
};
export type Message = {
  id: string; clientId: string; conversation: string; sender: string; type: string; text: string; media?: MediaRef | null;
  replyTo?: { id: string; text: string; sender: string; type: string; deletedAt?: string } | null; reactions: { user: string; emoji: string }[];
  forwarded?: boolean; forwardCount?: number; editedAt?: string; deletedAt?: string; createdAt: string; updatedAt?: string;
  status?: "pending" | "failed" | "sent" | "delivered" | "read"; viewOnce?: boolean; expiresAt?: string;
  campaign?: { title?: string; link?: string; price?: string; deliveryId?: string };
};
export type Story = {
  id: string; user: string; type: "text" | "image" | "video"; text: string; bg?: string; media?: MediaRef; externalUrl?: string;
  location?: string; audience: string; viewed: boolean; viewCount: number; createdAt: string; expiresAt: string; myReaction?: string | null;
};
export type StoryGroup = { user: User; isMine: boolean; stories: Story[]; hasUnseen: boolean };
export type Community = {
  id: string; name: string; description: string; category: string; cover?: string; icon?: string; isPrivate: boolean; featured: boolean;
  memberCount: number; myRole: string | null; myStatus: string | null; language: string;
};
