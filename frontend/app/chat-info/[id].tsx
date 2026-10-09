import { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, type Conversation } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Avatar, Button, Chip, Field, IconButton, Sheet, SheetRow, StateView, useToast, errorText } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const DISAPPEAR = [0, 3600, 86400, 604800];

export default function ChatInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["conversation", id], queryFn: () => api<{ conversation: Conversation }>(`/conversations/${id}`).then((r) => r.conversation) });
  const [member, setMember] = useState<any>(null);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("");
  const c = q.data;
  if (!c) return <View style={s.root}><StateView testID="chat-info" loading={q.isLoading} error={q.error} onRetry={q.refetch} /></View>;
  const isAdmin = ["owner", "admin"].includes(c.myRole);
  const isGroup = c.type === "group";

  const patch = async (body: Record<string, unknown>) => {
    try { await api(`/conversations/${id}`, { method: "PATCH", body }); q.refetch(); qc.invalidateQueries({ queryKey: ["conversations"] }); } catch (e) { toast(errorText(e, t), "error"); }
  };
  const act = async (fn: () => Promise<any>, after?: () => void) => { try { await fn(); q.refetch(); after?.(); } catch (e) { toast(errorText(e, t), "error"); } setMember(null); };
  const label = (sec: number) => (sec === 0 ? t("common.off") : sec === 3600 ? t("chatInfo.hour1") : sec === 86400 ? t("chatInfo.hours24") : t("chatInfo.days7"));

  return (
    <View style={s.root} testID="chat-info-screen">
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <IconButton testID="chat-info-back" name="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>{t("chats.info")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <Avatar uri={c.avatar} name={c.name} size={96} />
          <Text style={s.name} testID="chat-info-name">{c.name}</Text>
          {isGroup && <Text style={s.sub}>{t("common.members", { count: c.members.length })}</Text>}
        </View>
        <View style={s.card}>
          {([["favorite", "heart-outline", "chatInfo.favorite"], ["pinned", "pin-outline", "chatInfo.pinChat"], ["muted", "volume-mute-outline", "common.mute"], ["archived", "archive-outline", "chatInfo.archive"]] as const).map(([k, icon, lab]) => (
            <SheetRow key={k} testID={`chat-info-toggle-${k}`} icon={icon} label={t(lab)} onPress={() => patch({ [k]: !c[k] })}
              right={<Switch value={!!c[k]} onValueChange={(v) => patch({ [k]: v })} trackColor={{ true: colors.brandPrimary, false: colors.border }} />} />
          ))}
          {isGroup && isAdmin && <SheetRow testID="chat-info-toggle-admins" icon="megaphone-outline" label={t("chatInfo.onlyAdmins")} onPress={() => patch({ onlyAdminsCanPost: !c.onlyAdminsCanPost })}
            right={<Switch value={c.onlyAdminsCanPost} onValueChange={(v) => patch({ onlyAdminsCanPost: v })} trackColor={{ true: colors.brandPrimary, false: colors.border }} />} />}
        </View>
        {(!isGroup || isAdmin) && (
          <View style={{ gap: spacing.sm }}>
            <Text style={s.section}>{t("chatInfo.disappearing")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
              {DISAPPEAR.map((sec) => <Chip key={sec} testID={`chat-info-disappear-${sec}`} label={label(sec)} active={c.disappearingSeconds === sec} onPress={() => patch({ disappearingSeconds: sec })} />)}
            </View>
          </View>
        )}
        {isGroup && (
          <View style={{ gap: spacing.sm }}>
            <Text style={s.section}>{t("chatInfo.members")}</Text>
            <View style={s.card}>
              {isAdmin && <SheetRow testID="chat-info-add-members" icon="person-add-outline" label={t("chatInfo.addMembers")} onPress={() => router.push(`/new-chat?addTo=${id}`)} />}
              {c.members.map((m) => (
                <SheetRow key={m.id} testID={`chat-member-${m.id}`} icon="person-outline" label={`${m.name}${m.id === user?.id ? ` (${t("common.you")})` : ""}`}
                  onPress={() => isAdmin && m.id !== user?.id && m.role !== "owner" && setMember(m)}
                  right={m.role !== "member" ? <Text style={s.role}>{t(`chatInfo.${m.role}`)}</Text> : <Avatar uri={m.avatar} name={m.name} size={28} />} />
              ))}
            </View>
          </View>
        )}
        <View style={s.card}>
          {c.type === "direct" && c.otherUserId && <SheetRow testID="chat-info-block" danger icon="ban-outline" label={t("chatInfo.blockUser")} onPress={() => act(() => api(`/users/${c.otherUserId}/block`, { method: "POST" }), () => toast(t("common.block"), "success"))} />}
          <SheetRow testID="chat-info-report" danger icon="flag-outline" label={t("chatInfo.reportChat")} onPress={() => setReport(true)} />
          {isGroup && <SheetRow testID="chat-info-leave" danger icon="exit-outline" label={t("chatInfo.leaveGroup")} onPress={() => act(() => api(`/conversations/${id}/members/${user!.id}`, { method: "DELETE" }), () => { qc.invalidateQueries({ queryKey: ["conversations"] }); router.replace("/(tabs)"); })} />}
        </View>
      </ScrollView>
      <Sheet visible={!!member} onClose={() => setMember(null)} title={member?.name} testID="member-sheet">
        {c.myRole === "owner" && <SheetRow testID="member-toggle-admin" icon="shield-outline" label={member?.role === "admin" ? t("chatInfo.removeAdmin") : t("chatInfo.makeAdmin")} onPress={() => act(() => api(`/conversations/${id}/members/${member.id}`, { method: "PATCH", body: { role: member.role === "admin" ? "member" : "admin" } }))} />}
        <SheetRow testID="member-remove" danger icon="person-remove-outline" label={t("chatInfo.remove")} onPress={() => act(() => api(`/conversations/${id}/members/${member.id}`, { method: "DELETE" }))} />
      </Sheet>
      <Sheet visible={report} onClose={() => setReport(false)} title={t("common.report")} testID="chat-report-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Field testID="chat-report-reason" placeholder={t("common.reportReason")} value={reason} onChangeText={setReason} multiline />
          <Button testID="chat-report-submit" title={t("common.report")} variant="danger" onPress={() => act(() => api("/reports", { body: { targetType: c.type === "direct" ? "user" : "conversation", targetId: c.otherUserId ?? c.id, reason: reason || "abuse" } }), () => { setReport(false); toast(t("common.reported"), "success"); })} />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  name: { fontSize: 22, fontWeight: "800", color: c.onSurface, lineHeight: 30, textAlign: "center" },
  sub: { color: c.muted },
  section: { fontSize: 15, fontWeight: "800", color: c.onSurface },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  role: { color: c.brandPrimary, fontWeight: "700", fontSize: 12 },
}));
