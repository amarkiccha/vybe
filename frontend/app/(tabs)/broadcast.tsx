import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { formatTime } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { Button, Card, Chip, ChipRow, Field, Icon, Sheet, StateView, useToast, errorText, type IconName } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const TYPES: { key: string; icon: IconName }[] = [
  { key: "text", icon: "chatbox-ellipses-outline" }, { key: "image", icon: "image-outline" }, { key: "video", icon: "videocam-outline" },
  { key: "link", icon: "link-outline" }, { key: "product", icon: "bag-handle-outline" },
];

function Row({ icon, title, sub, onPress, testID }: { icon: IconName; title: string; sub: string; onPress: () => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
      <Icon name={icon} size={24} color={colors.brandPrimary} />
      <View style={{ flex: 1 }}><Text style={s.rowTitle}>{title}</Text><Text style={s.rowSub}>{sub}</Text></View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function Campaigns({ goTab }: { goTab: (t: "contacts" | "analytics") => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useStyles();
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => api<{ campaigns: any[] }>("/broadcast/campaigns") });
  const segs = useQuery({ queryKey: ["segments"], queryFn: () => api<{ segments: any[] }>("/broadcast/segments") });
  const total = segs.data?.segments.reduce((n, x) => n + x.size, 0) ?? 0;
  return (
    <View style={{ gap: spacing.lg }}>
      <Card style={{ padding: spacing.lg, gap: spacing.lg }}>
        <Pressable testID="broadcast-create-campaign" onPress={() => router.push("/campaign-new")} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={s.bigIcon}><Icon name="megaphone-outline" size={30} color={colors.brandPrimary} /></View>
          <View style={{ flex: 1 }}><Text style={s.createTitle}>{t("broadcast.createCampaign")}</Text><Text style={s.rowSub}>{t("broadcast.createHint")}</Text></View>
          <View style={s.arrow}><Icon name="arrow-forward" size={20} color={colors.onAccent} /></View>
        </Pressable>
        <View style={s.types}>
          {TYPES.map((x) => (
            <Pressable key={x.key} testID={`broadcast-type-${x.key}`} onPress={() => router.push(`/campaign-new?type=${x.key}`)} style={s.typeItem}>
              <View style={s.typeIcon}><Icon name={x.icon} size={22} color={colors.brandPrimary} /></View>
              <Text style={s.typeLabel} numberOfLines={1}>{t(`broadcast.${x.key}`)}</Text>
            </Pressable>
          ))}
        </View>
        <View>
          <Row testID="broadcast-row-audience" icon="people-outline" title={t("broadcast.audience")} sub={`${t("broadcast.audienceHint")} · ${segs.data?.segments.length ?? 0} ${t("broadcast.segments")}`} onPress={() => goTab("contacts")} />
          <Row testID="broadcast-row-schedule" icon="time-outline" title={t("broadcast.schedule")} sub={t("broadcast.scheduleHint")} onPress={() => router.push("/campaign-new")} />
          <Row testID="broadcast-row-templates" icon="document-text-outline" title={t("broadcast.templates")} sub={t("broadcast.templatesHint")} onPress={() => router.push("/campaign-new?templates=1")} />
          <Row testID="broadcast-row-analytics" icon="stats-chart-outline" title={t("broadcast.analytics")} sub={t("broadcast.analyticsHint")} onPress={() => goTab("analytics")} />
        </View>
        <Text style={s.note}>{t("broadcast.eligible", { count: total })}</Text>
      </Card>
      <Text style={s.section}>{t("broadcast.history")}</Text>
      {q.data?.campaigns.length ? q.data.campaigns.map((c) => (
        <Pressable key={c.id} testID={`campaign-row-${c.id}`} onPress={() => router.push(`/campaign/${c.id}`)} style={s.histRow}>
          <View style={{ flex: 1 }}><Text style={s.rowTitle} numberOfLines={1}>{c.name}</Text><Text style={s.rowSub}>{formatTime(c.sentAt ?? c.updatedAt)} · {t(`broadcast.${c.type}`)}</Text></View>
          <View style={[s.status, c.status === "completed" && { backgroundColor: colors.success }, c.status === "pending_approval" && { backgroundColor: colors.warning }]}>
            <Text style={s.statusText}>{t(`broadcast.status_${c.status}`)}</Text>
          </View>
        </Pressable>
      )) : <StateView testID="campaigns" loading={q.isLoading} error={q.error} onRetry={q.refetch} empty emptyIcon="megaphone-outline" emptyTitle={t("broadcast.noCampaigns")} />}
    </View>
  );
}

function Contacts() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["contacts"], queryFn: () => api<{ contacts: any[] }>("/broadcast/contacts") });
  const segs = useQuery({ queryKey: ["segments"], queryFn: () => api<{ segments: any[] }>("/broadcast/segments") });
  const [sheet, setSheet] = useState<null | "add" | "csv" | "segment">(null);
  const [f, setF] = useState({ name: "", phone: "", email: "", tags: "", consent: false, csv: "name,phone,email,tags,consent\n", segName: "" });
  const [preview, setPreview] = useState<any>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["contacts"] }); qc.invalidateQueries({ queryKey: ["segments"] }); };
  const run = async (fn: () => Promise<any>) => { try { await fn(); } catch (e) { toast(errorText(e, t), "error"); } };
  const add = () => run(async () => {
    await api("/broadcast/contacts", { body: { name: f.name, phone: f.phone || undefined, email: f.email || undefined, tags: f.tags.split(",").map((x) => x.trim()).filter(Boolean), consent: f.consent ? "opted_in" : "pending" } });
    setSheet(null); refresh();
  });
  const validate = (commit: boolean) => run(async () => {
    const r = await api("/broadcast/contacts/import", { body: { csv: f.csv, commit } });
    setPreview(r);
    if (commit) { setSheet(null); setPreview(null); refresh(); toast(t("broadcast.importNow", { count: r.summary.valid }), "success"); }
  });
  const addSeg = () => run(async () => { await api("/broadcast/segments", { body: { name: f.segName, tags: f.tags.split(",").map((x) => x.trim()).filter(Boolean) } }); setSheet(null); refresh(); });
  const toggleConsent = (c: any) => run(async () => { await api(`/broadcast/contacts/${c.id}`, { method: "PATCH", body: { consent: c.consent === "opted_in" ? "opted_out" : "opted_in" } }); refresh(); });

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Button testID="contacts-add-button" title={t("broadcast.addContact")} onPress={() => setSheet("add")} style={{ flex: 1 }} />
        <Button testID="contacts-import-button" title={t("broadcast.importCsv")} onPress={() => setSheet("csv")} variant="secondary" style={{ flex: 1 }} />
      </View>
      <Text style={s.note}>{t("broadcast.consentNote")}</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[s.section, { flex: 1 }]}>{t("broadcast.segments")}</Text>
        <Pressable testID="segments-new-button" onPress={() => setSheet("segment")} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>+ {t("broadcast.newSegment")}</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {segs.data?.segments.map((g) => <View key={g.id} style={s.segCard}><Text style={s.rowTitle}>{g.name}</Text><Text style={s.rowSub}>#{g.tags.join(" #")} · {g.size}</Text></View>)}
      </ScrollView>
      <Text style={s.section}>{t("broadcast.contacts")}</Text>
      {q.data?.contacts.length ? q.data.contacts.map((c) => (
        <View key={c.id} style={s.histRow} testID={`contact-row-${c.id}`}>
          <View style={{ flex: 1 }}><Text style={s.rowTitle}>{c.name}</Text><Text style={s.rowSub} numberOfLines={1}>{c.phone ?? c.email}{c.tags.length ? ` · #${c.tags.join(" #")}` : ""}</Text></View>
          <Pressable testID={`contact-consent-${c.id}`} disabled={c.unsubscribed} onPress={() => toggleConsent(c)} style={[s.status, { backgroundColor: c.unsubscribed ? colors.error : c.consent === "opted_in" ? colors.success : colors.muted }]}>
            <Text style={s.statusText}>{c.unsubscribed ? t("broadcast.unsubscribed") : c.consent === "opted_in" ? t("broadcast.optedIn") : c.consent === "opted_out" ? t("broadcast.optedOut") : t("broadcast.pendingConsent")}</Text>
          </Pressable>
        </View>
      )) : <StateView testID="contacts" loading={q.isLoading} error={q.error} onRetry={q.refetch} empty emptyIcon="person-add-outline" emptyTitle={t("broadcast.noContacts")} />}

      <Sheet visible={sheet === "add"} onClose={() => setSheet(null)} title={t("broadcast.addContact")} testID="contact-add-sheet">
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Field testID="contact-name-input" label={t("auth.name")} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Field testID="contact-phone-input" label={t("auth.phone")} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" />
          <Field testID="contact-email-input" label={t("auth.email")} value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" keyboardType="email-address" />
          <Field testID="contact-tags-input" label={t("broadcast.tags")} value={f.tags} onChangeText={(v) => setF({ ...f, tags: v })} autoCapitalize="none" />
          <Chip testID="contact-consent-toggle" label={`${t("broadcast.consent")}: ${f.consent ? t("broadcast.optedIn") : t("broadcast.pendingConsent")}`} active={f.consent} onPress={() => setF({ ...f, consent: !f.consent })} />
          <Button testID="contact-save-button" title={t("common.save")} onPress={add} />
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === "csv"} onClose={() => { setSheet(null); setPreview(null); }} title={t("broadcast.importCsv")} testID="csv-sheet">
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Text style={s.note}>{t("broadcast.csvHint")}</Text>
          <Field testID="csv-input" value={f.csv} onChangeText={(v) => { setF({ ...f, csv: v }); setPreview(null); }} multiline autoCapitalize="none" style={{ minHeight: 140, textAlignVertical: "top", fontFamily: "monospace", fontSize: 13 }} />
          {preview && (
            <View testID="csv-preview" style={{ gap: 6 }}>
              <Text style={s.rowTitle}>{t("broadcast.valid")}: {preview.summary.valid} · {t("broadcast.invalid")}: {preview.summary.invalid} · {t("broadcast.duplicate")}: {preview.summary.duplicate}</Text>
              {preview.rows.filter((r: any) => r.status !== "valid").slice(0, 8).map((r: any) => <Text key={r.line} style={{ color: colors.error, fontSize: 13 }}>#{r.line} {r.name || "—"}: {r.error}</Text>)}
            </View>
          )}
          {preview?.summary.valid ? <Button testID="csv-commit-button" title={t("broadcast.importNow", { count: preview.summary.valid })} onPress={() => validate(true)} />
            : <Button testID="csv-validate-button" title={t("broadcast.validate")} onPress={() => validate(false)} variant="secondary" />}
        </ScrollView>
      </Sheet>
      <Sheet visible={sheet === "segment"} onClose={() => setSheet(null)} title={t("broadcast.newSegment")} testID="segment-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Field testID="segment-name-input" label={t("auth.name")} value={f.segName} onChangeText={(v) => setF({ ...f, segName: v })} />
          <Field testID="segment-tags-input" label={t("broadcast.tags")} value={f.tags} onChangeText={(v) => setF({ ...f, tags: v })} autoCapitalize="none" />
          <Button testID="segment-save-button" title={t("common.save")} onPress={addSeg} />
        </View>
      </Sheet>
    </View>
  );
}

function Analytics() {
  const { t } = useTranslation();
  const s = useStyles();
  const q = useQuery({ queryKey: ["analytics"], queryFn: () => api<Record<string, number>>("/broadcast/analytics") });
  if (!q.data) return <StateView testID="analytics" loading={q.isLoading} error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const stats: [string, number][] = [["sent", d.sent], ["delivered", d.delivered], ["read", d.read], ["failed", d.failed], ["suppressed", d.suppressed], ["contacts", d.contacts], ["optedIn", d.optedIn], ["unsubscribed", d.unsubscribed]];
  return (
    <View style={{ gap: spacing.md }}>
      <View style={s.statGrid}>
        {stats.map(([k, v]) => <Card key={k} style={s.stat} testID={`analytics-${k}`}><Text style={s.statNum}>{v}</Text><Text style={s.rowSub}>{t(`broadcast.${k}`)}</Text></Card>)}
      </View>
      <Text style={s.note}>{t("broadcast.deliveryNote")}</Text>
    </View>
  );
}

export default function Broadcast() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"campaigns" | "contacts" | "analytics">("campaigns");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  return (
    <View style={s.root} testID="broadcast-screen">
      <View style={{ paddingTop: insets.top + spacing.sm }}>
        <View style={s.topRow}>
          <Text style={s.title} accessibilityRole="header">{t("broadcast.title")}</Text>
        </View>
        <ChipRow testID="broadcast-tab-row">
          {(["campaigns", "contacts", "analytics"] as const).map((k) => <Chip key={k} testID={`broadcast-tab-${k}`} label={t(`broadcast.${k}`)} active={tab === k} onPress={() => setTab(k)} />)}
        </ChipRow>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={false} onRefresh={() => qc.invalidateQueries()} />} contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomChrome + (tab === "campaigns" ? 96 : spacing.xl) }} keyboardShouldPersistTaps="handled">
        {tab === "campaigns" ? <Campaigns goTab={setTab} /> : tab === "contacts" ? <Contacts /> : <Analytics />}
      </ScrollView>
      {tab === "campaigns" && (
        <View style={[s.sticky, { bottom: bottomChrome + 16 }]}>
          <Button testID="broadcast-send-campaign" title={t("broadcast.sendCampaign")} icon="arrow-forward" onPress={() => router.push("/campaign-new")} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  topRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, minHeight: 48 },
  title: { flex: 1, fontSize: 28, fontWeight: "800", color: c.onSurface, lineHeight: 38 },
  bigIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  createTitle: { fontSize: 17, fontWeight: "800", color: c.brandPrimary, lineHeight: 24 },
  arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
  types: { flexDirection: "row", justifyContent: "space-between" },
  typeItem: { alignItems: "center", gap: 6, width: 60 },
  typeIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: 12, color: c.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 64, borderTopWidth: 1, borderTopColor: c.divider, paddingVertical: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: "700", color: c.onSurface, lineHeight: 22 },
  rowSub: { fontSize: 13, color: c.muted, lineHeight: 19 },
  section: { fontSize: 17, fontWeight: "800", color: c.onSurface, lineHeight: 26 },
  note: { fontSize: 13, color: c.muted, lineHeight: 19 },
  histRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.muted, maxWidth: 130 },
  statusText: { color: c.onSuccess, fontSize: 12, fontWeight: "700" },
  segCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, minWidth: 140 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  stat: { width: "47%", padding: spacing.lg, gap: 4 },
  statNum: { fontSize: 28, fontWeight: "800", color: c.brandPrimary },
  sticky: { position: "absolute", left: spacing.lg, right: spacing.lg },
}));
