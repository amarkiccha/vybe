import { Platform, Pressable, Text, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { usesNativeTabs } from "@/src/navigation";
import { Icon, type IconName } from "@/src/components/ui";
import { radius, useTheme } from "@/src/theme";

const TABS: { name: string; key: string; icon: IconName; iconActive: IconName; sf: string }[] = [
  { name: "index", key: "chats", icon: "chatbubble-ellipses-outline", iconActive: "chatbubble-ellipses", sf: "bubble.left.and.bubble.right.fill" },
  { name: "stories", key: "stories", icon: "aperture-outline", iconActive: "aperture", sf: "camera.aperture" },
  { name: "communities", key: "communities", icon: "people-outline", iconActive: "people", sf: "person.3.fill" },
  { name: "broadcast", key: "broadcast", icon: "megaphone-outline", iconActive: "megaphone", sf: "megaphone.fill" },
];

export const useUnread = () => useQuery({ queryKey: ["conversations", "all", ""], queryFn: () => api<{ conversations: any[]; unreadTotal: number }>("/conversations?filter=all"), refetchInterval: 5000 });

function VybeTabBar({ state, navigation }: { state: any; navigation: any }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const unread = useUnread().data?.unreadTotal ?? 0;
  return (
    <View style={{ flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 8, ...(Platform.OS === "web" ? { height: 76 } : {}) }}>
      {state.routes.map((route: any, i: number) => {
        const tab = TABS.find((x) => x.name === route.name)!;
        const active = state.index === i;
        return (
          <Pressable key={route.key} testID={`tab-${tab.key}`} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t(`tabs.${tab.key}`)}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); if (!active) navigation.navigate(route.name); }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", alignSelf: "center" }}>
            <View style={{ minWidth: 64, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.md, backgroundColor: active ? colors.brandPrimary : "transparent", alignItems: "center" }}>
              <Icon name={active ? tab.iconActive : tab.icon} size={22} color={active ? colors.onBrandPrimary : colors.muted} />
              <Text numberOfLines={1} style={{ fontSize: 11, marginTop: 2, fontWeight: active ? "700" : "500", color: active ? colors.onBrandPrimary : colors.muted }}>{t(`tabs.${tab.key}`)}</Text>
              {tab.key === "chats" && unread > 0 && (
                <View testID="tab-chats-unread-badge" style={{ position: "absolute", top: 0, right: 8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.onAccent, fontSize: 10, fontWeight: "800" }}>{unread > 99 ? "99+" : unread}</Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { user, ready } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (ready && !user) return <Redirect href="/auth" />;
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        {TABS.map((tab) => (
          <NativeTabs.Trigger key={tab.name} name={tab.name}>
            <NativeTabs.Trigger.Icon sf={tab.sf as any} />
            <NativeTabs.Trigger.Label>{t(`tabs.${tab.key}`)}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarItemStyle: { alignSelf: "center" } }} tabBar={(p) => <VybeTabBar {...p} />}>
      {TABS.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} />)}
    </Tabs>
  );
}
