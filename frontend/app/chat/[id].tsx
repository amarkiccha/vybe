import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { api, newClientId, uploadFile, type Conversation, type Message } from "@/src/api";
import { useAuth } from "@/src/auth";
import { storage } from "@/src/utils/storage";
import { Avatar, Button, Field, Icon, IconButton, Sheet, SheetRow, useToast, errorText } from "@/src/components/ui";
import { ActionsSheet, Bubble, ForwardSheet, SnapViewer } from "@/src/components/chat";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Pending = Message & { local?: { uri: string; name: string; mime: string } };

export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const conv = useQuery({ queryKey: ["conversation", id], queryFn: () => api<{ conversation: Conversation }>(`/conversations/${id}`).then((r) => r.conversation), refetchInterval: 15000 });
  const [msgs, setMsgs] = useState<Map<string, Pending>>(new Map());
  const [typing, setTyping] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [action, setAction] = useState<Message | null>(null);
  const [forward, setForward] = useState<Message | null>(null);
  const [snap, setSnap] = useState<Message | null>(null);
  const [attach, setAttach] = useState(false);
  const [report, setReport] = useState<{ type: string; id: string } | null>(null);
  const [reason, setReason] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initial, setInitial] = useState(true);
  const since = useRef<string | null>(null);
  const lastTyping = useRef(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const c = conv.data;

  const merge = useCallback((list: Message[]) => {
    setMsgs((prev) => {
      const next = new Map(prev);
      for (const m of list) next.set(m.clientId, { ...next.get(m.clientId), ...m, local: undefined });
      return next;
    });
  }, []);

  // Initial page + draft restore
  useEffect(() => {
    api<{ messages: Message[]; serverTime: string }>(`/conversations/${id}/messages?limit=30`).then((r) => {
      merge(r.messages); since.current = r.serverTime; setHasMore(r.messages.length >= 30); setInitial(false);
    }).catch((e) => { setInitial(false); toast(errorText(e, t), "error"); });
    storage.getItem(`draft:${id}`, "").then((d) => d && setText(String(d)));
    api(`/conversations/${id}/read`, { method: "POST" }).catch(() => {});
  }, [id]);

  // Polling for real-time updates (new, edited, reactions, receipts) + typing.
  useEffect(() => {
    const iv = setInterval(async () => {
      if (!since.current) return;
      try {
        const r = await api<{ messages: Message[]; typing: string[]; serverTime: string }>(`/conversations/${id}/messages?since=${encodeURIComponent(since.current)}`);
        setTyping(r.typing);
        if (r.messages.length) {
          merge(r.messages);
          if (r.messages.some((m) => m.sender !== user?.id)) api(`/conversations/${id}/read`, { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["conversations"] })).catch(() => {});
        }
        since.current = r.serverTime;
      } catch {}
    }, 2500);
    return () => clearInterval(iv);
  }, [id, user?.id]);

  useEffect(() => { const h = setTimeout(() => storage.setItem(`draft:${id}`, text), 400); return () => clearTimeout(h); }, [text, id]);

  const list = useMemo(() => [...msgs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [msgs]);
  const membersById = useMemo(() => new Map((c?.members ?? []).map((m) => [m.id, m])), [c]);

  const loadOlder = async () => {
    if (loadingOlder || !hasMore || !list.length) return;
    setLoadingOlder(true);
    try {
      const oldest = list[list.length - 1].createdAt;
      const r = await api<{ messages: Message[] }>(`/conversations/${id}/messages?before=${encodeURIComponent(oldest)}&limit=30`);
      merge(r.messages); setHasMore(r.messages.length >= 30);
    } catch {} finally { setLoadingOlder(false); }
  };

  const deliver = async (p: Pending, extra: Record<string, unknown> = {}) => {
    setMsgs((prev) => new Map(prev).set(p.clientId, { ...p, status: "pending" }));
    try {
      let mediaId: string | undefined;
      if (p.local) mediaId = (await uploadFile(p.local.uri, p.local.name, p.local.mime)).id;
      const r = await api<{ message: Message }>(`/conversations/${id}/messages`, { body: { clientId: p.clientId, type: p.type, text: p.text, replyTo: p.replyTo?.id, mediaId, ...extra } });
      merge([r.message]);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      setMsgs((prev) => new Map(prev).set(p.clientId, { ...p, status: "failed" }));
      toast(errorText(e, t), "error");
    }
  };

  const queue = (type: string, body: string, local?: Pending["local"], extra: Record<string, unknown> = {}) => {
    const p: Pending = { id: "", clientId: newClientId(), conversation: id!, sender: user!.id, type, text: body, reactions: [], createdAt: new Date().toISOString(), replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, sender: replyTo.sender, type: replyTo.type } : null, local, status: "pending" };
    setReplyTo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    deliver(p, extra);
  };

  const onSend = async () => {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      try { await api(`/messages/${editing.id}`, { method: "PATCH", body: { text: body } }); setEditing(null); setText(""); } catch (e) { toast(errorText(e, t), "error"); }
      return;
    }
    setText("");
    queue("text", body);
  };

  const onChange = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); api(`/conversations/${id}/typing`, { method: "POST" }).catch(() => {}); }
  };

  const pickMedia = async (fromCamera: boolean) => {
    setAttach(false);
    if (fromCamera) return router.push(`/camera?conversationId=${id}`);
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!req.granted) return toast(t("camera.permissionBody"), "error");
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8, videoMaxDuration: 60 });
    if (r.canceled) return;
    const a = r.assets[0];
    const isVideo = a.type === "video";
    queue(isVideo ? "video" : "image", "", { uri: a.uri, name: a.fileName ?? (isVideo ? "video.mp4" : "photo.jpg"), mime: a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg") });
  };
  const pickDoc = async () => {
    setAttach(false);
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    if ((a.size ?? 0) > 25 * 1024 * 1024) return toast(t("errors.file_too_large"), "error");
    queue("file", "", { uri: a.uri, name: a.name, mime: a.mimeType ?? "application/octet-stream" });
  };

  const toggleRecord = async () => {
    if (recording) {
      await recorder.stop();
      setRecording(false);
      const uri = recorder.uri;
      if (uri) queue("audio", "", { uri, name: Platform.OS === "web" ? "voice.webm" : "voice.m4a", mime: Platform.OS === "web" ? "audio/webm" : "audio/m4a" });
      return;
    }
    const perm = await AudioModule.getRecordingPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) return toast(t("camera.micBody"), "error");
      const req = await AudioModule.requestRecordingPermissionsAsync();
      if (!req.granted) return toast(t("camera.micBody"), "error");
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  const submitReport = async () => {
    try { await api("/reports", { body: { targetType: report!.type, targetId: report!.id, reason: reason || "inappropriate" } }); toast(t("common.reported"), "success"); }
    catch (e) { toast(errorText(e, t), "error"); }
    setReport(null); setReason("");
  };
  const acceptRequest = async () => { await api(`/conversations/${id}`, { method: "PATCH", body: { acceptRequest: true } }).catch(() => {}); conv.refetch(); };
  const blockOther = async () => { if (c?.otherUserId) { await api(`/users/${c.otherUserId}/block`, { method: "POST" }).catch(() => {}); toast(t("common.block"), "success"); router.back(); } };
  const pinned = c?.pinnedMessage ? list.find((m) => m.id === c.pinnedMessage) : null;
  const canAdmin = c?.type === "group" && ["owner", "admin"].includes(c.myRole);
  const readOnly = (c?.onlyAdminsCanPost && !canAdmin) || (c?.type === "broadcast" && c.myRole !== "owner");
  const subtitle = typing.length ? t("chats.typing", { name: typing[0] }) : c?.type === "group" ? c.members.map((m) => m.name.split(" ")[0]).join(", ") : "";

  return (
    <View style={s.root} testID="chat-room-screen">
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <IconButton testID="chat-back-button" name="chevron-back" color={colors.onBrand} onPress={() => router.back()} label={t("common.back")} />
        <Pressable testID="chat-header-info" style={s.headerMid} onPress={() => router.push(`/chat-info/${id}`)}>
          <Avatar uri={c?.avatar} name={c?.name} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={s.headerName} numberOfLines={1}>{c?.name ?? ""}</Text>
            {!!subtitle && <Text style={s.headerSub} numberOfLines={1} testID="chat-typing-indicator">{subtitle}</Text>}
          </View>
        </Pressable>
        <IconButton testID="chat-call-button" name="call-outline" color={colors.onBrand} onPress={() => toast(t("chats.callsPending"))} label="call" />
      </View>
      {pinned && (
        <Pressable testID="chat-pinned-banner" style={s.pinned} onPress={() => api(`/conversations/${id}/pin`, { body: { messageId: null } }).then(() => conv.refetch()).catch(() => {})}>
          <Icon name="pin" size={16} color={colors.brandPrimary} />
          <Text style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>{t("chats.pinned")}: {pinned.text || t("chats.photo")}</Text>
          <Icon name="close" size={16} color={colors.muted} />
        </Pressable>
      )}
      {c?.request && (
        <View style={s.request} testID="chat-request-banner">
          <Text style={{ color: colors.onSurface, lineHeight: 21 }}>{t("chats.requestBanner")}</Text>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button testID="chat-request-accept" title={t("chats.accept")} onPress={acceptRequest} style={{ flex: 1, minHeight: 44 }} />
            <Button testID="chat-request-block" title={t("common.block")} variant="danger" onPress={blockOther} style={{ flex: 1, minHeight: 44 }} />
          </View>
        </View>
      )}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {initial || !c ? <ActivityIndicator style={{ flex: 1 }} color={colors.brandPrimary} /> : (
          <FlatList
            testID="chat-messages-list"
            inverted
            data={list}
            keyExtractor={(m) => m.clientId}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlder ? <Text style={s.older}>{t("chats.loadOlder")}</Text> : <Text style={s.older}>{t("chats.e2eeNotice")}</Text>}
            contentContainerStyle={{ paddingVertical: spacing.sm }}
            renderItem={({ item }) => (
              <Bubble m={item} mine={item.sender === user?.id} conv={c!} senderName={membersById.get(item.sender)?.name}
                onLongPress={() => setAction(item)} onRetry={() => deliver(item)} onOpenSnap={() => item.sender !== user?.id && setSnap(item)}
                onUnsubscribe={() => api("/broadcast/unsubscribe", { body: { messageId: item.id } }).then(() => toast(t("chats.unsubscribed"), "success")).catch((e) => toast(errorText(e, t), "error"))} />
            )}
          />
        )}
        {(replyTo || editing) && (
          <View style={s.replyBar} testID="chat-reply-bar">
            <Icon name={editing ? "create-outline" : "arrow-undo-outline"} size={18} color={colors.brandPrimary} />
            <Text style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>{(editing ?? replyTo)!.text || t("chats.photo")}</Text>
            <IconButton testID="chat-reply-cancel" name="close" size={18} onPress={() => { setReplyTo(null); if (editing) { setEditing(null); setText(""); } }} />
          </View>
        )}
        {readOnly ? <Text style={[s.older, { paddingBottom: insets.bottom + spacing.md }]}>{t("chats.readOnly")}</Text> : (
          <View style={[s.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <IconButton testID="chat-attach-button" name="add-circle-outline" color={colors.brandPrimary} size={28} onPress={() => setAttach(true)} label={t("chats.attach")} />
            <TextInput testID="chat-message-input" value={text} onChangeText={onChange} placeholder={recording ? t("chats.recording") : t("chats.messagePlaceholder")} placeholderTextColor={colors.muted} multiline style={s.input} editable={!recording} />
            {text.trim() ? <IconButton testID="chat-send-button" name="send" color={colors.onBrandPrimary} bg={colors.brandPrimary} size={20} onPress={onSend} label={t("common.send")} />
              : <IconButton testID="chat-voice-button" name={recording ? "stop" : "mic-outline"} color={recording ? colors.onError : colors.brandPrimary} bg={recording ? colors.error : undefined} onPress={toggleRecord} label={t("chats.voice")} />}
          </View>
        )}
      </KeyboardAvoidingView>

      <Sheet visible={attach} onClose={() => setAttach(false)} title={t("chats.attach")} testID="chat-attach-sheet">
        <SheetRow testID="attach-gallery" icon="images-outline" label={t("chats.gallery")} onPress={() => pickMedia(false)} />
        <SheetRow testID="attach-camera" icon="camera-outline" label={`${t("chats.camera")} / ${t("chats.snap")}`} onPress={() => pickMedia(true)} />
        <SheetRow testID="attach-document" icon="document-outline" label={t("chats.document")} onPress={pickDoc} />
      </Sheet>
      <ActionsSheet m={action} mine={action?.sender === user?.id} canAdmin={!!canAdmin} onClose={() => setAction(null)}
        onReply={() => setReplyTo(action)} onEdit={() => { setEditing(action); setText(action?.text ?? ""); }} onForward={() => setForward(action)}
        onPin={() => api(`/conversations/${id}/pin`, { body: { messageId: action!.id } }).then(() => conv.refetch()).catch((e) => toast(errorText(e, t), "error"))}
        onReport={() => setReport({ type: "message", id: action!.id })} />
      <ForwardSheet m={forward} onClose={() => setForward(null)} />
      <SnapViewer m={snap} onClose={() => setSnap(null)} />
      <Sheet visible={!!report} onClose={() => setReport(null)} title={t("common.report")} testID="report-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Field testID="report-reason-input" placeholder={t("common.reportReason")} value={reason} onChangeText={setReason} multiline />
          <Button testID="report-submit-button" title={t("common.report")} variant="danger" onPress={submitReport} />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: c.brandPrimary, paddingHorizontal: 4, paddingBottom: 8 },
  headerMid: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerName: { color: c.onBrand, fontSize: 17, fontWeight: "700", lineHeight: 24 },
  headerSub: { color: c.onBrand, opacity: 0.8, fontSize: 12 },
  pinned: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  request: { padding: spacing.lg, gap: spacing.md, backgroundColor: c.brandTertiary },
  older: { textAlign: "center", color: c.muted, fontSize: 12, padding: spacing.md, lineHeight: 18 },
  replyBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: spacing.lg, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.lg, backgroundColor: c.surface, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: c.onSurface, borderWidth: 1, borderColor: c.border },
}));
