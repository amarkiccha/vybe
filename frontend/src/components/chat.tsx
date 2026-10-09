import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, mediaUrl, type Conversation, type Message } from "@/src/api";
import { formatTime } from "@/src/i18n";
import { Avatar, Icon, IconButton, Sheet, SheetRow, useToast, errorText } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export const REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];

function VoicePlayer({ id, mine }: { id: string; mine: boolean }) {
  const { colors } = useTheme();
  const player = useAudioPlayer(mediaUrl(id) ?? null);
  const st = useAudioPlayerStatus(player);
  const fg = mine ? colors.onBubbleMine : colors.onBubbleOther;
  const pct = st.duration ? st.currentTime / st.duration : 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 180 }}>
      <IconButton testID={`voice-play-${id}`} name={st.playing ? "pause" : "play"} color={fg} onPress={() => { if (st.playing) player.pause(); else { if (st.didJustFinish || pct >= 0.99) player.seekTo(0); player.play(); } }} />
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: mine ? "rgba(245,240,232,0.3)" : colors.border }}>
        <View style={{ width: `${pct * 100}%`, height: 4, borderRadius: 2, backgroundColor: fg }} />
      </View>
      <Text style={{ color: fg, fontSize: 12 }}>{Math.round(st.duration || 0)}s</Text>
    </View>
  );
}

function StatusTick({ status }: { status?: Message["status"] }) {
  const { colors } = useTheme();
  if (!status) return null;
  const map = { pending: "time-outline", failed: "alert-circle", sent: "checkmark", delivered: "checkmark-done", read: "checkmark-done" } as const;
  return <Icon name={map[status]} size={14} color={status === "read" ? "#7FD3FF" : status === "failed" ? colors.error : colors.onBubbleMine} />;
}

