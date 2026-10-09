// VYBE design tokens (keys match design_guidelines.json "color"/"colorDark").
import { useMemo } from "react";
import { Appearance, Platform, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F5F0E8",
  onSurface: "#241C1A",
  surfaceSecondary: "#FFFCF7",
  onSurfaceSecondary: "#241C1A",
  surfaceTertiary: "#EFE6DC",
  onSurfaceTertiary: "#241C1A",
  surfaceInverse: "#241C1A",
  onSurfaceInverse: "#F5F0E8",
  muted: "#77716D",
  brand: "#6E0901",
  onBrand: "#F5F0E8",
  brandPrimary: "#6E0901",
  onBrandPrimary: "#F5F0E8",
  brandSecondary: "#3B0908",
  onBrandSecondary: "#F5F0E8",
  brandTertiary: "#F3E3DC",
  onBrandTertiary: "#6E0901",
  accent: "#C2261A",
  onAccent: "#FFFFFF",
  dark: "#1A0A0A",
  onDark: "#F5F0E8",
  darkCard: "#2A1412",
  darkMuted: "#B3A69F",
  success: "#23845B",
  onSuccess: "#FFFFFF",
  warning: "#B8770F",
  onWarning: "#241C1A",
  error: "#C93434",
  onError: "#FFFFFF",
  info: "#77716D",
  onInfo: "#FFFFFF",
  bubbleMine: "#6E0901",
  onBubbleMine: "#F5F0E8",
  bubbleOther: "#FFFCF7",
  onBubbleOther: "#241C1A",
  scrim: "rgba(20,8,6,0.55)",
  border: "#E9DED4",
  borderStrong: "#3B0908",
  divider: "#E9DED4",
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  ...light,
  surface: "#1A0A0A",
  onSurface: "#F5F0E8",
  surfaceSecondary: "#241C1A",
  onSurfaceSecondary: "#F5F0E8",
  surfaceTertiary: "#33201D",
  onSurfaceTertiary: "#F5F0E8",
  surfaceInverse: "#F5F0E8",
  onSurfaceInverse: "#1A0A0A",
  muted: "#A59D96",
  brandTertiary: "#3B0908",
  onBrandTertiary: "#F5C9BF",
  dark: "#120606",
  darkCard: "#241C1A",
  bubbleMine: "#6E0901",
  bubbleOther: "#2E2220",
  onBubbleOther: "#F5F0E8",
  border: "#3B2A26",
  borderStrong: "#6E0901",
  divider: "#33201D",
};

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "dark" || system === "light" ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
// System font: renders Kannada/Devanagari/Tamil/etc. with native glyph fallback.
export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" });
export const shadow = {
  shadowColor: "#3B0908",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
