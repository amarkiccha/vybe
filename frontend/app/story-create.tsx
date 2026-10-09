import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Field, Icon, IconButton, useToast, errorText } from "@/src/components/ui";
import { radius, serif, spacing, useTheme } from "@/src/theme";

const BGS = ["#6E0901", "#3B0908", "#23845B", "#1F3A5F", "#B8770F", "#241C1A"];
export const AUDIENCES = ["contacts", "close_friends", "everyone"] as const;

export function AudiencePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const hint = { contacts: "stories.audienceContactsHint", close_friends: "stories.audienceCloseHint", everyone: "stories.audienceEveryoneHint" } as const;
  const label = { contacts: "stories.contacts", close_friends: "stories.closeFriends", everyone: "stories.everyone" } as const;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontWeight: "800", color: colors.onSurface, fontSize: 15 }}>{t("stories.audience")}</Text>
      {AUDIENCES.map((a) => (
        <Pressable key={a} testID={`audience-${a}`} onPress={() => onChange(a)} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: value === a ? colors.brandPrimary : colors.border, backgroundColor: colors.surfaceSecondary }}>
          <Icon name={value === a ? "radio-button-on" : "radio-button-off"} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "700", lineHeight: 22 }}>{t(label[a])}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{t(hint[a])}</Text></View>
        </Pressable>
      ))}
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{t("stories.expires")} · {t("stories.privacyNote")}</Text>
    </View>
  );
}

export default function StoryCreate() {
  const params = useLocalSearchParams<{ gallery?: string; uri?: string; mediaType?: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BGS[0]);
  const [location, setLocation] = useState("");
  const [media, setMedia] = useState<{ uri: string; type: "image" | "video"; mime: string; name: string } | null>(params.uri ? { uri: params.uri, type: params.mediaType === "video" ? "video" : "image", mime: params.mediaType === "video" ? "video/mp4" : "image/jpeg", name: params.mediaType === "video" ? "snap.mp4" : "snap.jpg" } : null);
  const [audience, setAudience] = useState<string>(user?.privacy.storyAudience ?? "contacts");
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast(t("camera.permissionBody"), "error");
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8, allowsEditing: true, videoMaxDuration: 30 });
    if (r.canceled) return;
    const a = r.assets[0];
    const isV = a.type === "video";
    setMedia({ uri: a.uri, type: isV ? "video" : "image", mime: a.mimeType ?? (isV ? "video/mp4" : "image/jpeg"), name: a.fileName ?? (isV ? "story.mp4" : "story.jpg") });
  };
  useEffect(() => { if (params.gallery === "1") pick(); }, []);

  const post = async () => {
    if (!media && !text.trim()) return;
    setBusy(true);
    try {
      let mediaId: string | undefined;
      if (media) mediaId = (await uploadFile(media.uri, media.name, media.mime)).id;
      await api("/stories", { body: { type: media ? media.type : "text", text, bg: media ? undefined : bg, mediaId, audience, location: location || undefined } });
      qc.invalidateQueries({ queryKey: ["stories"] });
      router.dismissAll?.();
      router.replace("/(tabs)/stories");
    } catch (e) { toast(errorText(e, t), "error"); } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="story-create-screen">
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: insets.top + 4, paddingHorizontal: 4 }}>
        <IconButton testID="story-create-back" name="close" onPress={() => router.back()} />
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "800", color: colors.onSurface }}>{t("stories.create")}</Text>
        <IconButton testID="story-create-camera" name="camera-outline" onPress={() => router.replace("/camera")} label={t("stories.snapCamera")} />
        <IconButton testID="story-create-gallery" name="images-outline" onPress={pick} label={t("stories.fromGallery")} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ height: 320, borderRadius: radius.lg, overflow: "hidden", backgroundColor: media ? colors.dark : bg, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          {media?.type === "image" ? <Image source={{ uri: media.uri }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} contentFit="cover" />
            : media ? <Icon name="videocam" size={56} color={colors.onDark} /> : null}
          <TextInput testID="story-text-input" value={text} onChangeText={setText} placeholder={t("stories.typeSomething")} placeholderTextColor="rgba(245,240,232,0.6)" multiline maxLength={500}
            style={{ color: colors.onDark, fontSize: media ? 20 : 28, fontFamily: serif, textAlign: "center", width: "100%", textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: media ? 6 : 0 }} />
          {media && <View style={{ position: "absolute", top: 8, right: 8 }}><IconButton testID="story-remove-media" name="close-circle" color={colors.onDark} onPress={() => setMedia(null)} /></View>}
        </View>
        {!media && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {BGS.map((b) => <Pressable key={b} testID={`story-bg-${b}`} onPress={() => setBg(b)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: b, borderWidth: bg === b ? 3 : 0, borderColor: colors.onSurface }} />)}
          </ScrollView>
        )}
        <Field testID="story-location-input" placeholder="📍 Location" value={location} onChangeText={setLocation} maxLength={60} />
        <AudiencePicker value={audience} onChange={setAudience} />
        <Button testID="story-post-button" title={t("stories.post")} onPress={post} loading={busy} disabled={!media && !text.trim()} />
      </KeyboardAwareScrollView>
    </View>
  );
}
