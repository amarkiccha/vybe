import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, imageSrc, mediaUrl, type StoryGroup } from "@/src/api";
import { useAuth } from "@/src/auth";
import { formatNumber, timeAgo } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { Avatar, Chip, ChipRow, Icon, IconButton, Sheet, SheetRow, StateView } from "@/src/components/ui";
import { makeStyles, radius, serif, spacing, useTheme } from "@/src/theme";

const SCOPES = ["all", "friends", "explore"] as const;

export function StoryThumb({ g, tall, scope }: { g: StoryGroup; tall?: boolean; scope: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const st = g.stories[g.stories.length - 1];
  const uri = st.externalUrl ?? (st.type === "image" ? mediaUrl(st.media?.id) : undefined);
  return (
    <Pressable testID={`story-card-${g.user.id}`} onPress={() => router.push(`/story/${g.user.id}?scope=${scope}`)} style={[s.card, { height: tall ? 300 : 180 }]}>
      {uri ? <Image source={{ uri }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} contentFit="cover" transition={200} />
        : <View style={{ position: "absolute", inset: 0, backgroundColor: st.bg ?? colors.brandPrimary, alignItems: "center", justifyContent: "center", padding: 12 }}>
            {st.type === "video" ? <Icon name="play-circle" size={44} color={colors.onDark} /> : <Text style={{ color: colors.onDark, fontFamily: serif, fontSize: tall ? 26 : 18, textAlign: "center", lineHeight: tall ? 36 : 26 }} numberOfLines={4}>{st.text}</Text>}
          </View>}
      <LinearGradient colors={["rgba(0,0,0,0.45)", "transparent", "rgba(0,0,0,0.7)"]} style={{ position: "absolute", inset: 0 }} />
      <View style={s.cardTop}>
        <Avatar uri={g.user.avatar} name={g.user.name} size={28} ring={g.hasUnseen ? "unseen" : null} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardName} numberOfLines={1}>{st.location ?? g.user.name}</Text>
          <Text style={s.cardMeta}>{timeAgo(st.createdAt)}</Text>
        </View>
      </View>
      <View style={s.cardBottom}>
        {st.type !== "text" && !!st.text && <Text style={s.cardCaption} numberOfLines={1}>{st.text}</Text>}
        {g.isMine && <View style={s.views}><Icon name="eye-outline" size={14} color={colors.onDark} /><Text style={s.cardMeta}>{formatNumber(st.viewCount)}</Text></View>}
      </View>
    </Pressable>
  );
}

