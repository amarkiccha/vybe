import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api } from "@/src/api";
import { formatTime } from "@/src/i18n";
import { Button, Card, IconButton, StateView, useToast, errorText } from "@/src/components/ui";
import { radius, spacing, useTheme } from "@/src/theme";

export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["campaign", id], queryFn: () => api<{ campaign: any; audience: { total: number; eligible: number; suppressed: number }; deliveries: any[] }>(`/broadcast/campaigns/${id}`), refetchInterval: 10000 });
  const act = async (path: string, body: any = {}) => {
    try { await api(path, { body }); q.refetch(); qc.invalidateQueries({ queryKey: ["campaigns"] }); qc.invalidateQueries({ queryKey: ["analytics"] }); }
    catch (e) { toast(errorText(e, t), "error"); }
  };
  const d = q.data;
  const col = (s: string) => (s === "delivered" || s === "read" ? colors.success : s === "failed" ? colors.error : colors.muted);
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="campaign-detail-screen">
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + 4, paddingHorizontal: 4 }}>
        <IconButton testID="campaign-detail-back" name="chevron-back" onPress={() => router.back()} />
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.onSurface }} numberOfLines={1}>{d?.campaign.name ?? ""}</Text>
      </View>
      {!d ? <StateView testID="campaign-detail" loading={q.isLoading} error={q.error} onRetry={q.refetch} /> : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + spacing.xl }}>
          <Card style={{ padding: spacing.lg, gap: 6 }}>
            <Text testID="campaign-status" style={{ color: colors.brandPrimary, fontWeight: "800" }}>{t(`broadcast.status_${d.campaign.status}`)}</Text>
            <Text style={{ color: colors.onSurface, lineHeight: 22 }}>{d.campaign.body}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{t("broadcast.eligible", { count: d.audience.eligible })} · {t("broadcast.suppressed")}: {d.audience.suppressed}</Text>
            {d.campaign.scheduledAt && <Text style={{ color: colors.muted, fontSize: 13 }}>{t("broadcast.schedule")}: {new Date(d.campaign.scheduledAt).toLocaleString()}</Text>}
          </Card>
          {d.campaign.status === "pending_approval" && <><Text style={{ color: colors.warning, lineHeight: 20 }}>{t("broadcast.pendingApproval")}</Text><Button testID="campaign-approve-button" title={t("broadcast.approve")} onPress={() => act(`/broadcast/campaigns/${id}/approve`)} /></>}
          {d.campaign.status === "draft" && <Button testID="campaign-submit-button" title={t("broadcast.sendCampaign")} onPress={() => act(`/broadcast/campaigns/${id}/submit`, { confirm: true })} />}
          <Text style={{ fontWeight: "800", fontSize: 17, color: colors.onSurface }}>{t("broadcast.deliveries")} ({d.deliveries.length})</Text>
          {d.deliveries.map((x) => (
            <View key={x.id} testID={`delivery-${x.id}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{x.contact?.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{x.channel === "vybe" ? "VYBE" : "External"}{x.error ? ` · ${x.error}` : ""} · {formatTime(x.updatedAt)}</Text>
              </View>
              <Text style={{ color: col(x.status), fontWeight: "800", fontSize: 12 }}>{t(`broadcast.${x.status === "queued" ? "status_sending" : x.status}`)}</Text>
            </View>
          ))}
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{t("broadcast.deliveryNote")}</Text>
        </ScrollView>
      )}
    </View>
  );
}
