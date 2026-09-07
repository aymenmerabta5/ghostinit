import { queryAuthStateContent } from "../lib/query-client.js";

export function expoNativeQueryClientContent(): string {
  return `import { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/query-persist-client-core";

const STALE_TIME_MS = 30_000;
const CACHE_TIME_MS = 24 * 60 * 60 * 1_000;

${queryAuthStateContent()}

export interface NativeQueryRestore {
  queryClient: QueryClient;
  cacheScope: string;
  generation: number;
}

export function isNativeQueryRestoreComplete(
  restored: NativeQueryRestore | null,
  queryClient: QueryClient,
  cacheScope: string | null,
): boolean {
  return cacheScope !== null && restored?.queryClient === queryClient && restored.cacheScope === cacheScope && restored.generation === currentQueryAuthGeneration(queryClient);
}

export function nativeQueryCacheScope(scope: QueryAuthScope | null): string {
  return queryAuthScopeSignature(scope);
}

export function cancellableQueryPersister(persister: Persister) {
  let active = true;
  return {
    isActive: () => active,
    cancel: () => { active = false; },
    persister: {
      ...persister,
      restoreClient: async () => {
        const persisted = await persister.restoreClient();
        return active ? persisted : undefined;
      },
    } satisfies Persister,
  };
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof Error)) return true;
  return !/unauthorized|forbidden|validation|not found/i.test(error.message);
}

/** A fresh client per native application root with deliberate mobile policies. */
export function makeNativeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: CACHE_TIME_MS,
        retry: shouldRetry,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
`;
}

export function expoPushHookContent(): string {
  return `import * as React from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { resolveNotificationDestination } from "@/lib/notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function PushNotificationObserver(): null {
  const router = useRouter();
  const handledResponse = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (Platform.OS === "web") return;
    function navigateResponse(response: Notifications.NotificationResponse): void {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        Notifications.clearLastNotificationResponse();
        return;
      }
      const identifier = response.notification.request.identifier;
      if (handledResponse.current === identifier) return;
      handledResponse.current = identifier;
      const destination = resolveNotificationDestination(
        response.notification.request.content.data?.href,
      );
      Notifications.clearLastNotificationResponse();
      if (!destination) return;
      router.push(destination);
    }

    const response = Notifications.addNotificationResponseReceivedListener(navigateResponse);
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) navigateResponse(lastResponse);
    return () => {
      response.remove();
    };
  }, [router]);

  return null;
}

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
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    setPermissionStatus(finalStatus);
    if (finalStatus !== "granted") return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (typeof projectId !== "string" || projectId.length === 0) {
      throw new Error("Expo push notifications require an EAS project ID; run eas init first");
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    setExpoPushToken(token);
    return token;
  }, []);

  return { expoPushToken, permissionStatus, requestPermission };
}
`;
}

export function expoOfflineHookContent(): string {
  return `import * as React from "react";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { cancellableQueryPersister, currentQueryAuthGeneration, invalidateQueryAuthScope, isNativeQueryRestoreComplete, type NativeQueryRestore } from "@/lib/query-client";

export function useOfflineSync(
  queryClient: QueryClient,
  cacheScope: string | null,
): { isOnline: boolean; isRestoring: boolean } {
  const [isOnline, setIsOnline] = React.useState(true);
  const [restored, setRestored] = React.useState<NativeQueryRestore | null>(null);

  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      onlineManager.setOnline(online);
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (!cacheScope) return;
    const persistence = cancellableQueryPersister(createAsyncStoragePersister({
      storage: AsyncStorage,
      key: "ghostinit-query-cache:" + cacheScope,
    }));
    const [unsubscribe, restorePromise] = persistQueryClient({
      queryClient,
      persister: persistence.persister,
      buster: cacheScope,
      maxAge: 1000 * 60 * 60 * 24,
      dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status === "success" && query.queryKey[0] !== "__ghostinit" },
    });
    void restorePromise.catch((error: unknown) => {
      console.warn("[offline] Query cache restore failed", error);
    }).finally(() => { if (persistence.isActive()) setRestored({ queryClient, cacheScope, generation: currentQueryAuthGeneration(queryClient) }); });
    return () => {
      persistence.cancel();
      unsubscribe();
      invalidateQueryAuthScope(queryClient);
    };
  }, [cacheScope, queryClient]);

  return { isOnline, isRestoring: !isNativeQueryRestoreComplete(restored, queryClient, cacheScope) };
}
`;
}
