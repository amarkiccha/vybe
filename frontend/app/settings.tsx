import { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { LANGUAGES, formatTime } from "@/src/i18n";
import { Avatar, Button, Chip, Field, IconButton, Sheet, SheetRow, useToast, errorText } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { user, updateMe, signOut } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "profile" | "pin" | "blocked" | "sessions" | "delete">(null);
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [pin, setPin] = useState("");
  const [pwd, setPwd] = useState("");
  const blocked = useQuery({ queryKey: ["blocked"], queryFn: () => api<{ users: any[] }>("/users/blocked") });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ sessions: any[] }>("/auth/sessions"), enabled: sheet === "sessions" });
  if (!user) return null;
  const run = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) toast(ok, "success"); } catch (e) { toast(errorText(e, t), "error"); } };
  const sw = (v: boolean, on: (v: boolean) => void, testID: string) => <Switch testID={testID} value={v} onValueChange={on} trackColor={{ true: colors.success, false: colors.border }} />;
  const lang = LANGUAGES.find((l) => l.code === i18n.language);

  return (
    <View style={s.root} testID="settings-screen">
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <IconButton testID="settings-back" name="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>{t("settings.title")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={s.profile}>
          <Avatar uri={user.avatar} name={user.name} size={64} />
          <View style={{ flex: 1 }}><Text style={s.name} testID="settings-user-name">{user.name}</Text><Text style={s.sub}>{user.email}</Text>{!!user.bio && <Text style={s.sub}>{user.bio}</Text>}</View>
          <IconButton testID="settings-edit-profile" name="create-outline" onPress={() => setSheet("profile")} />
        </View>

        <View style={s.card}>
          <SheetRow testID="settings-language" icon="language-outline" label={t("settings.language")} onPress={() => router.push("/language?from=settings")} right={<Text style={s.value}>{lang?.native}</Text>} />
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 8 }}>
            <Text style={s.label}>{t("settings.theme")}</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["system", "light", "dark"] as const).map((m) => <Chip key={m} testID={`settings-theme-${m}`} label={t(`settings.${m}`)} active={user.theme === m} onPress={() => run(() => updateMe({ theme: m }))} />)}
            </View>
          </View>
        </View>

        <Text style={s.section}>{t("settings.privacy")}</Text>
        <View style={s.card}>
          <SheetRow testID="settings-blocked" icon="ban-outline" label={`${t("settings.blocked")} · ${t("settings.blockedCount", { count: blocked.data?.users.length ?? 0 })}`} onPress={() => setSheet("blocked")} />
          <SheetRow testID="settings-content-filter" icon="shield-checkmark-outline" label={t("settings.contentFilter")} onPress={() => run(() => updateMe({ contentFilter: !user.contentFilter }))} right={sw(user.contentFilter, (v) => run(() => updateMe({ contentFilter: v })), "settings-content-filter-switch")} />
          <SheetRow testID="settings-two-step" icon="key-outline" label={t("settings.twoStep")} onPress={() => (user.twoStepEnabled ? run(() => api("/auth/two-step", { body: { enabled: false } }).then((r: any) => updateMe({})), t("common.off")) : setSheet("pin"))}
            right={sw(user.twoStepEnabled, (v) => (v ? setSheet("pin") : run(() => api("/auth/two-step", { body: { enabled: false } }).then(() => updateMe({})))), "settings-two-step-switch")} />
          <SheetRow testID="settings-read-receipts" icon="checkmark-done-outline" label={t("settings.readReceipts")} onPress={() => {}} right={sw(user.privacy.readReceipts, (v) => run(() => updateMe({ privacy: { readReceipts: v } })), "settings-read-receipts-switch")} />
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 8 }}>
            <Text style={s.label}>{t("settings.messageRequests")} — {t("settings.messageRequestsHint")}</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Chip testID="settings-requests-everyone" label={t("settings.everyone")} active={user.privacy.messageRequests === "everyone"} onPress={() => run(() => updateMe({ privacy: { messageRequests: "everyone" } }))} />
              <Chip testID="settings-requests-requests" label={t("settings.requestsOnly")} active={user.privacy.messageRequests === "requests"} onPress={() => run(() => updateMe({ privacy: { messageRequests: "requests" } }))} />
            </View>
            <Text style={s.label}>{t("settings.storyAudience")}</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["contacts", "close_friends", "everyone"] as const).map((a) => <Chip key={a} testID={`settings-story-${a}`} label={t(a === "contacts" ? "stories.contacts" : a === "everyone" ? "stories.everyone" : "stories.closeFriends")} active={user.privacy.storyAudience === a} onPress={() => run(() => updateMe({ privacy: { storyAudience: a } }))} />)}
            </View>
          </View>
          <SheetRow testID="settings-sessions" icon="phone-portrait-outline" label={t("settings.sessions")} onPress={() => setSheet("sessions")} />
        </View>

        <Text style={s.section}>{t("settings.security")}</Text>
        <View style={[s.card, { padding: spacing.lg, gap: 10 }]} testID="settings-security-status">
          <Text style={s.label}>{t("settings.e2ee")}: <Text style={{ color: colors.warning }}>{t("settings.e2eeStatus")}</Text></Text>
          <Text style={s.label}>{t("settings.calls")}: <Text style={{ color: colors.warning }}>{t("settings.pending")}</Text></Text>
          <Text style={s.label}>{t("settings.push")}: <Text style={{ color: colors.warning }}>{t("settings.pending")}</Text></Text>
        </View>

        <View style={s.card}>
          <SheetRow testID="settings-export" icon="download-outline" label={t("settings.exportData")} onPress={() => run(async () => { const r = await api<any>("/auth/export"); toast(t("settings.exported", { count: r.messages.length }), "success"); })} />
          <SheetRow testID="settings-logout" icon="log-out-outline" label={t("settings.logout")} onPress={async () => { await signOut(); router.replace("/auth"); }} />
          <SheetRow testID="settings-delete-account" danger icon="trash-outline" label={t("settings.deleteAccount")} onPress={() => setSheet("delete")} />
        </View>
      </ScrollView>

      <Sheet visible={sheet === "profile"} onClose={() => setSheet(null)} title={t("settings.profile")} testID="profile-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Field testID="profile-name-input" label={t("auth.name")} value={name} onChangeText={setName} />
          <Field testID="profile-bio-input" label={t("settings.bio")} value={bio} onChangeText={setBio} maxLength={160} />
          <Button testID="profile-save-button" title={t("common.save")} onPress={() => run(async () => { await updateMe({ name, bio }); setSheet(null); })} />
        </View>
      </Sheet>
      <Sheet visible={sheet === "pin"} onClose={() => setSheet(null)} title={t("settings.twoStep")} testID="pin-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={s.label}>{t("settings.twoStepHint")}</Text>
          <Field testID="pin-input" placeholder={t("settings.enterPin")} value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={6} secureTextEntry />
          <Button testID="pin-save-button" title={t("common.save")} disabled={pin.length !== 6} onPress={() => run(async () => { await api("/auth/two-step", { body: { enabled: true, pin } }); await updateMe({}); setPin(""); setSheet(null); }, t("common.on"))} />
        </View>
      </Sheet>
      <Sheet visible={sheet === "blocked"} onClose={() => setSheet(null)} title={t("settings.blocked")} testID="blocked-sheet">
        {blocked.data?.users.length ? blocked.data.users.map((u) => (
          <SheetRow key={u.id} testID={`blocked-${u.id}`} icon="person-outline" label={u.name} onPress={() => {}} right={<Chip testID={`unblock-${u.id}`} label={t("common.unblock")} active onPress={() => run(async () => { await api(`/users/${u.id}/block`, { method: "DELETE" }); blocked.refetch(); })} />} />
        )) : <Text style={[s.label, { padding: spacing.lg }]}>{t("settings.blockedCount", { count: 0 })}</Text>}
      </Sheet>
      <Sheet visible={sheet === "sessions"} onClose={() => setSheet(null)} title={t("settings.sessions")} testID="sessions-sheet">
        <ScrollView style={{ maxHeight: 400 }}>
          {sessions.data?.sessions.map((x) => (
            <SheetRow key={x.id} testID={`session-${x.id}`} icon="phone-portrait-outline" label={`${x.current ? `${t("settings.thisDevice")} · ` : ""}${(x.device ?? "").slice(0, 28)} · ${formatTime(x.lastSeenAt)}`} onPress={() => {}}
              right={!x.current ? <Chip testID={`session-revoke-${x.id}`} label={t("settings.revoke")} active={false} onPress={() => run(async () => { await api(`/auth/sessions/${x.id}`, { method: "DELETE" }); sessions.refetch(); })} /> : undefined} />
          ))}
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === "delete"} onClose={() => setSheet(null)} title={t("settings.deleteAccount")} testID="delete-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={s.label}>{t("settings.deleteConfirm")}</Text>
          <Field testID="delete-password-input" placeholder={t("auth.password")} value={pwd} onChangeText={setPwd} secureTextEntry />
          <Button testID="delete-confirm-button" title={t("settings.deleteAccount")} variant="danger" disabled={!pwd} onPress={() => run(async () => { await api("/auth/account", { method: "DELETE", body: { password: pwd } }); await signOut(); router.replace("/auth"); })} />
        </View>
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingBottom: spacing.sm },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface, lineHeight: 32 },
  profile: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  name: { fontSize: 18, fontWeight: "800", color: c.onSurface, lineHeight: 26 },
  sub: { color: c.muted, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  section: { fontSize: 15, fontWeight: "800", color: c.onSurface, lineHeight: 22 },
  label: { color: c.muted, fontSize: 13, lineHeight: 20 },
  value: { color: c.muted, fontSize: 15 },
}));
