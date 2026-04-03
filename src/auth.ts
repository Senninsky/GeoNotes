import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export function signInWithGoogle(): Promise<User> {
  return signInWithPopup(auth, googleProvider).then((result) => result.user);
}

export function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

export function onAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
