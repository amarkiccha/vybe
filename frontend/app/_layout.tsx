import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox } from "react-native";
import { useFonts } from "expo-font";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider } from "@/src/auth";
import { ToastProvider } from "@/src/components/ui";
import { useTheme } from "@/src/theme";
import "@/src/i18n";

LogBox.ignoreAllLogs(true);

export default function RootLayout() {
  // Prewarm the icon font so icons render immediately (incl. Expo Go Android).
  const [fontsLoaded] = useFonts({ Ionicons: require("@react-native-vector-icons/ionicons/fonts/Ionicons.ttf") });
  const { colors, scheme } = useTheme();
  useEffect(() => {}, [fontsLoaded]);
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <ToastProvider>
                  <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                    <Stack.Screen name="camera" options={{ presentation: "fullScreenModal", animation: "fade" }} />
                    <Stack.Screen name="story/[userId]" options={{ presentation: "fullScreenModal", animation: "fade" }} />
                  </Stack>
                </ToastProvider>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
