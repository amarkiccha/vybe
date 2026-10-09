import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, mediaUrl, type StoryGroup, type User } from "@/src/api";
import { timeAgo } from "@/src/i18n";
import { Avatar, Button, Field, IconButton, Sheet, SheetRow, useToast, errorText } from "@/src/components/ui";
import { REACTIONS } from "@/src/components/chat";
import { radius, serif, spacing, useTheme } from "@/src/theme";

const DURATION = 5000;

function StoryVideo({ id }: { id: string }) {
  const player = useVideoPlayer(mediaUrl(id) ?? null, (p) => { p.loop = false; p.play(); });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />;
}

export default function StoryViewer() {
  const { userId, scope } = useLocalSearchParams<{ userId: string; scope?: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ["stories", scope ?? "all"], queryFn: () => api<{ groups: StoryGroup[] }>(`/stories/feed?scope=${scope ?? "all"}`) });
  const group = feed.data?.groups.find((g) => g.user.id === userId);
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [menu, setMenu] = useState(false);
  const [viewers, setViewers] = useState<(User & { reaction?: string })[] | null>(null);
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("");
  const startIdx = useRef(false);
  const story = group?.stories[idx];

  useEffect(() => {
    if (group && !startIdx.current) { startIdx.current = true; const first = group.stories.findIndex((s) => !s.viewed); setIdx(first > 0 ? first : 0); }
  }, [group]);
  useEffect(() => {
    if (!story) return;
    setProgress(0);
    if (!group?.isMine && !story.viewed) api(`/stories/${story.id}/view`, { method: "POST" }).catch(() => {});
  }, [story?.id]);
  useEffect(() => {
    if (!story || paused) return;
    const dur = story.type === "video" ? Math.max(5000, (story.media?.duration ?? 15) * 1000) : DURATION;
    const iv = setInterval(() => setProgress((p) => {
      const n = p + 100 / dur;
      if (n >= 1) { next(); return 0; }
      return n;
    }), 100);
    return () => clearInterval(iv);
  }, [story?.id, paused]);

  const close = () => { qc.invalidateQueries({ queryKey: ["stories"] }); router.back(); };
  const next = () => { if (!group) return; if (idx < group.stories.length - 1) setIdx((i) => i + 1); else close(); };
  const prev = () => setIdx((i) => Math.max(0, i - 1));
  const run = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) toast(ok, "success"); } catch (e) { toast(errorText(e, t), "error"); } };

  if (!group || !story) {
    return <View style={{ flex: 1, backgroundColor: colors.dark, paddingTop: insets.top }}><IconButton testID="story-close" name="close" color={colors.onDark} onPress={close} /></View>;
  }
  const uri = story.externalUrl ?? (story.type === "image" ? mediaUrl(story.media?.id) : undefined);
  const audienceLabel = story.audience === "everyone" ? t("stories.everyone") : story.audience === "close_friends" ? t("stories.closeFriends") : t("stories.contacts");

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.dark }} testID="story-viewer-screen">
      <View style={{ flex: 1 }}>
        {story.type === "video" && story.media ? <StoryVideo key={story.id} id={story.media.id} />
          : uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" />
          : <View style={{ flex: 1, backgroundColor: story.bg ?? colors.brandPrimary, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
              <Text style={{ color: colors.onDark, fontSize: 32, fontFamily: serif, textAlign: "center", lineHeight: 44 }} testID="story-text">{story.text}</Text>
            </View>}
        {story.type !== "text" && !!story.text && <Text style={{ position: "absolute", bottom: 120, left: 20, right: 20, color: colors.onDark, fontSize: 22, fontWeight: "700", textAlign: "center", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 8 }}>{story.text}</Text>}
        <View style={{ position: "absolute", inset: 0, flexDirection: "row" }}>
          <Pressable testID="story-prev" style={{ flex: 1 }} onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
          <Pressable testID="story-next" style={{ flex: 2 }} onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
        </View>
        <View style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {group.stories.map((s, i) => (
              <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" }}>
                <View style={{ height: 3, backgroundColor: colors.onDark, width: `${(i < idx ? 1 : i === idx ? progress : 0) * 100}%` }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar uri={group.user.avatar} name={group.user.name} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onDark, fontWeight: "700" }}>{group.isMine ? t("chats.myStory") : group.user.name}</Text>
              <Text style={{ color: colors.onDark, opacity: 0.8, fontSize: 12 }}>{story.location ? `${story.location} · ` : ""}{timeAgo(story.createdAt)} · {audienceLabel}</Text>
            </View>
            <IconButton testID="story-menu" name="ellipsis-horizontal" color={colors.onDark} onPress={() => { setPaused(true); setMenu(true); }} />
            <IconButton testID="story-close" name="close" color={colors.onDark} onPress={close} />
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, gap: spacing.sm }}>
        {group.isMine ? (
          <Pressable testID="story-viewers-button" onPress={() => { setPaused(true); api<{ viewers: any[] }>(`/stories/${story.id}/viewers`).then((r) => setViewers(r.viewers)).catch(() => setViewers([])); }} style={{ minHeight: 44, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: colors.onDark, fontWeight: "700" }}>👁 {t("stories.views", { count: story.viewCount })}</Text>
          </Pressable>
        ) : (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              {REACTIONS.map((e) => <Pressable key={e} testID={`story-react-${e}`} onPress={() => run(() => api(`/stories/${story.id}/react`, { body: { emoji: e } }), e)} style={{ padding: 6 }}><Text style={{ fontSize: 26 }}>{e}</Text></Pressable>)}
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput testID="story-reply-input" value={reply} onChangeText={setReply} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} placeholder={t("stories.replyPlaceholder")} placeholderTextColor={colors.darkMuted}
                style={{ flex: 1, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", color: colors.onDark, paddingHorizontal: 16, fontSize: 15 }} />
              <IconButton testID="story-reply-send" name="send" color={colors.onAccent} bg={colors.accent} onPress={() => reply.trim() && run(async () => { await api(`/stories/${story.id}/reply`, { body: { text: reply } }); setReply(""); }, t("common.send"))} />
            </View>
          </>
        )}
      </View>
      <Sheet visible={menu} onClose={() => { setMenu(false); setPaused(false); }} testID="story-menu-sheet">
        <Text style={{ color: colors.muted, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, lineHeight: 20 }}>{t("stories.privacyNote")}</Text>
        {group.isMine ? <SheetRow testID="story-delete" danger icon="trash-outline" label={t("stories.deleteStory")} onPress={() => run(async () => { await api(`/stories/${story.id}`, { method: "DELETE" }); setMenu(false); close(); })} /> : <>
          <SheetRow testID="story-mute" icon="volume-mute-outline" label={t("stories.muteUser")} onPress={() => run(async () => { await api(`/users/${group.user.id}/mute-stories`, { body: { muted: true } }); setMenu(false); close(); })} />
          <SheetRow testID="story-report" danger icon="flag-outline" label={t("common.report")} onPress={() => { setMenu(false); setReport(true); }} />
        </>}
      </Sheet>
      <Sheet visible={!!viewers} onClose={() => { setViewers(null); setPaused(false); }} title={t("stories.viewers")} testID="story-viewers-sheet">
        {viewers?.map((v) => <SheetRow key={v.id} icon="person-outline" label={v.name} onPress={() => {}} right={<Text style={{ fontSize: 20 }}>{v.reaction ?? ""}</Text>} />)}
      </Sheet>
      <Sheet visible={report} onClose={() => { setReport(false); setPaused(false); }} title={t("common.report")} testID="story-report-sheet">
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Field testID="story-report-reason" placeholder={t("common.reportReason")} value={reason} onChangeText={setReason} />
          <Button testID="story-report-submit" title={t("common.report")} variant="danger" onPress={() => run(async () => { await api("/reports", { body: { targetType: "story", targetId: story.id, reason: reason || "inappropriate" } }); setReport(false); }, t("common.reported"))} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
