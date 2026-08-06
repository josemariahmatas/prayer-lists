import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA0MB6TlRuguAbcE8xzbkfRcrGjozBTDng",
  authDomain: "prayer-lists-josemariah-b9999.firebaseapp.com",
  projectId: "prayer-lists-josemariah-b9999",
  storageBucket: "prayer-lists-josemariah-b9999.firebasestorage.app",
  messagingSenderId: "769101317452",
  appId: "1:769101317452:web:1271c607ca25f415f2bbe9",
  measurementId: "G-S50HGMH0MQ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
