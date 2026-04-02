// BrowserAgent AI - Firebase Client
// Auth, Firestore, Storage integration

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  serverTimestamp,
  arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyBOjwPD1N9gdeKujC_i8HA_MstAybvw4tw",
  authDomain: "browseragent-ai.firebaseapp.com",
  projectId: "browseragent-ai",
  storageBucket: "browseragent-ai.firebasestorage.app",
  messagingSenderId: "636409912514",
  appId: "1:636409912514:web:8ed497aa6b381c99c26f5b",
  measurementId: "G-XMER88RZYQ"
};

export class FirebaseClient {
  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.storage = getStorage(this.app);
    this.currentUser = null;
    
    // Listen for auth state changes
    onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      if (user) {
        this.updateLastSeen(user.uid);
      }
    });
  }

  // =============== AUTHENTICATION ===============

  async signInWithEmail(email, password) {
    try {
      const result = await signInWithEmailAndPassword(this.auth, email, password);
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signUpWithEmail(email, password, displayName) {
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email, password);
      
      // Create user document
      await setDoc(doc(this.db, 'users', result.user.uid), {
        email: result.user.email,
        displayName: displayName || email.split('@')[0],
        plan: 'free',
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      });
      
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signInWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.auth, provider);
      
      // Check if user document exists, create if not
      const userDoc = await getDoc(doc(this.db, 'users', result.user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(this.db, 'users', result.user.uid), {
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
          plan: 'free',
          createdAt: serverTimestamp(),
          lastSeen: serverTimestamp()
        });
      }
      
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signOutUser() {
    try {
      await signOut(this.auth);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // =============== USER MANAGEMENT ===============

  async getUserProfile(uid) {
    const userDoc = await getDoc(doc(this.db, 'users', uid || this.currentUser.uid));
    return userDoc.exists() ? userDoc.data() : null;
  }

  async updateUserProfile(uid, data) {
    await updateDoc(doc(this.db, 'users', uid || this.currentUser.uid), data);
    return { success: true };
  }

  async updateLastSeen(uid) {
    try {
      await updateDoc(doc(this.db, 'users', uid), {
        lastSeen: serverTimestamp()
      });
    } catch (e) {
      // Silently fail - not critical
    }
  }

  // =============== LLM CONFIG ===============

  async saveLLMConfig(config) {
    const uid = this.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');
    
    await setDoc(doc(this.db, 'configs', uid), {
      llmConfig: config,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    return { success: true };
  }

  async getLLMConfig() {
    const uid = this.currentUser?.uid;
    if (!uid) return null;
    
    const configDoc = await getDoc(doc(this.db, 'configs', uid));
    return configDoc.exists() ? configDoc.data().llmConfig : null;
  }

  // =============== SESSIONS ===============

  async createSession(data) {
    const uid = this.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await setDoc(doc(this.db, 'sessions', sessionId), {
      userId: uid,
      url: data.url,
      task: data.task,
      status: 'active',
      steps: [],
      startedAt: serverTimestamp()
    });
    
    return { success: true, sessionId };
  }

  async updateSession(sessionId, updates) {
    await updateDoc(doc(this.db, 'sessions', sessionId), updates);
    return { success: true };
  }

  async addSessionStep(sessionId, step) {
    await updateDoc(doc(this.db, 'sessions', sessionId), {
      steps: arrayUnion(step)
    });
    return { success: true };
  }

  async getSessions(options = {}) {
    const uid = this.currentUser?.uid;
    if (!uid) return [];
    
    const { limitCount = 20, status = null } = options;
    
    let q = query(
      collection(this.db, 'sessions'),
      where('userId', '==', uid),
      orderBy('startedAt', 'desc'),
      limit(limitCount)
    );
    
    if (status) {
      q = query(
        collection(this.db, 'sessions'),
        where('userId', '==', uid),
        where('status', '==', status),
        orderBy('startedAt', 'desc'),
        limit(limitCount)
      );
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // =============== STORAGE ===============

  async uploadScreenshot(screenshot, sessionId) {
    const uid = this.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');
    
    // Convert base64 to blob
    const base64Data = screenshot.split(',')[1];
    const blob = this.base64ToBlob(base64Data, 'image/png');
    
    const filename = `screenshots/${uid}/${sessionId}/${Date.now()}.png`;
    const storageRef = ref(this.storage, filename);
    
    await uploadBytes(storageRef, blob);
    const downloadUrl = await getDownloadURL(storageRef);
    
    return { success: true, url: downloadUrl };
  }

  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    
    return new Blob(byteArrays, { type: mimeType });
  }

  // =============== TASKS ===============

  async createTask(data) {
    const uid = this.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');
    
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await setDoc(doc(this.db, 'tasks', taskId), {
      userId: uid,
      prompt: data.prompt,
      status: 'pending',
      sessionIds: [],
      createdAt: serverTimestamp()
    });
    
    return { success: true, taskId };
  }

  async getTasks(options = {}) {
    const uid = this.currentUser?.uid;
    if (!uid) return [];
    
    const { limitCount = 50 } = options;
    
    const q = query(
      collection(this.db, 'tasks'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}

// Export singleton instance
export const firebaseClient = new FirebaseClient();
console.log('[BrowserAgent Firebase] Client initialized');
