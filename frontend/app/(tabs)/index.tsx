import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Animated, { FadeInDown } from "react-native-reanimated";
import { api, type Conversation, type StoryGroup } from "@/src/api";
import { useAuth } from "@/src/auth";
import { formatTime } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { Avatar, Chip, ChipRow, Icon, IconButton, StateView } from "@/src/components/ui";
import { makeStyles, radius, shadow, spacing, useTheme } from "@/src/theme";

const FILTERS = ["all", "unread", "groups", "favorites", "requests", "archived"] as const;

export function previewText(c: Conversation, t: (k: string) => string, myId?: string) {
  const lm = c.lastMessage;
  if (!lm) return "";
  const map: Record<string, string> = { image: t("chats.photo"), video: t("chats.video"), audio: t("chats.voice"), file: t("chats.file"), snap: t("chats.snap"), campaign: lm.text };
  const body = lm.type === "system" ? "" : map[lm.type] ?? lm.text;
  return lm.sender === myId ? `${t("common.you")}: ${body}` : body;
}

export default function Chats() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const convs = useQuery({ queryKey: ["conversations", filter, q], queryFn: () => api<{ conversations: Conversation[]; unreadTotal: number }>(`/conversations?filter=${filter}&q=${encodeURIComponent(q)}`), refetchInterval: 4000 });
  const allUnread = useQuery({ queryKey: ["conversations", "unread", ""], queryFn: () => api<{ conversations: Conversation[] }>("/conversations?filter=unread"), refetchInterval: 6000 });
  const stories = useQuery({ queryKey: ["stories", "all"], queryFn: () => api<{ groups: StoryGroup[] }>("/stories/feed?scope=all") });
  const found = useQuery({ queryKey: ["msgsearch", q], queryFn: () => api<{ results: { id: string; conversationId: string; text: string; createdAt: string }[] }>(`/messages/search?q=${encodeURIComponent(q)}`), enabled: q.length >= 2 });

  const mine = stories.data?.groups.find((g) => g.isMine);
  const others = stories.data?.groups.filter((g) => !g.isMine) ?? [];

  const header = (
    <View>
      <View style={s.storyRow}>
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={others} keyExtractor={(g) => g.user.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
          ListHeaderComponent={
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Pressable testID="chats-add-story" style={s.storyItem} onPress={() => router.push("/story-create")}>
                <View style={s.addCircle}><Icon name="add" size={28} color={colors.brandPrimary} /></View>
                <Text style={s.storyName} numberOfLines={1}>{t("chats.addStory")}</Text>
              </Pressable>
              {mine && (
                <Pressable testID="chats-my-story" style={s.storyItem} onPress={() => router.push(`/story/${mine.user.id}`)}>
                  <Avatar uri={user?.avatar} name={user?.name} size={60} ring="seen" />
                  <Text style={s.storyName} numberOfLines={1}>{t("chats.myStory")}</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable testID={`chats-story-${item.user.id}`} style={s.storyItem} onPress={() => router.push(`/story/${item.user.id}`)}>
              <Avatar uri={item.user.avatar} name={item.user.name} size={60} ring={item.hasUnseen ? "unseen" : "seen"} />
              <Text style={s.storyName} numberOfLines={1}>{item.user.name.split(" ")[0]}</Text>
            </Pressable>
          )}
        />
      </View>
      {q.length >= 2 && !!found.data?.results.length && (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={s.section}>{t("chats.messagesFound")}</Text>
          {found.data.results.slice(0, 5).map((m) => (
            <Pressable key={m.id} testID={`chats-search-result-${m.id}`} onPress={() => router.push(`/chat/${m.conversationId}`)} style={s.result}>
              <Icon name="search" size={16} color={colors.muted} />
              <Text style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>{m.text}</Text>
              <Text style={s.time}>{formatTime(m.createdAt)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={s.root} testID="chats-screen">
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={s.topRow}>
          <Pressable testID="chats-profile-button" onPress={() => router.push("/settings")} accessibilityLabel={t("settings.title")}>
            <Avatar uri={user?.avatar} name={user?.name} size={40} />
          </Pressable>
          <Text style={s.logo} accessibilityRole="header">VYBE</Text>
          <View style={{ flexDirection: "row" }}>
            <IconButton testID="chats-new-group-button" name="people-circle-outline" onPress={() => router.push("/new-chat?group=1")} label={t("chats.newGroup")} />
            <IconButton testID="chats-settings-button" name="settings-outline" onPress={() => router.push("/settings")} label={t("settings.title")} />
          </View>
        </View>
        <View style={s.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput testID="chats-search-input" value={q} onChangeText={setQ} placeholder={t("chats.searchPlaceholder")} placeholderTextColor={colors.muted} style={s.searchInput} returnKeyType="search" />
          {!!q && <IconButton name="close-circle" size={18} color={colors.muted} onPress={() => setQ("")} testID="chats-search-clear" />}
        </View>
      </View>
      <ChipRow testID="chats-filter-row">
        {FILTERS.map((f) => (
          <Chip key={f} testID={`chats-filter-${f}`} label={t(`chats.${f}`)} active={filter === f} onPress={() => setFilter(f)} badge={f === "unread" ? allUnread.data?.conversations.length : undefined} />
        ))}
      </ChipRow>
      <FlatList
        testID="chats-list"
        data={convs.data?.conversations ?? []}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={convs.isRefetching && !convs.isLoading} onRefresh={() => { convs.refetch(); stories.refetch(); }} tintColor={colors.brandPrimary} />}
        contentContainerStyle={{ paddingBottom: bottomChrome + 96 }}
        ListEmptyComponent={<StateView testID="chats" loading={convs.isLoading} error={convs.error} onRetry={convs.refetch} empty emptyTitle={t("chats.empty")} emptyHint={t("chats.emptyHint")} emptyAction={{ label: t("chats.startChat"), onPress: () => router.push("/new-chat") }} />}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30)}>
            <Pressable testID={`chat-row-${item.id}`} onPress={() => router.push(`/chat/${item.id}`)} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
              <Avatar uri={item.avatar} name={item.name} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={s.rowTop}>
                  <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                  {item.favorite && <Icon name="heart" size={14} color={colors.accent} />}
                  {item.type === "broadcast" && <Icon name="megaphone" size={14} color={colors.muted} />}
                  <Text style={[s.time, item.unread > 0 && { color: colors.accent, fontWeight: "700" }]}>{formatTime(item.lastMessage?.at)}</Text>
                </View>
                <View style={s.rowTop}>
                  <Text style={s.preview} numberOfLines={1}>{previewText(item, t, user?.id)}</Text>
                  {item.pinned && <Icon name="pin" size={14} color={colors.muted} />}
                  {item.muted && <Icon name="volume-mute" size={14} color={colors.muted} />}
                  {item.unread > 0 && <View style={[s.badge, item.muted && { backgroundColor: colors.muted }]} testID={`chat-row-unread-${item.id}`}><Text style={s.badgeText}>{item.unread}</Text></View>}
                </View>
              </View>
            </Pressable>
          </Animated.View>
        )}
      />
      <Pressable testID="chats-compose-fab" accessibilityLabel={t("chats.newChat")} onPress={() => router.push("/new-chat")}
        style={({ pressed }) => [s.fab, { bottom: bottomChrome + 16, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
        <Icon name="add" size={30} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xs },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { fontSize: 30, fontWeight: "900", letterSpacing: 2, color: c.brandPrimary },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingLeft: 14, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 15, color: c.onSurface, paddingVertical: 10 },
  storyRow: { paddingVertical: spacing.sm },
  storyItem: { alignItems: "center", width: 68, gap: 4 },
  addCircle: { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  storyName: { fontSize: 12, color: c.onSurface, maxWidth: 68 },
  section: { fontSize: 13, color: c.muted, fontWeight: "700" },
  result: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: c.surfaceSecondary, padding: spacing.md, borderRadius: radius.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginHorizontal: spacing.sm, borderRadius: radius.md },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flex: 1, fontSize: 16, fontWeight: "700", color: c.onSurface, lineHeight: 24 },
  preview: { flex: 1, fontSize: 14, color: c.muted, lineHeight: 21 },
  time: { fontSize: 12, color: c.muted },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: c.onAccent, fontSize: 12, fontWeight: "800" },
  fab: { position: "absolute", right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", ...shadow, elevation: 6 },
}));