export function Bubble({ m, mine, conv, senderName, onLongPress, onRetry, onOpenSnap, onUnsubscribe }: {
  m: Message; mine: boolean; conv: Conversation; senderName?: string; onLongPress: () => void; onRetry: () => void; onOpenSnap: () => void; onUnsubscribe: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useStyles();
  const fg = mine ? colors.onBubbleMine : colors.onBubbleOther;
  if (m.type === "system") {
    const txt = m.text.startsWith("group_created:") ? `${t("chats.newGroup")}: ${m.text.split(":").slice(1).join(":")}` : m.text;
    return <Text style={s.system}>{txt}</Text>;
  }
  const deleted = !!m.deletedAt;
  const isSnap = m.type === "snap" || (m.viewOnce && !mine);
  return (
    <Pressable testID={`message-${m.clientId}`} onLongPress={deleted ? undefined : onLongPress} delayLongPress={300} onPress={m.status === "failed" ? onRetry : undefined}
      style={[s.wrap, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
      <View style={[s.bubble, { backgroundColor: mine ? colors.bubbleMine : colors.bubbleOther }, mine ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border }]}>
        {conv.type === "group" && !mine && <Text style={s.sender}>{senderName}</Text>}
        {m.forwarded && <Text style={[s.meta, { color: fg, fontStyle: "italic" }]}>↪ {(m.forwardCount ?? 0) >= 5 ? t("chats.forwardedMany") : t("chats.forwarded")}</Text>}
        {m.replyTo && <View style={[s.reply, { borderLeftColor: mine ? colors.onBubbleMine : colors.brandPrimary }]}><Text style={[s.replyText, { color: fg }]} numberOfLines={2}>{m.replyTo.deletedAt ? t("chats.deleted") : m.replyTo.text || t(`chats.${m.replyTo.type === "audio" ? "voice" : m.replyTo.type === "image" ? "photo" : m.replyTo.type}`)}</Text></View>}
        {deleted ? <Text style={[s.text, { color: fg, fontStyle: "italic", opacity: 0.7 }]}>{isSnap ? t("chats.opened") : t("chats.deleted")}</Text> : <>
          {isSnap && m.media ? (
            <Pressable testID={`snap-open-${m.clientId}`} onPress={onOpenSnap} style={s.snap}><Icon name="flash" color={fg} /><Text style={{ color: fg, fontWeight: "700" }}>{mine ? t("chats.snap") : t("chats.tapToView")}</Text></Pressable>
          ) : m.media && (m.type === "image" || (m.type === "campaign" && m.media.mime?.startsWith("image"))) ? (
            <Image source={{ uri: mediaUrl(m.media.id) }} style={s.image} contentFit="cover" transition={150} />
          ) : m.media && m.type === "video" ? (
            <Pressable onPress={() => Linking.openURL(mediaUrl(m.media!.id)!)} style={[s.image, { alignItems: "center", justifyContent: "center", backgroundColor: colors.dark }]}><Icon name="play-circle" size={48} color={colors.onDark} /></Pressable>
          ) : m.media && m.type === "audio" ? <VoicePlayer id={m.media.id} mine={mine} />
            : m.media && m.type === "file" ? (
            <Pressable testID={`file-open-${m.clientId}`} onPress={() => Linking.openURL(mediaUrl(m.media!.id)!)} style={s.file}><Icon name="document-attach" color={fg} /><Text style={{ color: fg, flex: 1 }} numberOfLines={1}>{m.media.name}</Text></Pressable>
          ) : null}
          {!!m.text && m.type !== "snap" && <Text style={[s.text, { color: fg }]} selectable>{m.text}</Text>}
          {m.type === "campaign" && (
            <View style={{ gap: 6, marginTop: 6 }}>
              {m.campaign?.price && <Text style={[s.text, { color: fg, fontWeight: "800" }]}>{m.campaign.title} · {m.campaign.price}</Text>}
              {m.campaign?.link && <Text onPress={() => Linking.openURL(m.campaign!.link!)} style={{ color: fg, textDecorationLine: "underline" }}>{m.campaign.link}</Text>}
              {!mine && <Text testID={`campaign-unsubscribe-${m.id}`} onPress={onUnsubscribe} style={{ color: fg, opacity: 0.75, fontSize: 12, textDecorationLine: "underline" }}>{t("chats.unsubscribe")}</Text>}
            </View>
          )}
        </>}
        <View style={s.footer}>
          {m.editedAt && !deleted && <Text style={[s.meta, { color: fg }]}>{t("chats.edited")}</Text>}
          {m.expiresAt && <Icon name="timer-outline" size={12} color={fg} />}
          <Text style={[s.meta, { color: fg }]}>{formatTime(m.createdAt)}</Text>
          {mine && <StatusTick status={m.status} />}
        </View>
      </View>
      {m.status === "failed" && <Text style={s.failed}>{t("chats.failed")}</Text>}
      {!!m.reactions?.length && (
        <View style={[s.reactions, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
          <Text style={{ fontSize: 13 }}>{[...new Set(m.reactions.map((r) => r.emoji))].join("")} {m.reactions.length > 1 ? m.reactions.length : ""}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function SnapViewer({ m, onClose }: { m: Message | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  useEffect(() => { if (m) api(`/messages/${m.id}/view`, { method: "POST" }).catch(() => {}); }, [m]);
  return (
    <Modal visible={!!m} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.dark }}>
        {m?.media && <Image source={{ uri: mediaUrl(m.media.id) }} style={{ flex: 1 }} contentFit="contain" />}
        <View style={{ position: "absolute", top: insets.top + 8, right: 16 }}><IconButton testID="snap-close" name="close" color={colors.onDark} onPress={onClose} /></View>
      </View>
    </Modal>
  );
}

export function ActionsSheet({ m, mine, canAdmin, onClose, onReply, onEdit, onForward, onPin, onReport }: {
  m: Message | null; mine: boolean; canAdmin: boolean; onClose: () => void; onReply: () => void; onEdit: () => void; onForward: () => void; onPin: () => void; onReport: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { colors } = useTheme();
  if (!m) return null;
  const act = async (fn: () => Promise<any>) => { try { await fn(); } catch (e) { toast(errorText(e, t), "error"); } onClose(); };
  return (
    <Sheet visible={!!m} onClose={onClose} testID="message-actions-sheet">
      <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.md }}>
        {REACTIONS.map((e) => (
          <Pressable key={e} testID={`react-${e}`} onPress={() => act(() => api(`/messages/${m.id}/react`, { body: { emoji: m.reactions.some((r) => r.emoji === e) ? null : e } }))}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </Pressable>
        ))}
      </View>
      <SheetRow testID="action-reply" icon="arrow-undo-outline" label={t("chats.reply")} onPress={() => { onReply(); onClose(); }} />
      {mine && m.type === "text" && <SheetRow testID="action-edit" icon="create-outline" label={t("chats.edit")} onPress={() => { onEdit(); onClose(); }} />}
      {m.type !== "snap" && !m.viewOnce && <SheetRow testID="action-forward" icon="arrow-redo-outline" label={t("chats.forward")} onPress={() => { onForward(); onClose(); }} />}
      <SheetRow testID="action-pin" icon="pin-outline" label={t("chats.pin")} onPress={() => { onPin(); onClose(); }} />
      {!mine && <SheetRow testID="action-report" icon="flag-outline" label={t("common.report")} onPress={() => { onReport(); onClose(); }} />}
      {(mine || canAdmin) && <SheetRow testID="action-delete" danger icon="trash-outline" label={t("common.delete")} onPress={() => act(() => api(`/messages/${m.id}`, { method: "DELETE" }))} />}
    </Sheet>
  );
}

export function ForwardSheet({ m, onClose }: { m: Message | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { colors } = useTheme();
  const [list, setList] = useState<Conversation[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => { if (m) { setSel([]); api<{ conversations: Conversation[] }>("/conversations?filter=all").then((r) => setList(r.conversations.filter((c) => c.type !== "broadcast"))).catch(() => {}); } }, [m]);
  const send = async () => {
    try { await api(`/messages/${m!.id}/forward`, { body: { conversationIds: sel } }); toast(t("chats.forwarded"), "success"); onClose(); }
    catch (e) { toast(errorText(e, t), "error"); }
  };
  return (
    <Sheet visible={!!m} onClose={onClose} title={t("chats.forwardTo")} testID="forward-sheet">
      <ScrollView style={{ maxHeight: 380 }}>
        {list.map((c) => {
          const on = sel.includes(c.id);
          return (
            <SheetRow key={c.id} testID={`forward-target-${c.id}`} icon={on ? "checkmark-circle" : "ellipse-outline"} label={c.name}
              onPress={() => setSel(on ? sel.filter((x) => x !== c.id) : sel.length < 5 ? [...sel, c.id] : sel)} right={<Avatar uri={c.avatar} name={c.name} size={32} />} />
          );
        })}
      </ScrollView>
      <View style={{ padding: spacing.lg }}>
        <Pressable testID="forward-send-button" disabled={!sel.length} onPress={send} style={{ minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.brandPrimary, opacity: sel.length ? 1 : 0.5, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.onBrandPrimary, fontWeight: "700" }}>{t("common.send")} ({sel.length})</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { maxWidth: "82%", marginVertical: 3, marginHorizontal: spacing.md },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  sender: { fontSize: 12, fontWeight: "700", color: c.brandPrimary },
  text: { fontSize: 16, lineHeight: 23 },
  meta: { fontSize: 11, opacity: 0.75 },
  footer: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end" },
  reply: { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 2, opacity: 0.85 },
  replyText: { fontSize: 13, lineHeight: 19 },
  image: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  file: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 180, paddingVertical: 4 },
  snap: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, minWidth: 140 },
  failed: { color: c.error, fontSize: 12, alignSelf: "flex-end", marginTop: 2 },
  reactions: { backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: -6, borderWidth: 1, borderColor: c.border },
  system: { alignSelf: "center", color: c.muted, fontSize: 12, backgroundColor: c.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, marginVertical: 8 },
}));
