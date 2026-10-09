import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTranslation } from "react-i18next";
import { makeStyles, radius, spacing, useTheme, shadow } from "@/src/theme";
import { imageSrc, ApiError } from "@/src/api";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export const Icon = ({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) => {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.onSurface} />;
};

export function Avatar({ uri, name, size = 48, ring, testID }: { uri?: string | null; name?: string; size?: number; ring?: "unseen" | "seen" | null; testID?: string }) {
  const { colors } = useTheme();
  const src = imageSrc(uri);
  const inner = size - (ring ? 6 : 0);
  return (
    <View testID={testID} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring === "unseen" ? colors.accent : colors.border, alignItems: "center", justifyContent: "center" }}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.surfaceTertiary }} contentFit="cover" />
      ) : (
        <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.onBrandTertiary, fontWeight: "700", fontSize: inner * 0.38 }}>{(name ?? "?").trim().charAt(0).toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

export function Chip({ label, active, onPress, testID, dark, badge }: { label: string; active: boolean; onPress: () => void; testID?: string; dark?: boolean; badge?: number }) {
  const { colors } = useTheme();
  const bg = active ? (dark ? colors.surfaceSecondary : colors.brandPrimary) : dark ? colors.darkCard : colors.surfaceSecondary;
  const fg = active ? (dark ? colors.brandPrimary : colors.onBrandPrimary) : dark ? colors.onDark : colors.onSurface;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={({ pressed }) => [chipS.chip, { backgroundColor: bg, borderColor: active ? bg : dark ? colors.darkCard : colors.border, opacity: pressed ? 0.8 : 1 }]}>
      <Text style={[chipS.label, { color: fg }]} numberOfLines={1}>{label}</Text>
      {!!badge && <View style={[chipS.badge, { backgroundColor: colors.accent }]}><Text style={{ color: colors.onAccent, fontSize: 11, fontWeight: "700" }}>{badge}</Text></View>}
    </Pressable>
  );
}
export function ChipRow({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 56 }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" }}>
      {children}
    </ScrollView>
  );
}
const chipS = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  label: { fontSize: 14, fontWeight: "600" },
  badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
});

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, testID, style }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; disabled?: boolean; icon?: IconName; testID?: string; style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.brandPrimary, secondary: colors.brandTertiary, ghost: "transparent", danger: colors.error }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandTertiary, ghost: colors.brandPrimary, danger: colors.onError }[variant];
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled || loading} accessibilityRole="button"
      style={({ pressed }) => [{ minHeight: 52, borderRadius: radius.pill, backgroundColor: bg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 20, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>
        <Text style={{ color: fg, fontSize: 16, fontWeight: "700", textAlign: "center", flexShrink: 1 }}>{title}</Text>
        {icon && <Ionicons name={icon} size={18} color={fg} />}
      </>}
    </Pressable>
  );
}

export function IconButton({ name, onPress, testID, color, bg, size = 22, label }: { name: IconName; onPress: () => void; testID?: string; color?: string; bg?: string; size?: number; label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label ?? name} hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: bg ?? "transparent", opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={name} size={size} color={color ?? colors.onSurface} />
    </Pressable>
  );
}

export const Field = React.forwardRef<TextInput, TextInputProps & { label?: string; error?: string }>(function Field({ label, error, style, ...p }, ref) {
  const s = useField();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput ref={ref} placeholderTextColor={colors.muted} style={[s.input, error ? { borderColor: colors.error } : null, style]} {...p} />
      {error && <Text style={{ color: colors.error, fontSize: 13 }}>{error}</Text>}
    </View>
  );
});
const useField = makeStyles((c) => ({
  label: { color: c.muted, fontSize: 13, fontWeight: "600" },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: c.onSurface },
}));

export function StateView({ loading, error, empty, onRetry, emptyTitle, emptyHint, emptyAction, emptyIcon = "chatbubbles-outline", dark, testID }: {
  loading?: boolean; error?: unknown; empty?: boolean; onRetry?: () => void; emptyTitle?: string; emptyHint?: string; emptyAction?: { label: string; onPress: () => void }; emptyIcon?: IconName; dark?: boolean; testID?: string;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const fg = dark ? colors.onDark : colors.onSurface;
  if (loading) return <View testID={`${testID}-loading`} style={{ padding: 48, alignItems: "center" }}><ActivityIndicator color={dark ? colors.onDark : colors.brandPrimary} /></View>;
  if (error) return (
    <View testID={`${testID}-error`} style={{ padding: 32, alignItems: "center", gap: 12 }}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
      <Text style={{ color: fg, fontSize: 16, textAlign: "center" }}>{errorText(error, t)}</Text>
      {onRetry && <Button testID={`${testID}-retry`} title={t("common.retry")} onPress={onRetry} variant="secondary" />}
    </View>
  );
  if (empty) return (
    <View testID={`${testID}-empty`} style={{ padding: 32, alignItems: "center", gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: dark ? colors.darkCard : colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={emptyIcon} size={32} color={dark ? colors.onDark : colors.brandPrimary} />
      </View>
      {emptyTitle && <Text style={{ color: fg, fontSize: 18, fontWeight: "700", textAlign: "center" }}>{emptyTitle}</Text>}
      {emptyHint && <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center" }}>{emptyHint}</Text>}
      {emptyAction && <Button testID={`${testID}-empty-action`} title={emptyAction.label} onPress={emptyAction.onPress} style={{ marginTop: 8 }} />}
    </View>
  );
  return null;
}

export function errorText(e: unknown, t: (k: string, o?: any) => string) {
  if (e instanceof ApiError) return t(`errors.${e.code}`, { defaultValue: e.status === 0 ? t("errors.offline") : t("errors.generic") });
  return t("errors.generic");
}

// Bottom sheet modal (mounted at screen root so it overlays tabs).
export function Sheet({ visible, onClose, children, title, testID }: { visible: boolean; onClose: () => void; children: React.ReactNode; title?: string; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={onClose} testID={`${testID}-backdrop`} />
      <View testID={testID} style={{ backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: insets.bottom + spacing.lg, maxHeight: "85%" }}>
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10 }} />
        {title && <Text style={{ fontSize: 18, fontWeight: "700", color: colors.onSurface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm }}>{title}</Text>}
        {children}
      </View>
    </Modal>
  );
}

export function SheetRow({ icon, label, onPress, danger, testID, right }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; testID?: string; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: spacing.lg, minHeight: 52, backgroundColor: pressed ? colors.surfaceTertiary : "transparent" })}>
      <Ionicons name={icon} size={22} color={danger ? colors.error : colors.onSurface} />
      <Text style={{ flex: 1, fontSize: 16, color: danger ? colors.error : colors.onSurface }}>{label}</Text>
      {right}
    </Pressable>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  const { colors } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow }, style]}>{children}</View>;
}

// ---- Toasts ----
const ToastCtx = createContext<(msg: string, kind?: "info" | "error" | "success") => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const show = useCallback((msg: string, kind: "info" | "error" | "success" = "info") => {
    setToast({ msg, kind, id: Date.now() });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const bg = toast?.kind === "error" ? colors.error : toast?.kind === "success" ? colors.success : colors.surfaceInverse;
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View key={toast.id} entering={FadeInUp} exiting={FadeOutUp} pointerEvents="none" testID="toast"
          style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, backgroundColor: bg, borderRadius: radius.md, padding: 14, ...shadow }}>
          <Text testID="toast-text" style={{ color: toast.kind === "info" ? colors.onSurfaceInverse : colors.onError, fontSize: 15, fontWeight: "600" }}>{toast.msg}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}
