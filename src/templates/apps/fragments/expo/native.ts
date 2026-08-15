/**
 * Expo push notifications fragment — usePushNotifications hook
 * Wraps expo-notifications with permission handling and token registration
 */

export function expoPushHookContent(): string {
  return `import * as React from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(): {
  expoPushToken: string | null;
  permissionStatus: string | null;
  requestPermission: () => Promise<string | null>;
} {
  const [expoPushToken, setExpoPushToken] = React.useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = React.useState<string | null>(null);

  const requestPermission = React.useCallback(async (): Promise<string | null> => {
    if (!Device.isDevice) {
      console.warn("[push] Must use physical device for push notifications");
      return null;
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    setPermissionStatus(finalStatus);
    if (finalStatus !== "granted") return null;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    setExpoPushToken(token);
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    return token;
  }, []);

  React.useEffect(() => {
    const subReceived = Notifications.addNotificationReceivedListener((notification) => {
      console.log("[push] received", notification.request.content.title);
    });
    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("[push] response", response.notification.request.content.data);
    });
    return () => {
      subReceived.remove();
      subResponse.remove();
    };
  }, []);

  return { expoPushToken, permissionStatus, requestPermission };
}
`;
}

export function expoOfflineHookContent(): string {
  return `import * as React from "react";
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import * as SecureStore from "expo-secure-store";

export function useOfflineSync(queryClient: unknown): { isOnline: boolean } {
  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      onlineManager.setOnline(online);
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    const qc = queryClient as unknown as { getQueryCache: () => unknown; setQueryData: unknown };
    if (!qc?.getQueryCache) return;
    const persister = createAsyncStoragePersister({
      storage: {
        getItem: (k: string) => SecureStore.getItemAsync(k),
        setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
        removeItem: (k: string) => SecureStore.deleteItemAsync(k),
      },
    });
    void persistQueryClient({ queryClient: qc as never, persister, maxAge: 1000 * 60 * 60 * 24 });
  }, [queryClient]);

  return { isOnline };
}
`;
}
