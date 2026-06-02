/**
 * Gerencia o registro do Service Worker e a inscrição em Web Push Notifications.
 * Só funciona em HTTPS (produção) ou localhost (dev).
 */

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
    if (!res.ok) return null;
    const { publicKey } = await res.json();
    return publicKey ?? null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Registra o Service Worker e solicita permissão de notificação.
 * Se o usuário aceitar, envia a subscription para o servidor.
 * Chame isso após o login do usuário.
 */
export async function initPushNotifications(): Promise<void> {
  // Checar suporte
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.info("[push] Web Push não suportado neste browser.");
    return;
  }

  try {
    // Registrar (ou reusar) o Service Worker
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    // Verificar permissão atual
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.info("[push] Permissão de notificação negada.");
      return;
    }

    // Buscar chave pública VAPID
    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      console.warn("[push] Servidor sem VAPID configurado.");
      return;
    }

    // Checar se já existe subscription ativa
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      // Já inscrito — garantir que o servidor tem essa subscription
      await sendSubscriptionToServer(existingSub);
      return;
    }

    // Criar nova subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    await sendSubscriptionToServer(subscription);
    console.info("[push] Inscrito em Web Push com sucesso.");
  } catch (err) {
    console.error("[push] Erro ao inicializar push notifications:", err);
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });
}

/** Remove a subscription do browser e do servidor */
export async function unsubscribePushNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await fetch("/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  } catch (err) {
    console.error("[push] Erro ao cancelar push notifications:", err);
  }
}
