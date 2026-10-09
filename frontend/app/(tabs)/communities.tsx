import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { api, imageSrc, type Community } from "@/src/api";
import { formatNumber } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { Chip, ChipRow, Icon, IconButton, StateView, useToast, errorText } from "@/src/components/ui";
import { makeStyles, radius, serif, shadow, spacing, useTheme } from "@/src/theme";

const CATS = ["forYou", "learning", "tech", "jobs", "creators", "business", "lifestyle"] as const;
const HERO = "https://images.unsplash.com/photo-1681949103006-70066fb25dfe?w=900&q=70";

export function CommunityRow({ c }: { c: Community }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useStyles();
  const qc = useQueryClient();
  const toast = useToast();
  const join = useMutation({
    mutationFn: () => api(`/communities/${c.id}/join`, { method: "POST" }),
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); qc.invalidateQueries({ queryKey: ["communities"] }); },
    onError: (e) => toast(errorText(e, t), "error"),
  });
  const member = c.myStatus === "active";
  const pending = c.myStatus === "pending";
  return (
    <Pressable testID={`community-row-${c.id}`} onPress={() => router.push(`/community/${c.id}`)} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}>
      <View style={s.icon}>{c.icon || c.cover ? <Image source={{ uri: imageSrc(c.icon ?? c.cover) }} style={{ width: 56, height: 56 }} contentFit="cover" /> : <Icon name="people" color={colors.brandPrimary} />}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.name} numberOfLines={1}>{c.name}</Text>
          {c.isPrivate && <Icon name="lock-closed" size={13} color={colors.muted} />}
        </View>
        <Text style={s.meta}>{t("common.members", { count: c.memberCount, formatted: formatNumber(c.memberCount) }).replace(String(c.memberCount), formatNumber(c.memberCount))}</Text>
        <Text style={s.desc} numberOfLines={2}>{c.description}</Text>
      </View>
      <Pressable testID={`community-join-${c.id}`} disabled={pending || join.isPending} onPress={() => (member ? router.push(`/community/${c.id}`) : join.mutate())}
        style={[s.pill, member ? { backgroundColor: colors.brandTertiary } : pending ? { backgroundColor: colors.surfaceTertiary } : { backgroundColor: colors.brandPrimary }]}>
        <Text style={[s.pillText, { color: member ? colors.onBrandTertiary : pending ? colors.muted : colors.onBrandPrimary }]} numberOfLines={1}>
          {member ? t("common.open") : pending ? t("common.requested") : t("common.join")}
        </Text>
      </Pressable>
    </Pressable>
  );
}

export default function Communities() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const [cat, setCat] = useState<(typeof CATS)[number]>("forYou");
  const [search, setSearch] = useState<string | null>(null);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const category = cat === "forYou" ? "" : cat;
  const list = useQuery({ queryKey: ["communities", "list", category, search ?? ""], queryFn: () => api<{ communities: Community[] }>(`/communities?category=${category}&q=${encodeURIComponent(search ?? "")}`) });
  const mine = useQuery({ queryKey: ["communities", "mine"], queryFn: () => api<{ communities: Community[] }>("/communities/mine") });
  const recommended = (list.data?.communities ?? []).filter((c) => c.myStatus !== "active");

  return (
    <View style={s.root} testID="communities-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={s.topRow}>
          <Text style={s.title} accessibilityRole="header">{t("communities.title")}</Text>
          <IconButton testID="communities-search-button" name="search" color={colors.onDark} onPress={() => setSearch(search === null ? "" : null)} label={t("common.search")} />
          <IconButton testID="communities-create-button" name="add" color={colors.onAccent} bg={colors.accent} onPress={() => router.push("/community-create")} label={t("communities.create")} />
        </View>
        {search !== null && (
          <View style={s.search}><Icon name="search" size={18} color={colors.darkMuted} />
            <TextInput testID="communities-search-input" autoFocus value={search} onChangeText={setSearch} placeholder={t("communities.searchPlaceholder")} placeholderTextColor={colors.darkMuted} style={{ flex: 1, color: colors.onDark, fontSize: 15, paddingVertical: 10 }} />
          </View>
        )}
        <ChipRow testID="communities-category-row">
          {CATS.map((c) => <Chip key={c} dark testID={`communities-cat-${c}`} label={t(`communities.${c}`)} active={cat === c} onPress={() => setCat(c)} />)}
        </ChipRow>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { list.refetch(); mine.refetch(); }} tintColor={colors.brandPrimary} />} contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }} style={{ backgroundColor: colors.dark }}>
        {cat === "forYou" && !search && (
          <View style={s.hero} testID="communities-hero">
            <Image source={{ uri: HERO }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} contentFit="cover" />
            <LinearGradient colors={["rgba(26,10,10,0.92)", "rgba(26,10,10,0.35)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", inset: 0 }} />
            <Text style={s.heroTitle}>{t("communities.heroTitle")}</Text>
            <Text style={s.heroBody}>{t("communities.heroBody")}</Text>
            <Pressable testID="communities-explore-button" onPress={() => setSearch("")} style={s.heroBtn}>
              <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>{t("communities.explore")}</Text>
              <Icon name="arrow-forward" size={16} color={colors.brandPrimary} />
            </Pressable>
          </View>
        )}
        <View style={s.sheet}>
          {!!mine.data?.communities.length && cat === "forYou" && !search && (
            <>
              <Text style={s.section}>{t("communities.yours")}</Text>
              {mine.data.communities.map((c) => <CommunityRow key={c.id} c={c} />)}
            </>
          )}
          <Text style={s.section}>{search ? t("common.search") : t("communities.recommended")}</Text>
          {recommended.length ? recommended.map((c) => <CommunityRow key={c.id} c={c} />) : (
            <StateView testID="communities" loading={list.isLoading} error={list.error} onRetry={list.refetch} empty emptyIcon="people-outline" emptyTitle={t("communities.empty")} emptyAction={{ label: t("communities.create"), onPress: () => router.push("/community-create") }} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.dark },
  header: { backgroundColor: c.dark },
  topRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: 4 },
  title: { flex: 1, fontSize: 28, fontWeight: "700", color: c.onDark, lineHeight: 38 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.darkCard },
  hero: { marginHorizontal: spacing.lg, marginVertical: spacing.sm, borderRadius: radius.lg, overflow: "hidden", padding: spacing.xl, minHeight: 200, justifyContent: "center", gap: spacing.sm },
  heroTitle: { color: c.onDark, fontSize: 26, fontFamily: serif, lineHeight: 34 },
  heroBody: { color: c.onDark, opacity: 0.85, fontSize: 14, lineHeight: 20, maxWidth: 260 },
  heroBtn: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 6, backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 40, marginTop: spacing.sm },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: spacing.lg, paddingHorizontal: spacing.lg, minHeight: 400, gap: spacing.sm, marginTop: spacing.sm },
  section: { fontSize: 17, fontWeight: "800", color: c.onSurface, marginTop: spacing.sm, lineHeight: 26 },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border, ...shadow, elevation: 1 },
  icon: { width: 56, height: 56, borderRadius: radius.md, overflow: "hidden", backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 16, fontWeight: "700", color: c.onSurface, flexShrink: 1, lineHeight: 24 },
  meta: { fontSize: 12, color: c.muted },
  desc: { fontSize: 13, color: c.muted, lineHeight: 19 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 36, justifyContent: "center", maxWidth: 110 },
  pillText: { fontWeight: "700", fontSize: 14 },
}));
