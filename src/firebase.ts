import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDwwB5dGm3dZ0yp0rrtt05I5n1Nh2C9YXE",
  authDomain: "geomap-7e47c.firebaseapp.com",
  projectId: "geomap-7e47c",
  storageBucket: "geomap-7e47c.firebasestorage.app",
  messagingSenderId: "118625438351",
  appId: "1:118625438351:web:d8438bb2a1c13bc4d93efa",
  measurementId: "G-LGK9869VR1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
