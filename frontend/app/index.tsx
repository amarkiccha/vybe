import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth";
import { restoreLanguage } from "@/src/i18n";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { ready, user } = useAuth();
  const { colors } = useTheme();
  const [lang, setLang] = useState<string | null | undefined>(undefined);
  useEffect(() => { restoreLanguage().then(setLang); }, []);
  if (!ready || lang === undefined) return <View style={{ flex: 1, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.onBrand} /></View>;
  if (!lang && !user) return <Redirect href="/language" />;
  if (!user) return <Redirect href="/auth" />;
  return <Redirect href="/(tabs)" />;
}
