import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Animated, { FadeInDown } from "react-native-reanimated";
import i18n, { LANGUAGES, setLanguage } from "@/src/i18n";
import { useAuth } from "@/src/auth";
import { Button, Icon, useToast, errorText } from "@/src/components/ui";
import { makeStyles, radius, serif, spacing, useTheme } from "@/src/theme";

export default function LanguageScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { t } = useTranslation();
  const { user, updateMe } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const [sel, setSel] = useState(i18n.language);
  const [busy, setBusy] = useState(false);

  const pick = (code: string) => { setSel(code); i18n.changeLanguage(code); }; // live preview
  const confirm = async () => {
    setBusy(true);
    try {
      if (user) await updateMe({ language: sel });
      else await setLanguage(sel);
      if (from === "settings") router.back();
      else router.replace(user ? "/(tabs)" : "/auth");
    } catch (e) { toast(errorText(e, t), "error"); } finally { setBusy(false); }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.xl }]} testID="language-screen">
      <View style={{ paddingHorizontal: spacing.xl }}>
        {from !== "settings" && <Text style={s.logo}>VYBE</Text>}
        <Text style={s.title} testID="language-title">{t("onboarding.chooseLanguage")}</Text>
        <Text style={s.hint}>{t("onboarding.languageHint")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}>
        {LANGUAGES.map((l, i) => {
          const active = sel === l.code;
          return (
            <Animated.View key={l.code} entering={FadeInDown.delay(i * 40)}>
              <Pressable testID={`language-option-${l.code}`} onPress={() => pick(l.code)} accessibilityRole="radio" accessibilityState={{ checked: active }}
                style={[s.option, active && { borderColor: colors.onBrand, backgroundColor: colors.brandPrimary }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.native}>{l.native}</Text>
                  <Text style={s.english}>{l.english}</Text>
                </View>
                {active && <Icon name="checkmark-circle" color={colors.onBrand} size={26} />}
              </Pressable>
            </Animated.View>
          );
        })}
        <View style={s.preview}>
          <Text style={s.previewLabel}>{t("onboarding.preview")}</Text>
          <Text style={s.previewText}>{t("tabs.chats")} · {t("tabs.stories")} · {t("tabs.communities")} · {t("tabs.broadcast")}</Text>
          <Text style={s.previewText}>{t("app.tagline")}</Text>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.lg }}>
        <Button testID="language-continue-button" title={t("common.continue")} onPress={confirm} loading={busy} variant="secondary" icon="arrow-forward" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.brandSecondary },
  logo: { fontSize: 40, fontWeight: "900", color: c.onBrand, letterSpacing: 2, marginBottom: spacing.md },
  title: { fontSize: 26, fontFamily: serif, color: c.onBrand, lineHeight: 36 },
  hint: { fontSize: 14, color: c.darkMuted, marginTop: 6, lineHeight: 20 },
  option: { flexDirection: "row", alignItems: "center", minHeight: 68, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(245,240,232,0.18)", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: "rgba(245,240,232,0.06)" },
  native: { fontSize: 20, color: c.onBrand, fontWeight: "600", lineHeight: 30 },
  english: { fontSize: 13, color: c.darkMuted, marginTop: 2 },
  preview: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: "rgba(0,0,0,0.25)", gap: 6 },
  previewLabel: { color: c.darkMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  previewText: { color: c.onBrand, fontSize: 15, lineHeight: 24 },
}));