export default function Stories() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("all");
  const [search, setSearch] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const q = useQuery({ queryKey: ["stories", scope], queryFn: () => api<{ groups: StoryGroup[] }>(`/stories/feed?scope=${scope}`), refetchInterval: 30000 });
  const groups = (q.data?.groups ?? []).filter((g) => !search || g.user.name.toLowerCase().includes(search.toLowerCase()));
  const mine = groups.find((g) => g.isMine);
  const left = groups.filter((_, i) => i % 2 === 0);
  const right = groups.filter((_, i) => i % 2 === 1);

  return (
    <View style={s.root} testID="stories-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={s.title} accessibilityRole="header">{t("stories.title")}</Text>
        <IconButton testID="stories-search-button" name="search" color={colors.onDark} onPress={() => setSearch(search === null ? "" : null)} label={t("common.search")} />
        <IconButton testID="stories-create-button" name="add" color={colors.onAccent} bg={colors.accent} onPress={() => setMenu(true)} label={t("stories.create")} />
      </View>
      {search !== null && (
        <View style={s.search}><Icon name="search" size={18} color={colors.darkMuted} />
          <TextInput testID="stories-search-input" autoFocus value={search} onChangeText={setSearch} placeholder={t("common.search")} placeholderTextColor={colors.darkMuted} style={{ flex: 1, color: colors.onDark, fontSize: 15, paddingVertical: 10 }} />
        </View>
      )}
      <ScrollView refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.onDark} />} contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }} stickyHeaderIndices={[1]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
          <Pressable testID="stories-my-story" style={s.avItem} onPress={() => (mine ? router.push(`/story/${mine.user.id}`) : router.push("/story-create"))}>
            <View><Avatar uri={user?.avatar} name={user?.name} size={64} ring={mine ? "seen" : null} />
              {!mine && <View style={s.plus}><Icon name="add" size={14} color={colors.onAccent} /></View>}</View>
            <Text style={s.avName} numberOfLines={1}>{t("chats.myStory")}</Text>
          </Pressable>
          {groups.filter((g) => !g.isMine).map((g) => (
            <Pressable key={g.user.id} testID={`stories-avatar-${g.user.id}`} style={s.avItem} onPress={() => router.push(`/story/${g.user.id}?scope=${scope}`)}>
              <Avatar uri={g.user.avatar} name={g.user.name} size={64} ring={g.hasUnseen ? "unseen" : "seen"} />
              <Text style={s.avName} numberOfLines={1}>{g.user.name.split(" ")[0]}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ backgroundColor: colors.dark }}>
          <ChipRow testID="stories-scope-row">
            {SCOPES.map((sc) => <Chip key={sc} dark testID={`stories-scope-${sc}`} label={t(sc === "all" ? "chats.all" : `stories.${sc}`)} active={scope === sc} onPress={() => setScope(sc)} />)}
          </ChipRow>
        </View>
        {groups.length === 0 ? (
          <StateView dark testID="stories" loading={q.isLoading} error={q.error} onRetry={q.refetch} empty emptyIcon="aperture-outline" emptyTitle={t("stories.empty")} emptyHint={t("stories.emptyHint")} emptyAction={{ label: t("stories.addFirst"), onPress: () => setMenu(true) }} />
        ) : (
          <View style={s.grid}>
            <View style={s.col}>{left.map((g, i) => <StoryThumb key={g.user.id} g={g} tall={i % 2 === 0} scope={scope} />)}</View>
            <View style={s.col}>{right.map((g, i) => <StoryThumb key={g.user.id} g={g} tall={i % 2 === 1} scope={scope} />)}</View>
          </View>
        )}
      </ScrollView>
      <Sheet visible={menu} onClose={() => setMenu(false)} title={t("stories.create")} testID="stories-create-sheet">
        <SheetRow testID="stories-create-camera" icon="camera-outline" label={t("stories.snapCamera")} onPress={() => { setMenu(false); router.push("/camera"); }} />
        <SheetRow testID="stories-create-text" icon="text-outline" label={t("stories.text")} onPress={() => { setMenu(false); router.push("/story-create"); }} />
        <SheetRow testID="stories-create-gallery" icon="images-outline" label={t("stories.fromGallery")} onPress={() => { setMenu(false); router.push("/story-create?gallery=1"); }} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.dark },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: 4, paddingBottom: spacing.sm },
  title: { flex: 1, fontSize: 30, fontFamily: serif, color: c.onDark, lineHeight: 40 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: spacing.lg, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.darkCard, marginBottom: spacing.sm },
  avItem: { alignItems: "center", width: 70, gap: 4 },
  avName: { color: c.onDark, fontSize: 12, maxWidth: 70 },
  plus: { position: "absolute", right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.dark },
  grid: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  col: { flex: 1, gap: spacing.md },
  card: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.darkCard, justifyContent: "space-between" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md },
  cardName: { color: c.onDark, fontWeight: "700", fontSize: 14 },
  cardMeta: { color: c.onDark, fontSize: 12, opacity: 0.85 },
  cardBottom: { padding: spacing.md, gap: 4 },
  cardCaption: { color: c.onDark, fontSize: 16, fontWeight: "700" },
  views: { flexDirection: "row", gap: 4, alignItems: "center" },
}));
export { imageSrc };
