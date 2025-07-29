import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, ArrowRight, X, Users, DollarSign, Calculator, Eraser, AlertTriangle, Settings, ChevronDown, ChevronUp, BookOpen, LogIn, PlusCircle, ArrowLeft, Bot, QrCode, Timer, Play, Pause, RefreshCw, SkipForward, SkipBack, Star, LogOut, Crown, User as UserIcon } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";

// --- Firebase Configuration ---
// This now safely reads from your Vercel Environment Variables
const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}');

// --- Helper Components (Now styled via CSS file) ---
const Card = ({ children, className = '' }) => ( <div className={`card ${className}`}>{children}</div> );
const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => ( <button onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${className}`}>{children}</button> );
const Modal = ({ isOpen, onClose, title, children }) => { if (!isOpen) return null; return ( <div className="modal-overlay"> <div className="modal-content"> <div className="modal-header"> <h2 className="modal-title">{title}</h2> <button onClick={onClose} className="modal-close-btn"><X size={24} /></button> </div> <div className="modal-body">{children}</div> </div> </div> ); };

// --- Authentication Components ---
function WelcomePage({ onLogin, onRegister }) {
    return (
        <div className="auth-container">
            <Card className="auth-card welcome-card">
                <h1>Welcome to Poker Night Ledger</h1>
                <p>Please log in or register to continue.</p>
                <div className="button-group">
                    <Button onClick={onLogin} variant="primary"><LogIn className="icon"/> Login</Button>
                    <Button onClick={onRegister} variant="secondary">Register</Button>
                </div>
            </Card>
        </div>
    );
}

function AuthModal({ isOpen, onClose, auth, initialMode }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(initialMode === 'register');
    const [error, setError] = useState('');

    useEffect(() => {
        setIsRegistering(initialMode === 'register');
        setError('');
        setUsername('');
        setPassword('');
    }, [isOpen, initialMode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const email = `${username.trim()}@pokernight.local`;
        try {
            if (isRegistering) {
                if (password.length < 6) {
                    setError("Password should be at least 6 characters.");
                    return;
                }
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            onClose();
        } catch (err) {
            if (err.code === 'auth/operation-not-allowed') {
                setError("Registration is not enabled in Firebase. Please contact the administrator.");
            } else if (err.code === 'auth/invalid-email') {
                setError("Invalid username. Please use only letters and numbers.");
            } else {
                setError(err.message);
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isRegistering ? 'Register' : 'Login'}>
            <form onSubmit={handleSubmit} className="form-group-stack">
                <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input type="text" id="username" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                {error && <p className="text-red">{error}</p>}
                <Button type="submit" variant="primary">{isRegistering ? 'Create Account' : 'Log In'}</Button>
            </form>
            <button onClick={() => setIsRegistering(!isRegistering)} className="toggle-auth-btn">
                {isRegistering ? 'Already have an account? Log In' : 'Need an account? Register'}
            </button>
        </Modal>
    );
}


// --- Main App Component ---
export default function App() {
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGameMaker, setIsGameMaker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authModal, setAuthModal] = useState({ isOpen: false, mode: 'login' });
  
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'poker-ledger-default';

  useEffect(() => {
    try {
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const firestoreInstance = getFirestore(app);
        setAuth(authInstance);
        setDb(firestoreInstance);

        const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
            setCurrentUser(user);
            if (user) {
                setAuthModal({ isOpen: false, mode: 'login' });
                const userDocRef = doc(firestoreInstance, `artifacts/${appId}/public/data/users/${user.uid}`);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    setUserProfile(userDocSnap.data());
                } else {
                    const newProfile = { displayName: (user.email || 'user').split('@')[0] };
                    await setDoc(userDocRef, newProfile);
                    setUserProfile(newProfile);
                }

                const adminConfigRef = doc(firestoreInstance, `artifacts/${appId}/public/data/config/admins`);
                const docSnap = await getDoc(adminConfigRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const adminUids = data.uids || [];
                    const gameMakerUids = data.gameMakers || [];
                    const userIsAdmin = adminUids.includes(user.uid);
                    setIsAdmin(userIsAdmin);
                    setIsGameMaker(userIsAdmin || gameMakerUids.includes(user.uid));
                } else {
                    setIsAdmin(false);
                    setIsGameMaker(false);
                }
            } else {
                setIsAdmin(false);
                setIsGameMaker(false);
                setUserProfile(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    } catch (error) {
        console.error("Error initializing Firebase:", error);
        setIsLoading(false);
    }
  }, [appId]);
  
  const openAuthModal = (mode) => setAuthModal({ isOpen: true, mode });
  const closeAuthModal = () => setAuthModal({ isOpen: false, mode: 'login' });

  if (isLoading) {
    return <div className="loading-fullscreen">Loading...</div>;
  }

  if (!currentUser) {
    return (
        <>
            <WelcomePage onLogin={() => openAuthModal('login')} onRegister={() => openAuthModal('register')} />
            <AuthModal 
                isOpen={authModal.isOpen} 
                onClose={closeAuthModal} 
                auth={auth} 
                initialMode={authModal.mode}
            />
        </>
    );
  }

  return <MainApp currentUser={currentUser} userProfile={userProfile} setUserProfile={setUserProfile} auth={auth} db={db} isAdmin={isAdmin} isGameMaker={isGameMaker} appId={appId} />;
}


// --- Main Application Logic (after login) ---
function MainApp({ currentUser, userProfile, setUserProfile, auth, db, isAdmin, isGameMaker, appId }) {
  const [players, setPlayers] = useState([]);
  const [transactionLog, setTransactionLog] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [modal, setModal] = useState({ isOpen: false, type: null, data: null });
  const [finalCalculations, setFinalCalculations] = useState(null);
  const [chipValue, setChipValue] = useState(0.5);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [expandedSummaryPlayerId, setExpandedSummaryPlayerId] = useState(null);
  const [showConsole, setShowConsole] = useState(false);
  const [userIp, setUserIp] = useState('unknown');
  const [view, setView] = useState('game'); // 'game', 'blinds', 'admin', 'stats', 'profile'
  const [quickAddPlayers, setQuickAddPlayers] = useState([]);
  
  // Session State
  const [sessionId, setSessionId] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const unsubscribeRef = useRef(null);
  
  const currencySymbol = '฿';
  const username = useMemo(() => userProfile?.displayName || (currentUser.email || 'user').split('@')[0], [currentUser.email, userProfile]);
  const userRole = useMemo(() => isAdmin ? '(Admin)' : isGameMaker ? '(Game Maker)' : '(Player)', [isAdmin, isGameMaker]);

  const getDeviceId = () => {
    let deviceId = localStorage.getItem('pokerLedgerDeviceId');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('pokerLedgerDeviceId', deviceId);
    }
    return deviceId;
  };

  useEffect(() => {
    const fetchIp = async () => {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            setUserIp(data.ip);
        } catch (error) {
            console.error("Could not fetch IP address:", error);
            setUserIp('fetch-failed');
        }
    };
    fetchIp();
  }, []);

  useEffect(() => {
    if (db) {
        fetchRecentSessions();
        const settingsRef = doc(db, `artifacts/${appId}/public/data/global_settings/config`);
        getDoc(settingsRef).then(docSnap => {
            if (docSnap.exists()) {
                setDiscordWebhookUrl(docSnap.data().discordWebhookUrl || '');
            }
        });

        const playersRef = collection(db, `artifacts/${appId}/public/data/poker_players`);
        const q = query(playersRef, where('isQuickAdd', '==', true));
        const unsubscribeQuickAdd = onSnapshot(q, (querySnapshot) => {
            const qaPlayers = [];
            querySnapshot.forEach((doc) => {
                qaPlayers.push(doc.id);
            });
            setQuickAddPlayers(qaPlayers.sort());
        });
        return () => unsubscribeQuickAdd();
    }
  }, [db, appId]);

  useEffect(() => {
    return () => { if (unsubscribeRef.current) { unsubscribeRef.current(); } };
  }, []);
  
  const getTodayDatePrefix = () => {
      const today = new Date();
      return `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;
  }
  
  const fetchRecentSessions = async () => {
      if (!db) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const datePrefix30DaysAgo = `${thirtyDaysAgo.getFullYear()}${(thirtyDaysAgo.getMonth() + 1).toString().padStart(2, '0')}${thirtyDaysAgo.getDate().toString().padStart(2, '0')}`;
      const sessionsRef = collection(db, `artifacts/${appId}/public/data/poker-sessions`);
      const q = query(sessionsRef, where('datePrefix', '>=', datePrefix30DaysAgo));
      const querySnapshot = await getDocs(q);
      const sessions = querySnapshot.docs.map(doc => doc.id).sort((a, b) => b.localeCompare(a));
      setAvailableSessions(sessions);
      return sessions;
  };

  const findNextSessionId = async () => {
    const datePrefix = getTodayDatePrefix();
    const sessions = await fetchRecentSessions();
    const todaysSessionsCount = sessions.filter(s => s.startsWith(datePrefix)).length;
    const nextId = todaysSessionsCount + 1;
    return `${datePrefix}-${nextId}`;
  };

  const startNewSession = async () => {
    setIsLoadingSession(true);
    if (unsubscribeRef.current) unsubscribeRef.current();
    const newSessionId = await findNextSessionId();
    const initialState = {
        players: [],
        transactionLog: [{ id: Date.now(), timestamp: new Date().toISOString(), type: 'New Game', message: `Session ${newSessionId} started.`, ip: userIp }],
        chipValue: 0.5,
        finalCalculations: null,
        gameState: 'in_progress',
        datePrefix: newSessionId.split('-')[0],
        blinds: [
            { sb: 5, bb: 10 }, { sb: 10, bb: 20 }, { sb: 15, bb: 30 }, { sb: 20, bb: 40 }, { sb: 25, bb: 50 }, { sb: 30, bb: 60 }
        ],
        timerDuration: 480, // 8 minutes
    };
    const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, newSessionId);
    await setDoc(sessionRef, initialState);
    await fetchRecentSessions();
    setSessionId(newSessionId);
    listenToSession(newSessionId);
    setSessionActive(true);
    setIsLoadingSession(false);
  };
  
  const loadSession = async (sid) => {
    if (!sid) return;
    setIsLoadingSession(true);
    if (unsubscribeRef.current) unsubscribeRef.current();
    const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sid);
    const docSnap = await getDoc(sessionRef);
    if (docSnap.exists()) {
      listenToSession(sid);
      setSessionId(sid);
      setSessionActive(true);
    } else {
      alert("Session not found!");
      setSessionId('');
      setSessionActive(false);
    }
    setIsLoadingSession(false);
  };
  
  const handleSessionSelect = (e) => {
      const selectedId = e.target.value;
      if (selectedId) { loadSession(selectedId); } 
      else {
           if (unsubscribeRef.current) unsubscribeRef.current();
           setSessionId(''); setSessionActive(false); setPlayers([]); setTransactionLog([]); setFinalCalculations(null);
      }
  }
  
  const listenToSession = (sid) => {
    const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sid);
    unsubscribeRef.current = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSessionData(data);
        setPlayers(data.players || []);
        setTransactionLog(data.transactionLog || []);
        setChipValue(data.chipValue || 0.5);
        setFinalCalculations(data.finalCalculations || null);
      }
    });
  };

  useEffect(() => {
    if (!sessionActive || isLoadingSession) return;
    const handler = setTimeout(() => {
        if (db && sessionId) {
            const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
            const dataToSave = { players, transactionLog, chipValue, finalCalculations, gameState: sessionData?.gameState };
            setDoc(sessionRef, dataToSave, { merge: true }).catch(err => console.error("Error saving session:", err));
        }
    }, 1000);
    return () => { clearTimeout(handler); };
  }, [players, transactionLog, chipValue, finalCalculations, sessionData, sessionActive, db, sessionId, appId, isLoadingSession]);

  const handleWebhookSave = async (url) => {
    setDiscordWebhookUrl(url);
    if (db) {
        const settingsRef = doc(db, `artifacts/${appId}/public/data/global_settings/config`);
        await setDoc(settingsRef, { discordWebhookUrl: url }, { merge: true });
    }
  };

  const sendToDiscord = async (log) => {
    if (!discordWebhookUrl || !discordWebhookUrl.startsWith('https://discord.com/api/webhooks/')) return;
    let embed = { title: `Transaction: ${log.type}`, color: 0x5865F2, timestamp: new Date(log.timestamp).toISOString(), fields: [], footer: { text: `Session ID: ${sessionId} | IP: ${log.ip}` } };
    if (log.player) embed.fields.push({ name: 'Player', value: log.player, inline: true });
    if (log.amount) embed.fields.push({ name: 'Amount', value: `${log.amount} chips`, inline: true });
    if (log.source) embed.fields.push({ name: 'Source', value: log.source, inline: true });
    if (log.message) embed.description = log.message;
    switch(log.type) {
        case 'Initial Buy-in': case 'Player Buy-in': embed.color = log.source === 'Central Box' ? 0x57F287 : 0x3498DB; break;
        case 'Cash Out': embed.color = 0xED4245; break;
        case 'Game End Summary':
            embed.title = `Game Over - Final Results`;
            embed.description = `Summary for session **${sessionId}**.`;
            embed.fields = log.summary.players.map(p => ({ name: p.name, value: `Profit/Loss: **${p.balance > 0 ? '+' : ''}${formatMoney(p.balance)}**\n(Final: ${p.finalChips}, Buy-in: ${p.buyIn})`, inline: false }));
            embed.fields.push({ name: '--- Settlements ---', value: log.summary.transactions.length > 0 ? log.summary.transactions.map(t => `**${t.from}** pays **${t.to}** \`${formatMoney(t.amount)}\``).join('\n') : 'Everyone broke even!', });
            break;
    }
    try { await fetch(discordWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Poker Ledger Bot', embeds: [embed] }), }); } catch (error) { console.error('Failed to send Discord notification:', error); }
  };

  const formatMoney = (amountInChips) => { const value = amountInChips * chipValue; return `${currencySymbol}${value.toFixed(2)}`; };
  const logTransaction = (log) => { const newLog = { id: Date.now(), timestamp: new Date().toISOString(), ip: userIp, ...log }; setTransactionLog(prevLogs => [...prevLogs, newLog]); sendToDiscord(newLog); };
  
  const addPlayer = async (name, buyIn = 0, isGuest = true) => {
    const trimmedName = name.trim();
    if (trimmedName && !players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        let promptpayId = '';
        if (db) {
            const playerRef = doc(db, `artifacts/${appId}/public/data/poker_players`, trimmedName);
            const docSnap = await getDoc(playerRef);
            if (docSnap.exists()) {
                promptpayId = docSnap.data().promptpayId || '';
            }
        }
        const newPlayer = { id: Date.now(), name: trimmedName, buyIn: buyIn, promptpayId: promptpayId, finalChips: null, balance: 0, status: isGuest ? 'guest' : 'joined', uid: isGuest ? null : currentUser.uid, deviceId: isGuest ? null : getDeviceId() };
        setPlayers(prevPlayers => [...prevPlayers, newPlayer]);
        if (buyIn > 0) { logTransaction({ type: 'Initial Buy-in', player: trimmedName, amount: buyIn, source: 'Central Box' }); }
        return true;
    }
    return false;
  };
  
  const handleAddPlayer = async (e, buyIn = 0) => { e.preventDefault(); if(await addPlayer(newPlayerName, buyIn, true)){ setNewPlayerName(''); } };
  const handleQuickAdd = async (name) => { await addPlayer(name, 400, true); };
  
  const handleJoinGame = (playerId, buyInAmount) => {
    setPlayers(players.map(p => p.id === playerId ? { ...p, status: 'joined', uid: currentUser.uid, deviceId: getDeviceId(), buyIn: p.buyIn + buyInAmount } : p));
    if (buyInAmount > 0) {
        const player = players.find(p => p.id === playerId);
        logTransaction({ type: 'Initial Buy-in', player: player.name, amount: buyInAmount, source: 'Central Box' });
    }
    closeModal();
  };

  const handleSelfJoin = (buyInAmount) => {
    addPlayer(username, buyInAmount, false);
    closeModal();
  };

  const handleUpdatePlayer = async (playerId, data) => { 
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    if (db && data.promptpayId) {
        const playerRef = doc(db, `artifacts/${appId}/public/data/poker_players`, player.name);
        await setDoc(playerRef, { promptpayId: data.promptpayId, name: player.name }, { merge: true });
    }
    setPlayers(players.map(p => p.id === playerId ? {...p, ...data} : p)); 
    closeModal(); 
  };

  const toggleQuickAdd = async (playerName) => {
    if (!isAdmin || !db) return;
    const playerRef = doc(db, `artifacts/${appId}/public/data/poker_players`, playerName);
    const docSnap = await getDoc(playerRef);
    const isCurrentlyQuickAdd = docSnap.exists() && docSnap.data().isQuickAdd;
    await setDoc(playerRef, { name: playerName, isQuickAdd: !isCurrentlyQuickAdd }, { merge: true });
  };
  
  const handleBuyIn = (buyerId, amount, source) => {
    const buyer = players.find(p => p.id === buyerId); if (!buyer) return;
    setPlayers(prevPlayers => {
      const updatedPlayers = [...prevPlayers];
      const buyerIndex = updatedPlayers.findIndex(p => p.id === buyerId);
      updatedPlayers[buyerIndex] = { ...updatedPlayers[buyerIndex], buyIn: updatedPlayers[buyerIndex].buyIn + amount };
      
      if (source !== 'central-box') {
        const sellerIndex = updatedPlayers.findIndex(p => p.id === parseInt(source));
        const seller = updatedPlayers[sellerIndex];
        if (sellerIndex !== -1) {
            updatedPlayers[sellerIndex] = {...updatedPlayers[sellerIndex], buyIn: seller.buyIn - amount };
            logTransaction({ type: 'Player Buy-in', player: buyer.name, amount, source: `from ${seller.name}` });
        }
      } else { logTransaction({ type: 'Player Buy-in', player: buyer.name, amount, source: 'Central Box' }); }
      return updatedPlayers;
    });
    closeModal();
  };

  const handleCashOut = (playerId, amount) => {
      const player = players.find(p => p.id === playerId); if (!player || !amount || amount <= 0) return;
      logTransaction({ type: 'Cash Out', player: player.name, amount });
      setPlayers(prevPlayers => prevPlayers.map(p => p.id === playerId ? { ...p, buyIn: p.buyIn - amount } : p));
      closeModal();
  };

  const handleEndGameCalculation = (finalChipCounts) => {
    const updatedPlayers = players.map(p => ({
      ...p,
      finalChips: parseInt(finalChipCounts[p.id] || 0, 10)
    }));
    
    const playersWithBalance = updatedPlayers.map(p => ({
        ...p,
        balance: p.finalChips - p.buyIn,
    }));
    
    const totalFinalChips = playersWithBalance.reduce((sum, p) => sum + p.finalChips, 0);
    const totalNetBuyIn = playersWithBalance.reduce((sum, p) => sum + p.buyIn, 0);
    
    if (Math.abs(totalFinalChips - totalNetBuyIn) > 0.01) {
        const errorMessage = `Balance mismatch! Total final chips (${totalFinalChips}) do not equal total net buy-ins (${totalNetBuyIn}). Please double-check chip counts.`;
        openModal('error', { message: errorMessage });
        return;
    }
    
    let debtors = playersWithBalance.filter(p => p.balance < 0).map(p => ({...p}));
    let creditors = playersWithBalance.filter(p => p.balance > 0).map(p => ({...p}));
    debtors.sort((a, b) => a.balance - b.balance);
    creditors.sort((a, b) => b.balance - a.balance);
    const transactions = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(Math.abs(debtor.balance), creditor.balance);
      if (amount > 0.01) {
        transactions.push({ from: debtor.name, to: creditor.name, amount: parseFloat(amount.toFixed(2)) });
      }
      debtor.balance += amount;
      creditor.balance -= amount;
      if (Math.abs(debtor.balance) < 0.01) i++;
      if (Math.abs(creditor.balance) < 0.01) j++;
    }
    const finalData = { players: playersWithBalance.sort((a,b) => b.balance - a.balance), transactions };
    setFinalCalculations(finalData);
    setPlayers(updatedPlayers);
    logTransaction({ type: 'Game End Summary', summary: finalData });
    
    const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
    updateDoc(sessionRef, { gameState: 'finished' });
  };
  
  const handleBackToGame = () => { 
    logTransaction({ type: 'Game Resumed', message: 'Returned to game from summary.' }); 
    setFinalCalculations(null); 
    setExpandedSummaryPlayerId(null);
    const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
    updateDoc(sessionRef, { gameState: 'in_progress' });
  };
  const resetGame = () => { startNewSession() };
  const openModal = (type, data = null) => setModal({ isOpen: true, type, data });
  const closeModal = () => setModal({ isOpen: false, type: null, data: null });
  const togglePlayerExpansion = (playerId) => { setExpandedPlayerId(prevId => (prevId === playerId ? null : playerId)); };
  const toggleSummaryExpansion = (playerId) => { setExpandedSummaryPlayerId(prevId => (prevId === playerId ? null : playerId)); };
  const totalBuyInFromBox = useMemo(() => players.reduce((sum, p) => sum + p.buyIn, 0), [players]);
  const hasJoined = useMemo(() => players.some(p => p.uid === currentUser.uid), [players, currentUser.uid]);

  // --- Render Functions ---
  const renderSessionManager = () => (
    <Card>
      <h2 className="section-title">Session Management</h2>
      <div className="session-manager-grid">
        <div className="form-group">
          <label htmlFor="sessionSelect">Recent Sessions (Last 30 Days)</label>
          <select id="sessionSelect" value={sessionId} onChange={handleSessionSelect}>
            <option value="">-- Select a Session --</option>
            {availableSessions.map(sid => <option key={sid} value={sid}>{sid}</option>)}
          </select>
        </div>
        {(isAdmin || isGameMaker) && <Button onClick={startNewSession} variant="primary" disabled={isLoadingSession}><PlusCircle className="icon"/> New Session</Button>}
      </div>
       {sessionActive && <p className="session-active-text">Live Session: <strong>{sessionId}</strong></p>}
    </Card>
  );

  const renderJoinLobby = () => {
    const playerAsGuest = players.find(p => p.status === 'guest' && p.name.toLowerCase() === username.toLowerCase());

    return (
        <Card>
            <h2 className="section-title">Join Game Lobby</h2>
            {playerAsGuest ? (
                <div className="join-game-actions">
                    <p>A guest named <strong>{username}</strong> is in the lobby. Is this you?</p>
                    <Button onClick={() => openModal('self-buy-in', { player: playerAsGuest })} variant="success">Yes, Join & Buy-in</Button>
                </div>
            ) : (
                <div className="join-game-actions">
                    <p>You are not in the game yet.</p>
                    <Button onClick={() => openModal('self-buy-in', { name: username, isNewPlayer: true })} variant="success">Join Game as {username}</Button>
                </div>
            )}
        </Card>
    );
  };

  const renderAddPlayerForm = () => ( <Card> <h2 className="section-title"><Users className="icon"/>Add Guest Players</h2> <form className="add-player-form" onSubmit={(e) => handleAddPlayer(e, 400)}> <input type="text" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Enter guest's name"/> <div className="button-group"> <Button onClick={(e) => handleAddPlayer(e, 0)} variant="secondary" disabled={!newPlayerName.trim()}>Add Guest</Button> <Button type="submit" variant="primary" disabled={!newPlayerName.trim()}>Add Guest & Buy-in 400</Button> </div> </form> <div className="quick-add-section"> <h3>Quick Add Guests</h3> <div className="quick-add-grid"> {quickAddPlayers.map(name => ( <Button key={name} onClick={() => handleQuickAdd(name)} variant="success" disabled={players.some(p => p.name === name)}> <Plus size={16} className="icon"/> {name} </Button> ))} </div> </div> </Card> );
  const renderPlayerList = () => ( <Card> <h2 className="section-title">Lobby & Game</h2> <div className="player-list"> {players.map(player => ( <div key={player.id} className={`player-list-item ${player.uid === currentUser.uid ? 'is-current-user' : ''}`}> <div className="player-list-item-header"> <div className="player-name-group"> <button onClick={() => togglePlayerExpansion(player.id)} className="player-name-btn"> {player.name} {player.status === 'joined' ? <span className="status-dot joined"></span> : <span className="status-dot guest"></span>} {expandedPlayerId === player.id ? <ChevronUp className="icon-sm"/> : <ChevronDown className="icon-sm"/>} </button> {isAdmin && <Button onClick={() => toggleQuickAdd(player.name)} variant="secondary" className={`promptpay-btn ${quickAddPlayers.includes(player.name) ? 'is-quick-add' : ''}`}><Star size={14}/></Button>} <Button onClick={() => openModal('edit-player', player)} variant="secondary" className="promptpay-btn">PromptPay ID</Button> </div> <div className="player-info-group"> <span>Net Buy-in: <strong>{player.buyIn} chips</strong></span> <div className="button-group"> {player.status === 'guest' && !hasJoined && <Button onClick={() => openModal('self-buy-in', { player })} variant="success">Join Game</Button>} {(isAdmin || isGameMaker) && <> <Button onClick={() => openModal('buy-in', player)} variant="primary">Buy Chips</Button> <Button onClick={() => openModal('cash-out', player)} variant="secondary" disabled={player.buyIn <= 0}>Cash Out</Button> </>} </div> </div> </div> {expandedPlayerId === player.id && ( <div className="transaction-history-container"> <h4>Transaction History</h4> <ul> {transactionLog.filter(log => log.player === player.name || (log.source && log.source.includes(player.name))).map(log => { if (log.source && log.source.includes(player.name)) { return ( <li key={log.id} className="log-sold"> <span>{new Date(log.timestamp).toLocaleTimeString()} - Sold Chips</span> <span>{log.amount && `${log.amount} chips`} (to {log.player})</span> </li> ); } let logClass = ''; if (log.type.includes('Buy-in')) { logClass = log.source === 'Central Box' ? 'log-buy-box' : 'log-buy-player'; } else if (log.type === 'Cash Out') { logClass = 'log-cashout'; } return ( <li key={log.id} className={logClass}> <span>{new Date(log.timestamp).toLocaleTimeString()} - {log.type}</span> <span>{log.amount && `${log.amount} chips`} {log.source && `(${log.source})`}</span> </li> ); })} </ul> </div> )} </div> ))} </div> <div className="game-summary-footer"> <h3>Total in Play (from Box): <span className="text-green">{totalBuyInFromBox} chips</span></h3> {(isAdmin || isGameMaker) && <Button onClick={() => { const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId); updateDoc(sessionRef, { gameState: 'awaiting_counts' }); }} variant="danger" disabled={players.length < 2}> <Calculator className="icon"/> End Game </Button>} </div> </Card> );
  const renderSummary = () => ( <Card className="summary-card"> <h2 className="summary-title">Game Over: Final Tally</h2> <p className="session-id-summary">Session ID: {sessionId}</p> <h3 className="section-title">Player Results</h3> <div className="player-results-list"> {finalCalculations.players.map(player => ( <div key={player.id} className="player-result-item"> <button onClick={() => toggleSummaryExpansion(player.id)} className="player-result-header"> <div> <span>{player.name}</span> <div className="player-result-details">Net Buy-in: {player.buyIn} chips | Final: {player.finalChips} chips</div> </div> <div className="player-result-balance-group"> <span className={player.balance >= 0 ? 'text-green' : 'text-red'}> {player.balance >= 0 ? `+ ${formatMoney(player.balance)}` : `- ${formatMoney(Math.abs(player.balance))}`} </span> {expandedSummaryPlayerId === player.id ? <ChevronUp className="icon-sm"/> : <ChevronDown className="icon-sm"/>} </div> </button> {expandedSummaryPlayerId === player.id && ( <div className="transaction-history-container"> <h4>Transaction History</h4> <ul> {transactionLog.filter(log => log.player === player.name || (log.source && log.source.includes(player.name))).map(log => { if (log.source && log.source.includes(player.name)) { return ( <li key={log.id} className="log-sold"> <span>{new Date(log.timestamp).toLocaleTimeString()} - Sold Chips</span> <span>{log.amount && `${log.amount} chips`} (to {log.player})</span> </li> ); } let logClass = ''; if (log.type.includes('Buy-in')) { logClass = log.source === 'Central Box' ? 'log-buy-box' : 'log-buy-player'; } else if (log.type === 'Cash Out') { logClass = 'log-cashout'; } return ( <li key={log.id} className={logClass}> <span>{new Date(log.timestamp).toLocaleTimeString()} - {log.type}</span> <span>{log.amount && `${log.amount} chips`} {log.source && `(${log.source})`}</span> </li> ); })} </ul> </div> )} </div> ))} </div> <h3 className="section-title">Settlement Transactions</h3> <div className="settlement-list"> {finalCalculations.transactions.map((t, index) => { const recipient = players.find(p => p.name === t.to); const hasPromptPay = recipient && recipient.promptpayId; const qrUrl = hasPromptPay ? `https://promptpay.io/${recipient.promptpayId}/${(t.amount * chipValue).toFixed(2)}` : ''; return ( <button key={index} onClick={() => { if(hasPromptPay) { openModal('show-qr', { url: qrUrl, from: t.from, to: t.to, amount: t.amount }) } else { openModal('no-qr', { from: t.from, to: t.to, amount: t.amount }) } }} className="settlement-item"> <span className="text-red">{t.from}</span> <ArrowRight className="icon-sm" /> <span className="text-green">{t.to}</span> <ArrowRight className="icon-sm" /> <span>{formatMoney(t.amount)}</span> </button> );})} </div> <div className="summary-actions"> <Button onClick={handleBackToGame} variant="secondary"> <ArrowLeft className="icon"/> Back to Game </Button> <Button onClick={resetGame} variant="primary"> <Eraser className="icon"/> Start New Session </Button> </div> </Card> );
  const BuyInModalContent = () => {
    const [amount, setAmount] = useState('400');
    const [source, setSource] = useState('central-box');
    const player = modal.data;
    const potentialSellers = players.filter(p => p.id !== player.id);
    return (
      <div className="form-group-stack">
        <p>How many chips is <strong>{player.name}</strong> buying?</p>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          min="1"
          step="1"
        />
        <p>Buy from:</p>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="central-box">กล่องเก็บชิปกลาง (Central Box)</option>
          {potentialSellers.map(p => <option key={p.id} value={p.id}>{p.name} (Net Buy-in: {p.buyIn} chips)</option>)}
        </select>
        <Button onClick={() => handleBuyIn(player.id, parseInt(amount || 0), source)} variant="success" disabled={!amount || parseInt(amount) <= 0}> Confirm Buy-in </Button>
      </div>
    );
  };
  const SelfBuyInModalContent = () => {
    const [amount, setAmount] = useState('400');
    const { player, isNewPlayer, name } = modal.data;
    const playerName = isNewPlayer ? name : player.name;

    return (
      <div className="form-group-stack">
        <p>Enter your initial buy-in amount for <strong>{playerName}</strong>.</p>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          min="1"
          step="1"
        />
        <Button onClick={() => {
            if (isNewPlayer) {
                handleSelfJoin(parseInt(amount || 0));
            } else {
                handleJoinGame(player.id, parseInt(amount || 0));
            }
        }} variant="success" disabled={!amount || parseInt(amount) <= 0}>Join & Buy-in</Button>
      </div>
    );
  };
  const CashOutModalContent = () => { const [amount, setAmount] = useState(''); const player = modal.data; return ( <div className="form-group-stack"> <p>How many chips is <strong>{player.name}</strong> cashing out?</p> <p className="text-sm">Chips are returned to the box. Max cash out is {player.buyIn} chips.</p> <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" max={player.buyIn} min="1" step="1"/> <Button onClick={() => handleCashOut(player.id, parseInt(amount || 0))} variant="danger" disabled={!amount || parseInt(amount) <= 0 || parseInt(amount) > player.buyIn}> Confirm Cash Out </Button> </div> ); };
  const EndGameModalContent = () => {
    const [localCounts, setLocalCounts] = useState(() =>
        players.reduce((acc, p) => ({ ...acc, [p.id]: p.finalChips > 0 ? p.finalChips : '' }), {})
    );

    const handleLocalChange = (playerId, value) => {
        setLocalCounts(prev => ({ ...prev, [playerId]: value }));
    };

    return (
        <div className="form-group-stack">
            <h3>Enter Final Chip Counts</h3>
            <p className="text-sm">Enter the final number of chips each player has.</p>
            <div className="final-counts-list">
                {players.map(player => (
                    <div key={player.id} className="final-counts-item">
                        <label htmlFor={`player-${player.id}`}>{player.name}</label>
                        <input
                            id={`player-${player.id}`}
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={localCounts[player.id]}
                            placeholder="0"
                            onChange={(e) => handleLocalChange(player.id, e.target.value)}
                        />
                    </div>
                ))}
            </div>
            <Button onClick={() => handleEndGameCalculation(localCounts)} variant="danger">
                Calculate Final Results
            </Button>
        </div>
    );
  };
  const ErrorModalContent = () => ( <div className="text-center"> <p className="text-red">{modal.data.message}</p> <Button onClick={closeModal} variant="primary"> OK </Button> </div> );
  const SettingsModalContent = () => {
    const [url, setUrl] = useState(discordWebhookUrl);
    const [localChipAmount, setLocalChipAmount] = useState(400);
    const [localBahtAmount, setLocalBahtAmount] = useState(chipValue * 400);

    const handleSave = () => {
        if (localChipAmount > 0) {
            const newChipValue = localBahtAmount / localChipAmount;
            setChipValue(newChipValue);
        }
        handleWebhookSave(url);
        closeModal();
    };

    return (
        <div className="form-group-stack">
            <div className="form-group">
                <label>Session Chip Value</label>
                <p className="text-sm">Set the exchange rate for this game session.</p>
                <div className="chip-value-grid">
                    <input type="number" value={localChipAmount} onChange={(e) => setLocalChipAmount(parseInt(e.target.value, 10))} />
                    <span>chips =</span>
                    <div className="input-group">
                        <span>{currencySymbol}</span>
                        <input type="number" value={localBahtAmount} onChange={(e) => setLocalBahtAmount(parseInt(e.target.value, 10))} />
                    </div>
                </div>
                <p className="text-sm text-center">Calculated Value: 1 chip = {formatMoney(localChipAmount > 0 ? localBahtAmount / localChipAmount / chipValue : 0)}</p>
            </div>
            <div className="form-group">
                <label>Global Discord Webhook</label>
                <p className="text-sm">This URL is used for all sessions.</p>
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste Discord Webhook URL here"/>
            </div>
            <Button onClick={handleSave} variant="primary">Save Settings</Button>
        </div>
    );
  };
  const EditPlayerModalContent = () => { const player = modal.data; const [promptpay, setPromptpay] = useState(player.promptpayId || ''); return (<div className="form-group-stack"> <div className="form-group"> <label>PromptPay ID for {player.name}</label> <input type="text" value={promptpay} onChange={(e) => setPromptpay(e.target.value)} placeholder="e.g., 0812345678"/> </div> <Button onClick={() => handleUpdatePlayer(player.id, { promptpayId: promptpay })} variant="primary">Save PromptPay ID</Button> </div>); };
  const QrCodeModalContent = () => { const { url, from, to, amount } = modal.data; return (<div className="text-center"> <h3> <span className="text-red">{from}</span> pays <span className="text-green">{to}</span> </h3> <img src={url} alt="PromptPay QR Code" className="qr-code"/> <p className="qr-amount">{formatMoney(amount)}</p> </div>); };
  const NoQrCodeModalContent = () => { const { from, to, amount } = modal.data; return (<div className="text-center form-group-stack"> <AlertTriangle className="icon-lg text-yellow"/> <h3>No PromptPay ID for <strong>{to}</strong></h3> <p>Please have <strong>{from}</strong> transfer <strong>{formatMoney(amount)}</strong> manually.</p> <Button onClick={closeModal} variant="primary">OK</Button> </div>); };
  const ConsoleLog = () => ( <div className={`console-log ${showConsole ? 'show' : ''}`}> <div> <div className="console-header"> <h3>Transaction Log</h3> <button onClick={() => setShowConsole(false)}><X size={24}/></button> </div> <ul className="console-body"> {transactionLog.map(log => ( <li key={log.id}> <span>{new Date(log.timestamp).toLocaleTimeString()}:</span> {log.ip && <span className="log-ip">[{log.ip}]</span>} <span className="log-type">{log.type}</span> {log.player && <span>Player: {log.player}</span>} {log.amount && <span>Amount: {log.amount}</span>} {log.source && <span>Source: {log.source}</span>} {log.message && <span>{log.message}</span>} </li> ))} </ul> </div> </div> );

  return (
    <div className="app-container">
      <header>
        <div className="header-main">
            <h1>Poker Night Ledger</h1>
            <p>Effortlessly track buy-ins and settle up.</p>
        </div>
        <div className="header-user-info">
            <span>Logged in as: <strong>{username}</strong> <span className="user-role">{userRole}</span></span>
            <div className="header-actions">
              <Button onClick={() => openModal('profile')} variant="secondary" className="stats-btn"><UserIcon/></Button>
              {isAdmin && <Button onClick={() => setView('admin')} variant="secondary" className="stats-btn"><Crown/></Button>}
              <Button onClick={() => setView('blinds')} variant="secondary" className="stats-btn" disabled={!sessionActive}><Timer/></Button>
              <Button onClick={() => openModal('settings')} variant="secondary" className="settings-btn"><Settings/></Button>
              <Button onClick={() => signOut(auth)} variant="danger" className="logout-btn"><LogOut/></Button>
            </div>
        </div>
      </header>
      <main>
          {!sessionActive ? ( renderSessionManager() ) : finalCalculations ? ( renderSummary() ) : (
              <>
                  {isLoadingSession ? <p className="loading-text">Loading Session...</p> : 
                  <>
                      <div className="main-grid">
                          {renderSessionManager()}
                          {(isAdmin || isGameMaker) && renderAddPlayerForm()}
                          {!hasJoined && renderJoinLobby()}
                          {players.length > 0 ? renderPlayerList() : (
                            !isAdmin && !isGameMaker && <Card><p className="text-center">Lobby is empty. Join the game or ask a Game Maker to add guests.</p></Card>
                          )}
                      </div>
                  </>
                  }
              </>
          )}
      </main>
      <footer>
          <p>&copy; 2024 - Built for poker nights with friends.</p>
          <button onClick={() => setShowConsole(true)} disabled={!sessionActive}> <BookOpen className="icon-sm"/> Show Log </button>
      </footer>
      <Modal isOpen={modal.isOpen} onClose={closeModal} title={ modal.type === 'buy-in' ? 'Buy Chips' : modal.type === 'cash-out' ? 'Cash Out' : modal.type === 'end-game' ? 'End Game' : modal.type === 'error' ? <><AlertTriangle className="icon"/> Balance Error</> : modal.type === 'settings' ? <><Settings className="icon"/> Global Settings</> : modal.type === 'edit-player' ? <><QrCode className="icon"/> Edit PromptPay ID</> : modal.type === 'show-qr' ? 'PromptPay Payment' : modal.type === 'no-qr' ? 'Manual Transfer Required' : modal.type === 'self-buy-in' ? 'Join & Buy-in' : modal.type === 'profile' ? 'Edit Profile' : '' }>
          {modal.type === 'buy-in' && <BuyInModalContent />}
          {modal.type === 'cash-out' && <CashOutModalContent />}
          {modal.type === 'end-game' && <EndGameModalContent />}
          {modal.type === 'error' && <ErrorModalContent />}
          {modal.type === 'settings' && <SettingsModalContent />}
          {modal.type === 'edit-player' && <EditPlayerModalContent />}
          {modal.type === 'show-qr' && <QrCodeModalContent />}
          {modal.type === 'no-qr' && <NoQrCodeModalContent />}
          {modal.type === 'self-buy-in' && <SelfBuyInModalContent />}
          {modal.type === 'profile' && <ProfileModalContent currentUser={currentUser} userProfile={userProfile} setUserProfile={setUserProfile} db={db} appId={appId} closeModal={closeModal} />}
      </Modal>
      <ConsoleLog />
    </div>
  );
}

// --- Profile Modal Content ---
function ProfileModalContent({ currentUser, userProfile, setUserProfile, db, appId, closeModal }) {
    const [displayName, setDisplayName] = useState(userProfile?.displayName || '');

    const handleSave = async () => {
        const userDocRef = doc(db, `artifacts/${appId}/public/data/users/${currentUser.uid}`);
        const newProfile = { ...userProfile, displayName };
        await setDoc(userDocRef, newProfile, { merge: true });
        setUserProfile(newProfile);
        closeModal();
    };

    return (
        <div className="form-group-stack">
            <div className="form-group">
                <label>Display Name</label>
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="form-group">
                <label>User ID (for Admin setup)</label>
                <input type="text" value={currentUser.uid} readOnly />
            </div>
            <Button onClick={handleSave} variant="primary">Save Profile</Button>
        </div>
    );
}
