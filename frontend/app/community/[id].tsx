import { useEffect, useRef, useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, imageSrc, mediaUrl, uploadFile, type Community } from "@/src/api";
import { formatTime } from "@/src/i18n";
import { Avatar, Button, Chip, ChipRow, Field, Icon, IconButton, Sheet, SheetRow, StateView, useToast, errorText } from "@/src/components/ui";
import { REACTIONS } from "@/src/components/chat";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type CMsg = { id: string; text: string; sender: { id: string; name: string; avatar?: string }; createdAt: string; pinned: boolean; media?: { id: string; name: string; mime: string };
  poll: { question: string; options: { index: number; text: string; votes: number; mine: boolean }[] } | null; reactions: { user: string; emoji: string }[] };
const STAFF = ["owner", "admin", "moderator"];

export default function CommunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["community", id], queryFn: () => api<{ community: Community; channels: { id: string; name: string; kind: string }[]; canRead: boolean }>(`/communities/${id}`) });
  const [channel, setChannel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<CMsg[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [sheet, setSheet] = useState<null | "poll" | "members" | "report">(null);
  const [action, setAction] = useState<CMsg | null>(null);
  const [poll, setPoll] = useState({ question: "", options: ["", ""] });
  const [reason, setReason] = useState("");
  const listRef = useRef<FlatList<CMsg>>(null);
  const c = q.data?.community;
  const ch = q.data?.channels.find((x) => x.id === channel);
  const member = c?.myStatus === "active";
  const staff = !!c?.myRole && STAFF.includes(c.myRole);
  const members = useQuery({ queryKey: ["cmembers", id, staff], queryFn: async () => {
    const a = await api<{ members: any[] }>(`/communities/${id}/members`);
    const p = staff ? await api<{ members: any[] }>(`/communities/${id}/members?status=pending`) : { members: [] };
    return [...p.members, ...a.members];
  }, enabled: sheet === "members" });

  useEffect(() => { if (q.data?.channels.length && !channel) setChannel(q.data.channels.find((x) => x.kind === "discussion")?.id ?? q.data.channels[0].id); }, [q.data]);
  const load = async () => {
    if (!channel) return;
    try {
      const r = await api<{ messages: CMsg[] }>(`/communities/channels/${channel}/messages?q=${encodeURIComponent(search)}${pinnedOnly ? "&pinned=1" : ""}`);
      setMsgs(r.messages);
    } catch {}
  };
  useEffect(() => { load(); const iv = setInterval(load, 4000); return () => clearInterval(iv); }, [channel, search, pinnedOnly]);

  const run = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) toast(ok, "success"); load(); q.refetch(); } catch (e) { toast(errorText(e, t), "error"); } };
  const send = () => { const body = text.trim(); if (!body) return; setText(""); run(() => api(`/communities/channels/${channel}/messages`, { body: { text: body } })); };
  const attachFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    run(async () => { const m = await uploadFile(a.uri, a.name, a.mimeType ?? "application/octet-stream"); await api(`/communities/channels/${channel}/messages`, { body: { text: a.name, mediaId: m.id } }); });
  };
  const createPoll = () => run(async () => { await api(`/communities/channels/${channel}/messages`, { body: { poll: { question: poll.question, options: poll.options.filter((o) => o.trim()) } } }); setSheet(null); setPoll({ question: "", options: ["", ""] }); });
  const join = () => run(async () => { await api(`/communities/${id}/join`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["communities"] }); });
  const leave = () => run(async () => { await api(`/communities/${id}/leave`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["communities"] }); router.back(); });

  if (!c || !q.data) return <View style={s.root}><StateView testID="community" loading={q.isLoading} error={q.error} onRetry={q.refetch} /></View>;
  const canPost = member && (ch?.kind !== "announcement" || staff);

  return (
    <KeyboardAvoidingView behavior="padding" style={s.root} testID="community-screen">
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconButton testID="community-back" name="chevron-back" color={colors.onDark} onPress={() => router.back()} />
          <View style={s.icon}>{c.icon || c.cover ? <Image source={{ uri: imageSrc(c.icon ?? c.cover) }} style={{ width: 44, height: 44 }} /> : <Icon name="people" color={colors.onDark} />}</View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.name} numberOfLines={1}>{c.name}</Text>
            <Text style={s.meta}>{c.isPrivate ? `🔒 ${t("communities.private")}` : t("communities.public")} · {t("common.members", { count: c.memberCount })}</Text>
          </View>
          <IconButton testID="community-members-button" name="people-outline" color={colors.onDark} onPress={() => setSheet("members")} />
          {member && c.myRole !== "owner" && <IconButton testID="community-leave-button" name="exit-outline" color={colors.onDark} onPress={leave} label={t("common.leave")} />}
          <IconButton testID="community-report-button" name="flag-outline" color={colors.onDark} onPress={() => { setAction(null); setSheet("report"); }} />
        </View>
        {q.data.canRead && (
          <ChipRow testID="community-channel-row">
            {q.data.channels.map((x) => <Chip dark key={x.id} testID={`channel-${x.name}`} label={`# ${t(`communities.${x.kind}`)}${x.kind === "discussion" && x.name !== "general" ? ` · ${x.name}` : ""}`} active={x.id === channel} onPress={() => setChannel(x.id)} />)}
            <Chip dark testID="channel-pinned-filter" label={`📌 ${t("communities.pinnedOnly")}`} active={pinnedOnly} onPress={() => setPinnedOnly(!pinnedOnly)} />
          </ChipRow>
        )}
      </View>
      {!q.data.canRead ? (
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <Text style={s.desc}>{c.description}</Text>
          <Text style={{ color: colors.muted, lineHeight: 21 }}>{t("communities.privateLocked")}</Text>
          {c.myStatus === "pending" ? <Button testID="community-requested" title={t("common.requested")} disabled onPress={() => {}} /> : <Button testID="community-join-button" title={t("common.join")} onPress={join} />}
        </View>
      ) : (
        <>
          <View style={s.search}><Icon name="search" size={16} color={colors.muted} />
            <TextInput testID="community-search-input" value={search} onChangeText={setSearch} placeholder={t("common.search")} placeholderTextColor={colors.muted} style={{ flex: 1, color: colors.onSurface, paddingVertical: 8 }} />
          </View>
          <FlatList ref={listRef} testID="community-messages" data={msgs} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={<Text style={s.desc}>{c.description}</Text>}
            ListEmptyComponent={<StateView testID="community-msgs" empty emptyIcon="chatbubbles-outline" emptyTitle={t("chats.empty")} />}
            renderItem={({ item }) => (
              <Pressable testID={`cmsg-${item.id}`} onLongPress={() => setAction(item)} style={s.msg}>
                <Avatar uri={item.sender?.avatar} name={item.sender?.name} size={36} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <Text style={s.sender}>{item.sender?.name}</Text>
                    <Text style={s.meta2}>{formatTime(item.createdAt)}</Text>
                    {item.pinned && <Icon name="pin" size={13} color={colors.brandPrimary} />}
                  </View>
                  {!!item.text && <Text style={s.text} selectable>{item.text}</Text>}
                  {item.media && <Pressable testID={`cmsg-file-${item.id}`} onPress={() => Linking.openURL(mediaUrl(item.media!.id)!)} style={s.file}><Icon name="document-attach-outline" color={colors.brandPrimary} /><Text style={{ color: colors.brandPrimary, flex: 1 }} numberOfLines={1}>{item.media.name}</Text></Pressable>}
                  {item.poll && (
                    <View style={s.poll}>
                      <Text style={[s.text, { fontWeight: "800" }]}>📊 {item.poll.question}</Text>
                      {item.poll.options.map((o) => {
                        const total = item.poll!.options.reduce((n, x) => n + x.votes, 0) || 1;
                        return (
                          <Pressable key={o.index} testID={`poll-option-${item.id}-${o.index}`} onPress={() => run(() => api(`/communities/messages/${item.id}/vote`, { body: { option: o.index } }))} style={[s.option, o.mine && { borderColor: colors.brandPrimary }]}>
                            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(o.votes / total) * 100}%`, backgroundColor: colors.brandTertiary, borderRadius: radius.sm }} />
                            <Text style={{ flex: 1, color: colors.onSurface }}>{o.text}</Text>
                            <Text style={{ color: colors.muted, fontSize: 12 }}>{t("communities.votes", { count: o.votes })}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {!!item.reactions.length && <Text style={{ fontSize: 13 }}>{[...new Set(item.reactions.map((r) => r.emoji))].join("")} {item.reactions.length}</Text>}
                </View>
              </Pressable>
            )}
          />
          {canPost ? (
            <View style={[s.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
              <IconButton testID="community-poll-button" name="stats-chart-outline" color={colors.brandPrimary} onPress={() => setSheet("poll")} label={t("communities.poll")} />
              <IconButton testID="community-attach-button" name="attach-outline" color={colors.brandPrimary} onPress={attachFile} label={t("communities.attachFile")} />
              <TextInput testID="community-message-input" value={text} onChangeText={setText} placeholder={t("chats.messagePlaceholder")} placeholderTextColor={colors.muted} multiline style={s.input} />
              <IconButton testID="community-send-button" name="send" color={colors.onBrandPrimary} bg={colors.brandPrimary} size={20} onPress={send} />
            </View>
          ) : (
            <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.md, gap: spacing.sm }}>
              <Text style={{ color: colors.muted, textAlign: "center" }}>{member ? t("communities.staffOnly") : t("communities.joinToPost")}</Text>
              {!member && <Button testID="community-join-button" title={t("common.join")} onPress={join} />}
            </View>
          )}
        </>
      )}
      <Sheet visible={!!action} onClose={() => setAction(null)} testID="cmsg-actions">
        <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: spacing.md }}>
          {REACTIONS.map((e) => <Pressable key={e} testID={`creact-${e}`} onPress={() => { const m = action!; setAction(null); run(() => api(`/communities/messages/${m.id}/react`, { body: { emoji: e } })); }}><Text style={{ fontSize: 26 }}>{e}</Text></Pressable>)}
        </View>
        {staff && <SheetRow testID="cmsg-pin" icon="pin-outline" label={action?.pinned ? t("chats.unpin") : t("chats.pin")} onPress={() => { const m = action!; setAction(null); run(() => api(`/communities/messages/${m.id}/pin`, { method: "POST" })); }} />}
        <SheetRow testID="cmsg-report" icon="flag-outline" label={t("common.report")} onPress={() => setSheet("report")} />
        {staff && <SheetRow testID="cmsg-delete" danger icon="trash-outline" label={t("common.delete")} onPress={() => { const m = action!; setAction(null); run(() => api(`/communities/messages/${m.id}`, { method: "DELETE" })); }} />}
      </Sheet>
      <Sheet visible={sheet === "poll"} onClose={() => setSheet(null)} title={t("communities.poll")} testID="poll-sheet">
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Field testID="poll-question-input" label={t("communities.question")} value={poll.question} onChangeText={(v) => setPoll({ ...poll, question: v })} />
          {poll.options.map((o, i) => <Field key={i} testID={`poll-option-input-${i}`} placeholder={t("communities.option", { n: i + 1 })} value={o} onChangeText={(v) => setPoll({ ...poll, options: poll.options.map((x, j) => (j === i ? v : x)) })} />)}
          {poll.options.length < 6 && <Button testID="poll-add-option" title={t("communities.addOption")} variant="ghost" onPress={() => setPoll({ ...poll, options: [...poll.options, ""] })} />}
          <Button testID="poll-create-button" title={t("common.create")} onPress={createPoll} disabled={!poll.question.trim() || poll.options.filter((o) => o.trim()).length < 2} />
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === "members"} onClose={() => setSheet(null)} title={t("chatInfo.members")} testID="cmembers-sheet">
        <ScrollView style={{ maxHeight: 460 }}>
          {members.data?.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8 }}>
              <Avatar uri={m.avatar} name={m.name} size={36} />
              <View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "700" }}>{m.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{m.status === "pending" ? t("communities.pending") : m.role}</Text></View>
              {staff && m.role !== "owner" && (m.status === "pending"
                ? <Chip testID={`cmember-approve-${m.id}`} label={t("communities.approve")} active onPress={() => run(async () => { await api(`/communities/${id}/members/${m.id}/approve`, { method: "POST" }); members.refetch(); })} />
                : <>
                    {c.myRole === "owner" && <IconButton testID={`cmember-promote-${m.id}`} name="shield-outline" onPress={() => run(async () => { await api(`/communities/${id}/members/${m.id}/${m.role === "member" ? "moderator" : "member"}`, { method: "POST" }); members.refetch(); })} label={t("communities.makeModerator")} />}
                    <IconButton testID={`cmember-remove-${m.id}`} name="person-remove-outline" onPress={() => run(async () => { await api(`/communities/${id}/members/${m.id}/remove`, { method: "POST" }); members.refetch(); })} label={t("chatInfo.remove")} />
                    <IconButton testID={`cmember-ban-${m.id}`} name="ban-outline" color={colors.error} onPress={() => run(async () => { await api(`/communities/${id}/members/${m.id}/ban`, { method: "POST" }); members.refetch(); })} label={t("communities.ban")} />
                  </>)}
            </View>
          ))}
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === "report"} onClose={() => setSheet(null)} title={t("common.report")} testID="community-report-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Field testID="community-report-reason" placeholder={t("common.reportReason")} value={reason} onChangeText={setReason} />
          <Button testID="community-report-submit" title={t("common.report")} variant="danger" onPress={() => run(async () => {
            await api("/reports", { body: action ? { targetType: "community_message", targetId: action.id, reason: reason || "abuse" } : { targetType: "community", targetId: id, reason: reason || "abuse" } });
            setSheet(null); setAction(null); setReason("");
          }, t("common.reported"))} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { backgroundColor: c.dark, paddingBottom: 0 },
  icon: { width: 44, height: 44, borderRadius: radius.md, overflow: "hidden", backgroundColor: c.darkCard, alignItems: "center", justifyContent: "center" },
  name: { color: c.onDark, fontSize: 18, fontWeight: "800", lineHeight: 26 },
  meta: { color: c.darkMuted, fontSize: 12 },
  desc: { color: c.muted, fontSize: 14, lineHeight: 21 },
  search: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  msg: { flexDirection: "row", gap: 10, backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  sender: { fontWeight: "700", color: c.onSurface },
  meta2: { color: c.muted, fontSize: 11 },
  text: { color: c.onSurface, fontSize: 15, lineHeight: 22 },
  file: { flexDirection: "row", gap: 8, alignItems: "center", padding: 10, borderRadius: radius.sm, backgroundColor: c.brandTertiary },
  poll: { gap: 6, marginTop: 4 },
  option: { flexDirection: "row", alignItems: "center", minHeight: 40, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 4, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderRadius: radius.lg, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: c.onSurface, borderWidth: 1, borderColor: c.border },
}));
