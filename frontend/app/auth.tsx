import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, ApiError, type Me } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Field, errorText } from "@/src/components/ui";
import { makeStyles, radius, serif, spacing } from "@/src/theme";

export default function AuthScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ name: "", email: "", password: "", phone: "", pin: "" });
  const [needPin, setNeedPin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setErr(null);
    if (!f.email.includes("@")) return setErr(t("errors.validation_failed"));
    if (mode === "up" && (f.password.length < 8 || !f.name.trim())) return setErr(t("errors.validation_failed"));
    setBusy(true);
    try {
      const body = mode === "in" ? { email: f.email, password: f.password, pin: f.pin || undefined } : { name: f.name, email: f.email, password: f.password, phone: f.phone || undefined };
      const r = await api<{ token: string; user: Me }>(mode === "in" ? "/auth/login" : "/auth/register", { body });
      await signIn(r.token, r.user);
      router.replace("/(tabs)");
    } catch (e) {
      if (e instanceof ApiError && e.code === "pin_required") setNeedPin(true);
      setErr(errorText(e, t));
    } finally { setBusy(false); }
  };

  const recover = async () => {
    try { await api("/auth/recover", { body: { email: f.email } }); } catch (e) { setErr(errorText(e, t)); }
  };

  return (
    <View style={s.root}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + spacing["2xl"], paddingBottom: insets.bottom + spacing.xl }}>
        <View style={s.hero}>
          <Text style={s.logo}>VYBE</Text>
          <Text style={s.tag}>{t("app.tagline")}</Text>
          <Text style={s.sub}>{t("app.subtitle")}</Text>
        </View>
        <View style={s.card} testID="auth-form">
          <Text style={s.title}>{mode === "in" ? t("auth.signIn") : t("auth.signUp")}</Text>
          {mode === "up" && <Field testID="auth-name-input" label={t("auth.name")} value={f.name} onChangeText={set("name")} autoComplete="name" />}
          <Field testID="auth-email-input" label={t("auth.email")} value={f.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field testID="auth-password-input" label={t("auth.password")} value={f.password} onChangeText={set("password")} secureTextEntry placeholder={mode === "up" ? t("auth.passwordRule") : undefined} onSubmitEditing={submit} />
          {mode === "up" && <Field testID="auth-phone-input" label={t("auth.phone")} value={f.phone} onChangeText={set("phone")} keyboardType="phone-pad" placeholder="+91" />}
          {needPin && mode === "in" && <Field testID="auth-pin-input" label={t("auth.pin")} value={f.pin} onChangeText={set("pin")} keyboardType="number-pad" maxLength={6} secureTextEntry />}
          {err && <Text testID="auth-error" style={s.err}>{err}</Text>}
          <Button testID="auth-submit-button" title={mode === "in" ? t("auth.signIn") : t("auth.signUp")} onPress={submit} loading={busy} />
          {mode === "in" && <Pressable testID="auth-forgot-button" onPress={recover}><Text style={s.link}>{t("auth.forgot")}</Text></Pressable>}
          <Pressable testID="auth-toggle-mode" onPress={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={s.link}>{mode === "in" ? t("auth.noAccount") : t("auth.haveAccount")}</Text>
          </Pressable>
          <Text style={s.demo}>{t("auth.demoHint")}</Text>
          <Pressable testID="auth-change-language" onPress={() => router.push("/language")}><Text style={s.link}>🌐 {t("settings.language")}</Text></Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.brandSecondary },
  hero: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  logo: { fontSize: 52, fontWeight: "900", color: c.onBrand, letterSpacing: 3 },
  tag: { fontSize: 22, color: c.onBrand, fontFamily: serif, marginTop: 4, lineHeight: 32 },
  sub: { fontSize: 15, color: c.darkMuted, marginTop: 6, lineHeight: 22 },
  card: { marginHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, lineHeight: 30 },
  err: { color: c.error, fontSize: 14, lineHeight: 20 },
  link: { color: c.brandPrimary, fontWeight: "600", textAlign: "center", fontSize: 15, lineHeight: 22 },
  demo: { color: c.muted, fontSize: 12, textAlign: "center" },
}));
