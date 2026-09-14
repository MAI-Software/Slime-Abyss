/*
  Inicio de sesión con Google a través de Firebase (preparado).

  Para activarlo:
    1. Crear un proyecto en https://console.firebase.google.com y añadir una app web.
    2. Authentication → Método de acceso → activar Google.
    3. Authentication → Configuración → Dominios autorizados: añadir el dominio de Cloudflare Pages.
    4. Copiar los valores de la config web en variables VITE_FIREBASE_* (ver .env.example)
       en local (.env.local) y en Cloudflare Pages (Settings → Environment variables).
  Sin esas variables el juego funciona igual y el perfil muestra "no configurado".

  Firebase se carga bajo demanda (import dinámico) para no pesar en el arranque.
  En la futura app Android (Capacitor) el popup no sirve: habrá que usar un plugin nativo
  de Firebase Authentication y pasar la credencial a signInWithCredential.
*/

import type { User } from 'firebase/auth';

export interface Player {
  uid: string;
  name: string;
  photo: string | null;
  email: string | null;
}

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfigured = !!(config.apiKey && config.authDomain && config.projectId && config.appId);

let authPromise: Promise<typeof import('firebase/auth') & { auth: import('firebase/auth').Auth }> | null = null;

function loadAuth() {
  if (!firebaseConfigured) return Promise.reject(new Error('firebase-not-configured'));
  authPromise ??= (async () => {
    const [{ initializeApp }, authMod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const app = initializeApp(config as Required<typeof config>);
    const auth = authMod.getAuth(app);
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    return { ...authMod, auth };
  })();
  return authPromise;
}

const toPlayer = (u: User): Player => ({ uid: u.uid, name: u.displayName ?? 'Slime', photo: u.photoURL, email: u.email });

/** Avisa cada vez que cambia la sesión (también al arrancar si ya había una). */
export async function watchPlayer(cb: (p: Player | null) => void) {
  if (!firebaseConfigured) { cb(null); return; }
  const { auth, onAuthStateChanged } = await loadAuth();
  onAuthStateChanged(auth, (u) => cb(u ? toPlayer(u) : null));
}

export async function signInWithGoogle(): Promise<Player> {
  const { auth, GoogleAuthProvider, signInWithPopup } = await loadAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const res = await signInWithPopup(auth, provider);
  return toPlayer(res.user);
}

export async function signOutPlayer() {
  if (!firebaseConfigured) return;
  const { auth, signOut } = await loadAuth();
  await signOut(auth);
}
