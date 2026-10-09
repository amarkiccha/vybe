import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, type Community } from "@/src/api";
import i18n from "@/src/i18n";
import { Button, Chip, Field, IconButton, useToast, errorText } from "@/src/components/ui";
import { spacing, useTheme } from "@/src/theme";

const CATS = ["learning", "tech", "jobs", "creators", "business", "lifestyle"];

export default function CommunityCreate() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", description: "", category: "learning", isPrivate: false });
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ community: Community }>("/communities", { body: { ...f, language: i18n.language } });
      qc.invalidateQueries({ queryKey: ["communities"] });
      router.replace(`/community/${r.community.id}`);
    } catch (e) { toast(errorText(e, t), "error"); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="community-create-screen">
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + 4, paddingHorizontal: 4 }}>
        <IconButton testID="community-create-back" name="close" onPress={() => router.back()} />
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.onSurface }}>{t("communities.create")}</Text>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <Field testID="community-name-input" label={t("communities.name")} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} maxLength={80} />
        <Field testID="community-description-input" label={t("communities.description")} value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline maxLength={500} style={{ minHeight: 100, textAlignVertical: "top" }} />
        <Text style={{ fontWeight: "800", color: colors.onSurface }}>{t("communities.category")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {CATS.map((c) => <Chip key={c} testID={`community-cat-${c}`} label={t(`communities.${c}`)} active={f.category === c} onPress={() => setF({ ...f, category: c })} />)}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", color: colors.onSurface }}>{t("communities.private")}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{t("communities.privateHint")}</Text>
          </View>
          <Switch testID="community-private-switch" value={f.isPrivate} onValueChange={(v) => setF({ ...f, isPrivate: v })} trackColor={{ true: colors.brandPrimary, false: colors.border }} />
        </View>
        <Button testID="community-create-submit" title={t("common.create")} onPress={create} loading={busy} disabled={f.name.trim().length < 3} />
      </KeyboardAwareScrollView>
    </View>
  );
}
