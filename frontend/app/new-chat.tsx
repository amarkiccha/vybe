import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, type Conversation, type User } from "@/src/api";
import { Avatar, Button, Field, Icon, IconButton, StateView, useToast, errorText } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function NewChat() {
  const params = useLocalSearchParams<{ group?: string; addTo?: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const toast = useToast();
  const [group, setGroup] = useState(params.group === "1" || !!params.addTo);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const users = useQuery({ queryKey: ["users", q], queryFn: () => api<{ users: User[] }>(`/users/search?q=${encodeURIComponent(q)}`) });

  const openDirect = async (u: User) => {
    try {
      const r = await api<{ conversation: Conversation }>("/conversations", { body: { type: "direct", userId: u.id } });
      router.replace(`/chat/${r.conversation.id}`);
    } catch (e) { toast(errorText(e, t), "error"); }
  };
  const create = async () => {
    setBusy(true);
    try {
      if (params.addTo) {
        await api(`/conversations/${params.addTo}/members`, { body: { userIds: sel.map((u) => u.id) } });
        router.back();
      } else {
        const r = await api<{ conversation: Conversation }>("/conversations", { body: { type: "group", name: name.trim(), memberIds: sel.map((u) => u.id) } });
        router.replace(`/chat/${r.conversation.id}`);
      }
    } catch (e) { toast(errorText(e, t), "error"); } finally { setBusy(false); }
  };

  return (
    <View style={s.root} testID="new-chat-screen">
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <IconButton testID="new-chat-back" name="chevron-back" onPress={() => router.back()} />
        <Text style={s.title}>{params.addTo ? t("chatInfo.addMembers") : group ? t("chats.newGroup") : t("chats.newChat")}</Text>
      </View>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        {group && !params.addTo && <Field testID="new-group-name-input" placeholder={t("chats.groupName")} value={name} onChangeText={setName} />}
        <View style={s.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput testID="new-chat-search-input" value={q} onChangeText={setQ} placeholder={t("chats.searchPeople")} placeholderTextColor={colors.muted} style={s.input} autoFocus={!group} />
        </View>
        {!group && (
          <Pressable testID="new-chat-group-toggle" onPress={() => setGroup(true)} style={s.groupBtn}>
            <View style={s.groupIcon}><Icon name="people" color={colors.onBrandPrimary} size={20} /></View>
            <Text style={s.name}>{t("chats.newGroup")}</Text>
          </Pressable>
        )}
        {group && !!sel.length && <Text style={{ color: colors.muted }}>{sel.map((u) => u.name).join(", ")}</Text>}
      </View>
      <FlatList data={users.data?.users ?? []} keyExtractor={(u) => u.id} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<StateView testID="new-chat-users" loading={users.isLoading} error={users.error} onRetry={users.refetch} empty emptyIcon="person-outline" emptyTitle={t("chats.searchPeople")} />}
        renderItem={({ item }) => {
          const on = sel.some((u) => u.id === item.id);
          return (
            <Pressable testID={`user-row-${item.id}`} onPress={() => (group ? setSel(on ? sel.filter((u) => u.id !== item.id) : [...sel, item]) : openDirect(item))} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
              <Avatar uri={item.avatar} name={item.name} size={46} />
              <View style={{ flex: 1 }}><Text style={s.name}>{item.name}</Text>{!!item.username && <Text style={s.sub}>@{item.username}</Text>}</View>
              {group && <Icon name={on ? "checkmark-circle" : "ellipse-outline"} color={on ? colors.brandPrimary : colors.muted} />}
            </Pressable>
          );
        }}
      />
      {group && (
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="new-group-create-button" title={params.addTo ? t("common.add") : t("common.create")} onPress={create} loading={busy} disabled={!sel.length || (!params.addTo && !name.trim())} />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "800", color: c.onSurface, lineHeight: 30 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: c.onSurface, paddingVertical: 12 },
  groupBtn: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52 },
  groupIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  name: { fontSize: 16, fontWeight: "700", color: c.onSurface, lineHeight: 24 },
  sub: { fontSize: 13, color: c.muted },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
