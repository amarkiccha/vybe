import { useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from "expo-camera";
import { Image } from "expo-image";
import { captureRef } from "react-native-view-shot";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { api, newClientId, uploadFile } from "@/src/api";
import { Button, Chip, Icon, IconButton, useToast, errorText } from "@/src/components/ui";
import { radius, spacing, useTheme } from "@/src/theme";

const FILTERS: { key: string; color: string | null }[] = [
  { key: "Normal", color: null }, { key: "Warm", color: "rgba(255,140,60,0.22)" }, { key: "Cool", color: "rgba(60,140,255,0.2)" },
  { key: "Rose", color: "rgba(255,80,120,0.2)" }, { key: "Noir", color: "rgba(0,0,0,0.35)" }, { key: "Vintage", color: "rgba(150,110,40,0.28)" },
];
const STICKERS = ["😍", "🔥", "✨", "💖", "😎", "🎉", "🌸", "👑", "💯", "🙌"];
const DURATIONS = [{ k: "viewOnce", s: 0 }, { k: "1h", s: 3600 }, { k: "24h", s: 86400 }];

type Overlay = { id: string; kind: "text" | "sticker"; value: string; x: number; y: number };

export default function SnapCamera() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const cam = useRef<CameraView>(null);
  const shot = useRef<View>(null);
  const [perm, requestPerm] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [mode, setMode] = useState<"picture" | "video">("picture");
  const [recording, setRecording] = useState(false);
  const [captured, setCaptured] = useState<{ uri: string; type: "image" | "video" } | null>(null);
  const [filter, setFilter] = useState(FILTERS[0]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [panel, setPanel] = useState<null | "text" | "stickers" | "filters">(null);
  const [draft, setDraft] = useState("");
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!perm) return <View style={{ flex: 1, backgroundColor: colors.dark }} />;
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.dark, padding: spacing.xl, justifyContent: "center", gap: spacing.lg }} testID="camera-permission-screen">
        <Icon name="camera-outline" size={56} color={colors.onDark} />
        <Text style={{ color: colors.onDark, fontSize: 24, fontWeight: "800" }}>{t("camera.permissionTitle")}</Text>
        <Text style={{ color: colors.darkMuted, fontSize: 16, lineHeight: 24 }}>{t("camera.permissionBody")}</Text>
        {perm.canAskAgain ? <Button testID="camera-allow-button" title={t("camera.allow")} onPress={requestPerm} variant="secondary" />
          : <Button testID="camera-open-settings" title={t("camera.openSettings")} onPress={() => Linking.openSettings()} variant="secondary" />}
        <Button testID="camera-cancel" title={t("common.cancel")} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const capture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      if (mode === "picture") {
        const p = await cam.current?.takePictureAsync({ quality: 0.8 });
        if (p) setCaptured({ uri: p.uri, type: "image" });
      } else if (recording) {
        cam.current?.stopRecording();
      } else {
        if (!mic?.granted) {
          const r = mic?.canAskAgain === false ? null : await requestMic();
          if (!r?.granted) return toast(t("camera.micBody"), "error");
        }
        setRecording(true);
        const v = await cam.current?.recordAsync({ maxDuration: 30 });
        setRecording(false);
        if (v) setCaptured({ uri: v.uri, type: "video" });
      }
    } catch (e: any) { setRecording(false); toast(t("camera.unsupported"), "error"); }
  };

  const addOverlay = (kind: Overlay["kind"], value: string) => {
    if (!value.trim()) return;
    setOverlays((o) => [...o, { id: newClientId(), kind, value, x: 0.2 + Math.random() * 0.5, y: 0.25 + Math.random() * 0.4 }]);
    setDraft(""); setPanel(null);
  };

  // Bake overlays + filter into the image (photos). Videos are sent unmodified.
  const finalUri = async () => {
    if (!captured || captured.type === "video" || (!overlays.length && !filter.color) || Platform.OS === "web") return captured!.uri;
    try { return await captureRef(shot, { format: "jpg", quality: 0.85 }); } catch { return captured.uri; }
  };

  const send = async (dest: "story" | "snap") => {
    if (!captured) return;
    setBusy(true);
    try {
      const uri = await finalUri();
      const isV = captured.type === "video";
      const m = await uploadFile(uri, isV ? "snap.mp4" : "snap.jpg", isV ? "video/mp4" : "image/jpeg");
      if (dest === "story") {
        const caption = overlays.filter((o) => o.kind === "text").map((o) => o.value).join(" ");
        await api("/stories", { body: { type: isV ? "video" : "image", mediaId: m.id, text: isV ? caption : "" } });
        router.replace("/(tabs)/stories");
      } else {
        await api(`/conversations/${conversationId}/messages`, { body: { clientId: newClientId(), type: isV ? "video" : "snap", mediaId: m.id, text: "", viewOnce: duration === 0, expiresInSec: duration || undefined } });
        router.back();
      }
    } catch (e) { toast(errorText(e, t), "error"); } finally { setBusy(false); }
  };

  if (captured) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.dark }} testID="camera-preview-screen">
        <View ref={shot} collapsable={false} style={{ flex: 1 }}>
          {captured.type === "image" ? <Image source={{ uri: captured.uri }} style={{ flex: 1 }} contentFit="cover" />
            : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Icon name="videocam" size={64} color={colors.onDark} /><Text style={{ color: colors.onDark }}>{t("camera.video")}</Text></View>}
          {filter.color && <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: filter.color }} />}
          {overlays.map((o) => (
            <Pressable key={o.id} onLongPress={() => setOverlays((x) => x.filter((y) => y.id !== o.id))} style={{ position: "absolute", left: `${o.x * 100}%`, top: `${o.y * 100}%` }}>
              <Text style={o.kind === "sticker" ? { fontSize: 56 } : { fontSize: 28, fontWeight: "800", color: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.35)", paddingHorizontal: 10, borderRadius: 8, overflow: "hidden" }}>{o.value}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ position: "absolute", top: insets.top + 8, left: 8, right: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton testID="camera-retake" name="close" color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => { setCaptured(null); setOverlays([]); setFilter(FILTERS[0]); }} label={t("camera.retake")} />
          <View style={{ gap: 8 }}>
            <IconButton testID="camera-tool-text" name="text" color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => setPanel(panel === "text" ? null : "text")} label={t("camera.addText")} />
            <IconButton testID="camera-tool-stickers" name="happy-outline" color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => setPanel(panel === "stickers" ? null : "stickers")} label={t("camera.stickers")} />
            <IconButton testID="camera-tool-filters" name="color-filter-outline" color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => setPanel(panel === "filters" ? null : "filters")} label={t("camera.filters")} />
            <IconButton testID="camera-tool-draw" name="brush-outline" color={colors.darkMuted} bg="rgba(0,0,0,0.35)" onPress={() => toast(t("camera.drawPending"))} label={t("camera.draw")} />
          </View>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, gap: spacing.md, backgroundColor: colors.dark }}>
          {panel === "text" && (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput testID="camera-text-input" autoFocus value={draft} onChangeText={setDraft} placeholder={t("stories.typeSomething")} placeholderTextColor={colors.darkMuted} onSubmitEditing={() => addOverlay("text", draft)}
                style={{ flex: 1, minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.darkCard, color: colors.onDark, paddingHorizontal: 16 }} />
              <IconButton testID="camera-text-add" name="checkmark" color={colors.onAccent} bg={colors.accent} onPress={() => addOverlay("text", draft)} />
            </View>
          )}
          {panel === "stickers" && <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{STICKERS.map((s) => <Pressable key={s} testID={`sticker-${s}`} onPress={() => addOverlay("sticker", s)} style={{ padding: 6 }}><Text style={{ fontSize: 34 }}>{s}</Text></Pressable>)}</ScrollView>}
          {panel === "filters" && <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{FILTERS.map((f) => <Chip dark key={f.key} testID={`filter-${f.key}`} label={f.key} active={filter.key === f.key} onPress={() => setFilter(f)} />)}</ScrollView>}
          <Text style={{ color: colors.darkMuted, fontSize: 12, lineHeight: 18 }}>{t("stories.privacyNote")}</Text>
          {conversationId ? (
            <>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Text style={{ color: colors.onDark }}>{t("camera.disappearAfter")}:</Text>
                {DURATIONS.map((d) => <Chip dark key={d.k} testID={`snap-duration-${d.k}`} label={d.k === "viewOnce" ? t("chats.viewOnce") : d.k} active={duration === d.s} onPress={() => setDuration(d.s)} />)}
              </View>
              <Button testID="camera-send-snap" title={t("camera.sendSnap")} onPress={() => send("snap")} loading={busy} icon="send" />
            </>
          ) : <Button testID="camera-share-story" title={t("camera.shareStory")} onPress={() => send("story")} loading={busy} icon="arrow-forward" />}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.dark }} testID="camera-screen">
      <CameraView ref={cam} style={{ flex: 1 }} facing={facing} flash={flash} mode={mode} mute={false} />
      <View style={{ position: "absolute", top: insets.top + 8, left: 8, right: 8, flexDirection: "row", justifyContent: "space-between" }}>
        <IconButton testID="camera-close" name="close" color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => router.back()} label={t("common.close")} />
        <IconButton testID="camera-flash" name={flash === "on" ? "flash" : "flash-off"} color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => setFlash(flash === "on" ? "off" : "on")} label={t("camera.flash")} />
      </View>
      <View style={{ position: "absolute", bottom: insets.bottom + spacing.lg, left: 0, right: 0, alignItems: "center", gap: spacing.md }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip dark testID="camera-mode-photo" label={t("camera.photo")} active={mode === "picture"} onPress={() => !recording && setMode("picture")} />
          <Chip dark testID="camera-mode-video" label={t("camera.video")} active={mode === "video"} onPress={() => !recording && setMode("video")} />
        </View>
        {mode === "video" && <Text style={{ color: colors.onDark, fontSize: 12 }}>{t("camera.recordHint")}</Text>}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around", width: "100%" }}>
          <IconButton testID="camera-gallery" name="images-outline" color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => router.replace(conversationId ? `/chat/${conversationId}` : "/story-create?gallery=1")} />
          <Pressable testID="camera-shutter" onPress={capture} accessibilityLabel="capture"
            style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 5, borderColor: colors.onDark, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: recording ? 30 : 62, height: recording ? 30 : 62, borderRadius: recording ? 6 : 31, backgroundColor: mode === "video" ? colors.accent : colors.onDark }} />
          </Pressable>
          <IconButton testID="camera-flip" name="camera-reverse-outline" color={colors.onDark} bg="rgba(0,0,0,0.35)" onPress={() => setFacing(facing === "back" ? "front" : "back")} label={t("camera.flip")} />
        </View>
      </View>
    </View>
  );
}
