import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, ApiError, uploadFile } from "@/src/api";
import { Button, Card, Chip, Field, Icon, IconButton, Sheet, SheetRow, useToast, errorText } from "@/src/components/ui";
import { spacing, useTheme, radius } from "@/src/theme";

const TYPES = ["text", "image", "video", "link", "product"] as const;

export default function CampaignNew() {
  const params = useLocalSearchParams<{ type?: string; templates?: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const segs = useQuery({ queryKey: ["segments"], queryFn: () => api<{ segments: any[] }>("/broadcast/segments") });
  const tpls = useQuery({ queryKey: ["templates"], queryFn: () => api<{ templates: any[] }>("/broadcast/templates") });
  const [f, setF] = useState({ name: "", type: (TYPES as readonly string[]).includes(params.type ?? "") ? params.type! : "text", body: "", link: "", title: "", price: "", segmentId: "" as string, when: "now" as "now" | "1h" | "tomorrow" });
  const [media, setMedia] = useState<{ uri: string; mime: string; name: string } | null>(null);
  const [tplSheet, setTplSheet] = useState(params.templates === "1");
  const [confirm, setConfirm] = useState<{ id: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: f.type === "video" ? ["videos"] : ["images"], quality: 0.8 });
    if (r.canceled) return;
    const a = r.assets[0];
    setMedia({ uri: a.uri, mime: a.mimeType ?? (f.type === "video" ? "video/mp4" : "image/jpeg"), name: a.fileName ?? "campaign" });
  };
  const scheduledAt = () => {
    if (f.when === "now") return null;
    const d = new Date();
    if (f.when === "1h") d.setHours(d.getHours() + 1);
    else { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
    return d.toISOString();
  };
  const save = async () => {
    let mediaId: string | undefined;
    if (media) mediaId = (await uploadFile(media.uri, media.name, media.mime)).id;
    const r = await api<{ campaign: any }>("/broadcast/campaigns", { body: {
      name: f.name.trim(), type: f.type, body: f.body, mediaId, link: f.link || undefined, product: f.type === "product" ? { title: f.title, price: f.price } : undefined,
      segmentId: f.segmentId || undefined, scheduledAt: scheduledAt(),
    } });
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    return r.campaign.id as string;
  };
  const submit = async (id: string, confirmed = false) => {
    try {
      const r = await api<{ campaign: any }>(`/broadcast/campaigns/${id}/submit`, { body: { confirm: confirmed } });
      qc.invalidateQueries({ queryKey: ["campaigns"] }); qc.invalidateQueries({ queryKey: ["analytics"] });
      toast(t(`broadcast.status_${r.campaign.status}`), "success");
      router.replace(`/campaign/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "confirmation_required") return setConfirm({ id, count: e.data.recipients });
      toast(errorText(e, t), "error");
      router.replace(`/campaign/${id}`);
    }
  };
  const go = async (send: boolean) => {
    if (!f.name.trim()) return toast(t("errors.validation_failed"), "error");
    setBusy(true);
    try { const id = await save(); if (send) await submit(id); else { toast(t("broadcast.saveDraft"), "success"); router.back(); } }
    catch (e) { toast(errorText(e, t), "error"); } finally { setBusy(false); }
  };
  const saveTemplate = () => api("/broadcast/templates", { body: { name: f.name || "Template", body: f.body } }).then(() => { tpls.refetch(); toast(t("broadcast.saveTemplate"), "success"); }).catch((e) => toast(errorText(e, t), "error"));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="campaign-new-screen">
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + 4, paddingHorizontal: 4 }}>
        <IconButton testID="campaign-back" name="close" onPress={() => router.back()} />
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.onSurface }}>{t("broadcast.createCampaign")}</Text>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <Field testID="campaign-name-input" label={t("broadcast.campaignName")} value={f.name} onChangeText={set("name")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {TYPES.map((x) => <Chip key={x} testID={`campaign-type-${x}`} label={t(`broadcast.${x}`)} active={f.type === x} onPress={() => setF({ ...f, type: x })} />)}
        </ScrollView>
        <Field testID="campaign-body-input" label={t("broadcast.message")} value={f.body} onChangeText={set("body")} multiline maxLength={2000} style={{ minHeight: 110, textAlignVertical: "top" }} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button testID="campaign-use-template" title={t("broadcast.useTemplate")} variant="secondary" onPress={() => setTplSheet(true)} style={{ flex: 1, minHeight: 44 }} />
          <Button testID="campaign-save-template" title={t("broadcast.saveTemplate")} variant="ghost" onPress={saveTemplate} disabled={!f.body.trim()} style={{ flex: 1, minHeight: 44 }} />
        </View>
        {(f.type === "image" || f.type === "video" || f.type === "product") && <Button testID="campaign-pick-media" title={media ? media.name : t(`broadcast.${f.type === "video" ? "video" : "image"}`)} variant="secondary" icon="image-outline" onPress={pick} />}
        {(f.type === "link" || f.type === "product") && <Field testID="campaign-link-input" label={t("broadcast.linkUrl")} value={f.link} onChangeText={set("link")} autoCapitalize="none" keyboardType="url" placeholder="https://" />}
        {f.type === "product" && <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 2 }}><Field testID="campaign-product-title" label={t("broadcast.productTitle")} value={f.title} onChangeText={set("title")} /></View>
          <View style={{ flex: 1 }}><Field testID="campaign-product-price" label={t("broadcast.price")} value={f.price} onChangeText={set("price")} placeholder="₹" /></View>
        </View>}
        <Text style={{ fontWeight: "800", color: colors.onSurface }}>{t("broadcast.audience")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <Chip testID="campaign-audience-all" label={t("broadcast.allContacts")} active={!f.segmentId} onPress={() => setF({ ...f, segmentId: "" })} />
          {segs.data?.segments.map((g) => <Chip key={g.id} testID={`campaign-audience-${g.id}`} label={`${g.name} (${g.size})`} active={f.segmentId === g.id} onPress={() => setF({ ...f, segmentId: g.id })} />)}
        </View>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{t("broadcast.consentNote")}</Text>
        <Text style={{ fontWeight: "800", color: colors.onSurface }}>{t("broadcast.schedule")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {(["now", "1h", "tomorrow"] as const).map((w) => <Chip key={w} testID={`campaign-when-${w}`} label={t(w === "now" ? "broadcast.now" : w === "1h" ? "broadcast.inOneHour" : "broadcast.tomorrow")} active={f.when === w} onPress={() => setF({ ...f, when: w })} />)}
        </View>
        <Text style={{ fontWeight: "800", color: colors.onSurface }}>{t("broadcast.preview")}</Text>
        <Card style={{ padding: spacing.md, gap: 8 }} testID="campaign-preview">
          {media && f.type !== "video" && <Image source={{ uri: media.uri }} style={{ height: 160, borderRadius: radius.md }} contentFit="cover" />}
          {f.type === "video" && media && <Icon name="videocam" size={32} color={colors.brandPrimary} />}
          <Text style={{ color: colors.onSurface, fontSize: 15, lineHeight: 22 }}>{f.body || f.name || "…"}</Text>
          {f.type === "product" && !!f.title && <Text style={{ fontWeight: "800", color: colors.brandPrimary }}>{f.title} · {f.price}</Text>}
          {!!f.link && <Text style={{ color: colors.brandPrimary, textDecorationLine: "underline" }}>{f.link}</Text>}
        </Card>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{t("broadcast.deliveryNote")}</Text>
        <Button testID="campaign-send-button" title={f.when === "now" ? t("broadcast.sendCampaign") : t("broadcast.schedule")} icon="arrow-forward" onPress={() => go(true)} loading={busy} />
        <Button testID="campaign-draft-button" title={t("broadcast.saveDraft")} variant="secondary" onPress={() => go(false)} disabled={busy} />
      </KeyboardAwareScrollView>
      <Sheet visible={tplSheet} onClose={() => setTplSheet(false)} title={t("broadcast.templates")} testID="template-sheet">
        {tpls.data?.templates.map((x) => <SheetRow key={x.id} testID={`template-${x.id}`} icon="document-text-outline" label={x.name} onPress={() => { setF((p) => ({ ...p, body: x.body, name: p.name || x.name })); setTplSheet(false); }} />)}
      </Sheet>
      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={t("broadcast.sendCampaign")} testID="campaign-confirm-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={{ color: colors.onSurface, fontSize: 16, lineHeight: 24 }}>{t("broadcast.confirmLarge", { count: confirm?.count ?? 0 })}</Text>
          <Button testID="campaign-confirm-button" title={t("common.continue")} onPress={() => { const c = confirm!; setConfirm(null); submit(c.id, true); }} />
        </View>
      </Sheet>
    </View>
  );
}
