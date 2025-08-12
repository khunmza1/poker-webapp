import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, ArrowRight, X, Users, DollarSign, Calculator, Eraser, AlertTriangle, Settings, ChevronDown, ChevronUp, BookOpen, LogIn, PlusCircle, ArrowLeft, Bot, QrCode, Timer, Play, Pause, RefreshCw, SkipForward, SkipBack, Star, LogOut, Crown, User as UserIcon, Bell, BarChart2, Send } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { getMessaging, getToken } from "firebase/messaging"; // Import Firebase Messaging

// --- Firebase Configuration ---
// This should be populated by your environment variables (e.g., Vite)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// --- Helper Components ---
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
                {error && <p className="text-red">{error}</p>}
                <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input type="text" id="username" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
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
  const [messaging, setMessaging] = useState(null);
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
        // Initialize messaging only if supported
        if ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
            const messagingInstance = getMessaging(app);
            setMessaging(messagingInstance);
        }

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

  if (isLoading) return <div className="loading-fullscreen">Loading...</div>;
  if (!currentUser) return <><WelcomePage onLogin={() => openAuthModal('login')} onRegister={() => openAuthModal('register')} /><AuthModal isOpen={authModal.isOpen} onClose={closeAuthModal} auth={auth} initialMode={authModal.mode} /></>;
  return <MainApp currentUser={currentUser} userProfile={userProfile} setUserProfile={setUserProfile} auth={auth} db={db} messaging={messaging} isAdmin={isAdmin} isGameMaker={isGameMaker} appId={appId} />;
}

// --- Independent Components ---
const StatsView = ({ db, appId, setView, currencySymbol }) => {
    const [statsData, setStatsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!db) return;
            setIsLoading(true);
            try {
                const sessionsRef = collection(db, `artifacts/${appId}/public/data/poker-sessions`);
                const q = query(sessionsRef, where('gameState', '==', 'finished'));
                const querySnapshot = await getDocs(q);
                
                const playerStats = {};
                querySnapshot.forEach(doc => {
                    const session = doc.data();
                    if (session.finalCalculations?.players) {
                        session.finalCalculations.players.forEach(player => {
                            if (!playerStats[player.name]) {
                                playerStats[player.name] = { name: player.name, totalGames: 0, totalProfit: 0, wins: 0, losses: 0 };
                            }
                            playerStats[player.name].totalGames++;
                            const profitInCurrency = player.balance * (session.chipValue || 0.5);
                            playerStats[player.name].totalProfit += profitInCurrency;
                            if (player.balance > 0) playerStats[player.name].wins++;
                            else if (player.balance < 0) playerStats[player.name].losses++;
                        });
                    }
                });
                
                const statsArray = Object.values(playerStats).sort((a, b) => b.totalProfit - a.totalProfit);
                setStatsData(statsArray);
            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, [db, appId]);

    if (isLoading) return <div className="loading-fullscreen">Loading Stats...</div>;

    return (
        <Card>
            <h2 className="section-title"><BarChart2 className="icon"/> Player Statistics</h2>
            <Button onClick={() => setView('game')} variant="secondary" className="back-btn"><ArrowLeft className="icon"/> Back to Game</Button>
            <div className="stats-list">
                {statsData.length === 0 ? <p className="text-center" style={{padding: '1rem'}}>No completed games found.</p> :
                 statsData.map(player => (
                    <div key={player.name} className="stats-item">
                        <div className="stats-player-name">{player.name}</div>
                        <div className="stats-player-profit" style={{ color: player.totalProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {player.totalProfit >= 0 ? '+' : ''}{currencySymbol}{player.totalProfit.toFixed(2)}
                        </div>
                        <div className="stats-player-details">
                           Games: {player.totalGames} | Wins: {player.wins} | Losses: {player.losses}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const FinalCountsView = ({ sessionData, players, currentUser, isAdmin, isGameMaker, db, appId, sessionId, handleEndGameCalculation }) => {
    const finalChipCounts = sessionData.finalChipCounts || {};

    const handleCountChange = async (playerId, value) => {
        const newCounts = {
            ...finalChipCounts,
            [playerId]: value === '' ? null : parseInt(value, 10)
        };
        const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
        await updateDoc(sessionRef, { finalChipCounts: newCounts });
    };

    const totalChipsEntered = Object.values(finalChipCounts).reduce((sum, count) => sum + (count || 0), 0);
    const totalNetBuyIn = players.reduce((sum, p) => sum + p.buyIn, 0);

    return (
        <Card>
            <h2 className="section-title"><Calculator className="icon"/> Enter Final Chip Counts</h2>
            <p className="text-center text-sm">All players should enter their final count. The Game Maker will verify and finalize the results.</p>
            <div className="final-counts-list" style={{margin: '1rem 0'}}>
                {players.map(player => {
                    const isCurrentUserPlayer = player.uid === currentUser.uid;
                    const canEdit = isAdmin || isGameMaker || isCurrentUserPlayer;
                    return (
                        <div key={player.id} className="final-counts-item">
                            <label htmlFor={`player-${player.id}`}>{player.name}</label>
                            <input
                                id={`player-${player.id}`}
                                type="number"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={finalChipCounts[player.id] == null ? '' : finalChipCounts[player.id]}
                                placeholder="Enter count"
                                onChange={(e) => handleCountChange(player.id, e.target.value)}
                                disabled={!canEdit}
                                className={!canEdit ? 'disabled-input' : ''}
                            />
                        </div>
                    )
                })}
            </div>
            <div className="game-summary-footer">
                <h3>Total Chips Entered: <span style={{color: totalChipsEntered !== totalNetBuyIn ? 'var(--red)' : 'var(--green)'}}>{totalChipsEntered} / {totalNetBuyIn}</span></h3>
                {(isAdmin || isGameMaker) && (
                    <Button 
                        onClick={() => handleEndGameCalculation(finalChipCounts)} 
                        variant="danger"
                        disabled={totalChipsEntered !== totalNetBuyIn}
                    >
                        Calculate Final Results
                    </Button>
                )}
            </div>
        </Card>
    );
};

// --- Main Application Logic (after login) ---
function MainApp({ currentUser, userProfile, setUserProfile, auth, db, messaging, isAdmin, isGameMaker, appId }) {
    const [view, setView] = useState('game');
    const [players, setPlayers] = useState([]);
    const [transactionLog, setTransactionLog] = useState([]);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [modal, setModal] = useState({ isOpen: false, type: null, data: null });
    const [finalCalculations, setFinalCalculations] = useState(null);
    const [chipValue, setChipValue] = useState(0.5);
    const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
    const [expandedPlayerId, setExpandedPlayerId] = useState(null);
    const [expandedSummaryPlayerId, setExpandedSummaryPlayerId] = useState(null);
    const [userIp, setUserIp] = useState('unknown');
    const [quickAddPlayers, setQuickAddPlayers] = useState([]);
    
    const [sessionId, setSessionId] = useState('');
    const [sessionData, setSessionData] = useState(null);
    const [availableSessions, setAvailableSessions] = useState([]);
    const [isLoadingSession, setIsLoadingSession] = useState(false);
    const [sessionActive, setSessionActive] = useState(false);
    const unsubscribeRef = useRef(null);
    
    const currencySymbol = '฿';
    const username = useMemo(() => userProfile?.displayName || (currentUser.email || 'user').split('@')[0], [currentUser.email, userProfile]);
    const userRole = useMemo(() => isAdmin ? '(Admin)' : isGameMaker ? '(Game Maker)' : '(Player)', [isAdmin, isGameMaker]);
    const hasJoined = useMemo(() => players.some(p => p.uid === currentUser.uid), [players, currentUser.uid]);

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
            finalChipCounts: {}, // NEW: Initialize this field
            gameState: 'in_progress',
            datePrefix: newSessionId.split('-')[0],
            blinds: [ { sb: 5, bb: 10 }, { sb: 10, bb: 20 }, { sb: 15, bb: 30 }, { sb: 20, bb: 40 }, { sb: 25, bb: 50 }, { sb: 30, bb: 60 } ],
            timerDuration: 480,
        };
        const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, newSessionId);
        await setDoc(sessionRef, initialState);
        await fetchRecentSessions();
        setSessionId(newSessionId);
        listenToSession(newSessionId);
        setSessionActive(true);
        setIsLoadingSession(false);
        setView('game');
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
          setView('game');
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
          
          if (data.gameState === 'awaiting_counts') {
              setView('final-counts');
          } else if (data.gameState === 'finished' && data.finalCalculations) {
              setView('game'); // Let the main router show the summary
          } else if (view === 'final-counts' && data.gameState === 'in_progress') {
              setView('game');
          }
        }
      });
    };

    useEffect(() => {
        if (!sessionActive || isLoadingSession) return;
        const handler = setTimeout(() => {
            if (db && sessionId && sessionData) {
                const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
                const dataToSave = { 
                    players: players, 
                    transactionLog: transactionLog, 
                };
                updateDoc(sessionRef, dataToSave).catch(err => console.error("Error debounced saving session:", err));
            }
        }, 2000);
        return () => { clearTimeout(handler); };
    }, [players, transactionLog, sessionActive, db, sessionId, appId, isLoadingSession, sessionData]);

    const formatMoney = (amountInChips) => { const value = amountInChips * chipValue; return `${currencySymbol}${value.toFixed(2)}`; };
    const logTransaction = (log) => { const newLog = { id: Date.now(), timestamp: new Date().toISOString(), ip: userIp, ...log }; setTransactionLog(prevLogs => [...prevLogs, newLog]); };
    
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
        if (db && data.promptpayId !== undefined) {
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
    
    const handleBuyIn = (buyerId, amount) => {
        const buyer = players.find(p => p.id === buyerId);
        if (!buyer) return;
        setPlayers(prevPlayers => prevPlayers.map(p => p.id === buyerId ? { ...p, buyIn: p.buyIn + amount } : p ));
        logTransaction({ type: 'Player Buy-in', player: buyer.name, amount, source: 'Central Box' });
        closeModal();
    };

    const handleCashOut = (playerId, amount) => {
        const player = players.find(p => p.id === playerId); if (!player || !amount || amount <= 0) return;
        logTransaction({ type: 'Cash Out', player: player.name, amount });
        setPlayers(prevPlayers => prevPlayers.map(p => p.id === playerId ? { ...p, buyIn: p.buyIn - amount } : p));
        closeModal();
    };

    const handleEndGameCalculation = (finalChipCounts) => {
        const updatedPlayers = players.map(p => ({ ...p, finalChips: parseInt(finalChipCounts[p.id] || 0, 10) }));
        const playersWithBalance = updatedPlayers.map(p => ({ ...p, balance: p.finalChips - p.buyIn }));
        
        const totalFinalChips = playersWithBalance.reduce((sum, p) => sum + p.finalChips, 0);
        const totalNetBuyIn = playersWithBalance.reduce((sum, p) => sum + p.buyIn, 0);
        
        if (Math.abs(totalFinalChips - totalNetBuyIn) > 0.01) {
            openModal('error', { message: `Balance mismatch! Total final chips (${totalFinalChips}) do not equal total net buy-ins (${totalNetBuyIn}).` });
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
        
        const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
        updateDoc(sessionRef, { gameState: 'finished', finalCalculations: finalData, players: updatedPlayers });
        logTransaction({ type: 'Game End Summary', summary: finalData });
        setView('game'); // Switch back to the main view router, which will show the summary
    };
    
    const handleBackToGame = () => { 
        logTransaction({ type: 'Game Resumed', message: 'Returned to game from summary.' }); 
        const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
        updateDoc(sessionRef, { gameState: 'in_progress', finalCalculations: null, finalChipCounts: {} });
        setView('game');
    };

    const handleSendTestNotification = async () => {
        if (!isAdmin) {
            alert("You don't have permission to do this.");
            return;
        }
        try {
            const taskRef = doc(collection(db, `artifacts/${appId}/tasks`));
            await setDoc(taskRef, {
                type: 'sendTestNotification',
                requestedBy: currentUser.uid,
                displayName: userProfile.displayName,
                timestamp: serverTimestamp()
            });
            alert("Request sent! A test notification will be sent to all subscribed users via your Cloud Function.");
        } catch (error) {
            console.error("Error requesting test notification:", error);
            alert("Failed to send request. See console for details.");
        }
    };

    const resetGame = () => { startNewSession() };
    const openModal = (type, data = null) => setModal({ isOpen: true, type, data });
    const closeModal = () => setModal({ isOpen: false, type: null, data: null });
    const togglePlayerExpansion = (playerId) => { setExpandedPlayerId(prevId => (prevId === playerId ? null : playerId)); };
    const toggleSummaryExpansion = (playerId) => { setExpandedSummaryPlayerId(prevId => (prevId === playerId ? null : playerId)); };
    const totalBuyInFromBox = useMemo(() => players.reduce((sum, p) => sum + p.buyIn, 0), [players]);

    // --- Render Functions ---
    const renderAdminPanel = () => (
        <Card>
            <h2 className="section-title"><Crown className="icon"/> Admin Panel</h2>
            <Button onClick={() => setView('game')} variant="secondary" className="back-btn"><ArrowLeft className="icon"/> Back to Game</Button>
            <div className="form-group-stack" style={{marginTop: '1rem'}}>
                <h3>Push Notifications</h3>
                <p className="text-sm">This will trigger your backend Cloud Function to send a test push notification to all users who have subscribed.</p>
                <Button onClick={handleSendTestNotification} variant="primary"><Send className="icon"/> Send Test Notification</Button>
            </div>
        </Card>
    );
    
    const renderBlindsTimer = () => {
        const [currentLevel, setCurrentLevel] = useState(0);
        const [timeLeft, setTimeLeft] = useState(sessionData?.timerDuration || 480);
        const [isRunning, setIsRunning] = useState(false);
        const timerRef = useRef(null);
        
        useEffect(() => {
            if (sessionData?.timerDuration) {
                setTimeLeft(sessionData.timerDuration);
            }
            return () => {
                if (timerRef.current) clearInterval(timerRef.current);
            };
        }, [sessionData]);
        
        const startTimer = () => {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRunning(true);
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        setCurrentLevel(current => {
                            const nextLevel = current + 1;
                            if (sessionData?.blinds && nextLevel < sessionData.blinds.length) {
                                return nextLevel;
                            }
                            clearInterval(timerRef.current);
                            setIsRunning(false);
                            return current;
                        });
                        return sessionData?.timerDuration || 480;
                    }
                    return prev - 1;
                });
            }, 1000);
        };
        
        const pauseTimer = () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                setIsRunning(false);
            }
        };
        
        const resetTimer = () => {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRunning(false);
            setTimeLeft(sessionData?.timerDuration || 480);
        };
        
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
        };
        
        const blindLevels = sessionData?.blinds || [];
        const currentBlinds = blindLevels[Math.min(currentLevel, blindLevels.length - 1)];
        const nextBlinds = currentLevel < blindLevels.length - 1 ? blindLevels[currentLevel + 1] : null;
        
        return (
            <Card>
                <h2 className="section-title"><Timer className="icon"/> Blinds Timer</h2>
                <Button onClick={() => setView('game')} variant="secondary" className="back-btn">
                    <ArrowLeft className="icon"/> Back to Game
                </Button>
                
                <div className="blinds-timer-display">
                    <div className="blinds-info">
                        <h3>Current Level: {currentLevel + 1}</h3>
                        <div className="current-blinds">{currentBlinds?.sb}/{currentBlinds?.bb}</div>
                        {nextBlinds && <div className="next-blinds">Next: {nextBlinds.sb}/{nextBlinds.bb}</div>}
                    </div>
                    <div className="timer-clock">{formatTime(timeLeft)}</div>
                    <div className="timer-controls">
                        {!isRunning ? (
                            <Button onClick={startTimer} variant="primary"><Play className="icon"/> Start</Button>
                        ) : (
                            <Button onClick={pauseTimer} variant="secondary"><Pause className="icon"/> Pause</Button>
                        )}
                        <Button onClick={resetTimer} variant="secondary"><RefreshCw className="icon"/> Reset</Button>
                        <Button onClick={() => setCurrentLevel(prev => Math.min(prev + 1, blindLevels.length - 1))} variant="secondary" disabled={currentLevel >= blindLevels.length - 1}>
                            <SkipForward className="icon"/> Next Level
                        </Button>
                        <Button onClick={() => setCurrentLevel(prev => Math.max(0, prev - 1))} variant="secondary" disabled={currentLevel === 0}>
                            <SkipBack className="icon"/> Prev Level
                        </Button>
                    </div>
                </div>
            </Card>
        );
    };
    const renderSessionManager = () => ( <Card> <h2 className="section-title">Session Management</h2> <div className="session-manager-grid"> <div className="form-group"> <label htmlFor="sessionSelect">Recent Sessions (Last 30 Days)</label> <select id="sessionSelect" value={sessionId} onChange={handleSessionSelect}> <option value="">-- Select a Session --</option> {availableSessions.map(sid => <option key={sid} value={sid}>{sid}</option>)} </select> </div> {(isAdmin || isGameMaker) && <Button onClick={startNewSession} variant="primary" disabled={isLoadingSession}><PlusCircle className="icon"/> New Session</Button>} </div> {sessionActive && <p className="session-active-text">Live Session: <strong>{sessionId}</strong></p>} </Card> );
    const renderJoinLobby = () => (
        <Card>
            <h2 className="section-title">Join Game Lobby</h2>
            {players.find(p => p.status === 'guest' && p.name.toLowerCase() === username.toLowerCase()) ? (
                <div className="join-game-actions">
                    <p>A guest named <strong>{username}</strong> is in the lobby. Is this you?</p>
                    <Button onClick={() => openModal('self-buy-in', { player: players.find(p => p.name.toLowerCase() === username.toLowerCase()) })} variant="success">Yes, Join & Buy-in</Button>
                </div>
            ) : (
                <div className="join-game-actions">
                    <p>You are not in the game yet.</p>
                    <Button onClick={() => openModal('self-buy-in', { name: username, isNewPlayer: true })} variant="success">Join Game as {username}</Button>
                </div>
            )}
        </Card>
    );
    const renderAddPlayerForm = () => ( <Card> <h2 className="section-title"><Users className="icon"/>Add Guest Players</h2> <form className="add-player-form" onSubmit={(e) => handleAddPlayer(e, 400)}> <input type="text" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Enter guest's name"/> <div className="button-group"> <Button onClick={(e) => handleAddPlayer(e, 0)} variant="secondary" disabled={!newPlayerName.trim()}>Add Guest</Button> <Button type="submit" variant="primary" disabled={!newPlayerName.trim()}>Add Guest & Buy-in 400</Button> </div> </form> <div className="quick-add-section"> <h3>Quick Add Guests</h3> <div className="quick-add-grid"> {quickAddPlayers.map(name => ( <Button key={name} onClick={() => handleQuickAdd(name)} variant="success" disabled={players.some(p => p.name === name)}> <Plus size={16} className="icon"/> {name} </Button> ))} </div> </div> </Card> );
    const renderPlayerList = () => ( <Card> <h2 className="section-title">Lobby & Game</h2> <div className="player-list"> {players.map(player => ( <div key={player.id} className={`player-list-item ${player.uid === currentUser.uid ? 'is-current-user' : ''}`}> <div className="player-list-item-header"> <div className="player-name-group"> <button onClick={() => togglePlayerExpansion(player.id)} className="player-name-btn"> {player.name} {player.status === 'joined' ? <span className="status-dot joined"></span> : <span className="status-dot guest"></span>} {expandedPlayerId === player.id ? <ChevronUp className="icon-sm"/> : <ChevronDown className="icon-sm"/>} </button> {isAdmin && <Button onClick={() => toggleQuickAdd(player.name)} variant="secondary" className={`promptpay-btn ${quickAddPlayers.includes(player.name) ? 'is-quick-add' : ''}`}><Star size={14}/></Button>} <Button onClick={() => openModal('edit-player', player)} variant="secondary" className="promptpay-btn">PromptPay ID</Button> </div> <div className="player-info-group"> <span>Net Buy-in: <strong>{player.buyIn} chips</strong></span> <div className="button-group"> {player.status === 'guest' && !hasJoined && ( <Button onClick={() => openModal('self-buy-in', { player })} variant="success"> Join Game </Button> )} {((isAdmin || isGameMaker) || (player.uid === currentUser.uid && player.status === 'joined')) && ( <Button onClick={() => openModal('buy-in', player)} variant="primary">Buy Chips</Button> )} {(isAdmin || isGameMaker) && ( <Button onClick={() => openModal('cash-out', player)} variant="secondary" disabled={player.buyIn <= 0}>Cash Out</Button> )} </div> </div> </div> {expandedPlayerId === player.id && ( <div className="transaction-history-container"> <h4>Transaction History</h4> <ul> {transactionLog.filter(log => log.player === player.name || (log.source && log.source.includes(player.name))).map(log => { let logClass = ''; if (log.type.includes('Buy-in')) { logClass = log.source === 'Central Box' ? 'log-buy-box' : 'log-buy-player'; } else if (log.type === 'Cash Out') { logClass = 'log-cashout'; } return ( <li key={log.id} className={logClass}> <span>{new Date(log.timestamp).toLocaleTimeString()} - {log.type}</span> <span>{log.amount && `${log.amount} chips`} {log.source && `(${log.source})`}</span> </li> ); })} </ul> </div> )} </div> ))} </div> <div className="game-summary-footer"> <h3>Total in Play (from Box): <span className="text-green">{totalBuyInFromBox} chips</span></h3> {(isAdmin || isGameMaker) && <Button onClick={() => { const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId); updateDoc(sessionRef, { gameState: 'awaiting_counts' }); }} variant="danger" disabled={players.length < 2}> <Calculator className="icon"/> End Game </Button>} </div> </Card> );
    const renderSummary = () => ( <Card className="summary-card"> <h2 className="summary-title">Game Over: Final Tally</h2> <p className="session-id-summary">Session ID: {sessionId}</p> <h3 className="section-title">Player Results</h3> <div className="player-results-list"> {finalCalculations.players.map(player => ( <div key={player.id} className="player-result-item"> <button onClick={() => toggleSummaryExpansion(player.id)} className="player-result-header"> <div> <span>{player.name}</span> <div className="player-result-details">Net Buy-in: {player.buyIn} chips | Final: {player.finalChips} chips</div> </div> <div className="player-result-balance-group"> <span className={player.balance >= 0 ? 'text-green' : 'text-red'}> {player.balance >= 0 ? `+ ${formatMoney(player.balance)}` : `- ${formatMoney(Math.abs(player.balance))}`} </span> {expandedSummaryPlayerId === player.id ? <ChevronUp className="icon-sm"/> : <ChevronDown className="icon-sm"/>} </div> </button> {expandedSummaryPlayerId === player.id && ( <div className="transaction-history-container"> <h4>Transaction History</h4> <ul> {transactionLog.filter(log => log.player === player.name || (log.source && log.source.includes(player.name))).map(log => { let logClass = ''; if (log.type.includes('Buy-in')) { logClass = log.source === 'Central Box' ? 'log-buy-box' : 'log-buy-player'; } else if (log.type === 'Cash Out') { logClass = 'log-cashout'; } return ( <li key={log.id} className={logClass}> <span>{new Date(log.timestamp).toLocaleTimeString()} - {log.type}</span> <span>{log.amount && `${log.amount} chips`} {log.source && `(${log.source})`}</span> </li> ); })} </ul> </div> )} </div> ))} </div> <h3 className="section-title">Settlement Transactions</h3> <div className="settlement-list"> {finalCalculations.transactions.map((t, index) => { const recipient = players.find(p => p.name === t.to); const hasPromptPay = recipient && recipient.promptpayId; const qrUrl = hasPromptPay ? `https://promptpay.io/${recipient.promptpayId}/${(t.amount * chipValue).toFixed(2)}` : ''; return ( <button key={index} onClick={() => { if(hasPromptPay) { openModal('show-qr', { url: qrUrl, from: t.from, to: t.to, amount: t.amount }) } else { openModal('no-qr', { from: t.from, to: t.to, amount: t.amount }) } }} className="settlement-item"> <span className="text-red">{t.from}</span> <ArrowRight className="icon-sm" /> <span className="text-green">{t.to}</span> <ArrowRight className="icon-sm" /> <span>{formatMoney(t.amount)}</span> </button> );})} </div> <div className="summary-actions"> <Button onClick={handleBackToGame} variant="secondary"> <ArrowLeft className="icon"/> Back to Game </Button> <Button onClick={resetGame} variant="primary"> <Eraser className="icon"/> Start New Session </Button> </div> </Card> );
    
    // --- MODAL CONTENT ---
    const BuyInModalContent = () => {
        const [amount, setAmount] = useState('400');
        const player = modal.data;
        return (
          <div className="form-group-stack">
            <p>How many chips is <strong>{player.name}</strong> buying?</p>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="1" step="1" />
            <p>Buy from:</p>
            <select value="central-box" readOnly disabled>
              <option value="central-box">Central Box</option>
            </select>
            <Button onClick={() => handleBuyIn(player.id, parseInt(amount || 0))} variant="success" disabled={!amount || parseInt(amount) <= 0}> Confirm Buy-in </Button>
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
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="1" step="1" />
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
    const CashOutModalContent = () => {
        const [amount, setAmount] = useState('');
        const player = modal.data;
        return ( <div className="form-group-stack"> <p>How many chips is <strong>{player.name}</strong> cashing out?</p> <p className="text-sm">Chips are returned to the box. Max cash out is {player.buyIn} chips.</p> <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" max={player.buyIn} min="1" step="1"/> <Button onClick={() => handleCashOut(player.id, parseInt(amount || 0))} variant="danger" disabled={!amount || parseInt(amount) <= 0 || parseInt(amount) > player.buyIn}> Confirm Cash Out </Button> </div> );
    };
    const ErrorModalContent = () => ( <div className="text-center"> <p className="text-red">{modal.data.message}</p> <Button onClick={closeModal} variant="primary"> OK </Button> </div> );
    const SettingsModalContent = () => {
        const [url, setUrl] = useState(discordWebhookUrl);
        const [localChipAmount, setLocalChipAmount] = useState(400);
        const [localBahtAmount, setLocalBahtAmount] = useState(chipValue * 400);
        const newChipValue = localChipAmount > 0 ? localBahtAmount / localChipAmount : 0;
    
        const handleSave = async () => {
            if (newChipValue > 0 && sessionActive) {
                const sessionRef = doc(db, `artifacts/${appId}/public/data/poker-sessions`, sessionId);
                await updateDoc(sessionRef, { chipValue: newChipValue });
                setChipValue(newChipValue);
            }
            if (db) {
                const settingsRef = doc(db, `artifacts/${appId}/public/data/global_settings/config`);
                await setDoc(settingsRef, { discordWebhookUrl: url }, { merge: true });
                setDiscordWebhookUrl(url);
            }
            closeModal();
        };
    
        return (
            <div className="form-group-stack">
                <div className="form-group">
                    <label>Session Chip Value</label>
                    <p className="text-sm">Set the exchange rate for the current game session.</p>
                    <div className="chip-value-grid">
                        <input type="number" value={localChipAmount} onChange={(e) => setLocalChipAmount(parseInt(e.target.value, 10))} />
                        <span>chips =</span>
                        <div className="input-group">
                            <span>{currencySymbol}</span>
                            <input type="number" value={localBahtAmount} onChange={(e) => setLocalBahtAmount(parseInt(e.target.value, 10))} />
                        </div>
                    </div>
                    <p className="text-sm text-center">Calculated Value: 1 chip = {currencySymbol}{newChipValue.toFixed(2)}</p>
                </div>
                <div className="form-group">
                    <label>Global Discord Webhook</label>
                    <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste Discord Webhook URL here"/>
                </div>
                <Button onClick={handleSave} variant="primary">Save Settings</Button>
            </div>
        );
    };
    const EditPlayerModalContent = () => {
        const player = modal.data;
        const [promptpay, setPromptpay] = useState(player.promptpayId || '');
        return (<div className="form-group-stack"> <div className="form-group"> <label>PromptPay ID for {player.name}</label> <input type="text" value={promptpay} onChange={(e) => setPromptpay(e.target.value)} placeholder="e.g., 0812345678"/> </div> <Button onClick={() => handleUpdatePlayer(player.id, { promptpayId: promptpay })} variant="primary">Save PromptPay ID</Button> </div>);
    };
    const QrCodeModalContent = () => {
        const { url, from, to, amount } = modal.data;
        return (<div className="text-center"> <h3> <span className="text-red">{from}</span> pays <span className="text-green">{to}</span> </h3> <img src={url} alt="PromptPay QR Code" className="qr-code"/> <p className="qr-amount">{formatMoney(amount)}</p> </div>);
    };
    const NoQrCodeModalContent = () => {
        const { from, to, amount } = modal.data;
        return (<div className="text-center form-group-stack"> <AlertTriangle className="icon-lg text-yellow"/> <h3>No PromptPay ID for <strong>{to}</strong></h3> <p>Please have <strong>{from}</strong> transfer <strong>{formatMoney(amount)}</strong> manually.</p> <Button onClick={closeModal} variant="primary">OK</Button> </div>);
    };

    // --- MAIN RETURN ---
    return (
        <div className="app-container">
            <header>
                <div className="header-main">
                    <h1>Poker Night Ledger</h1>
                    <p>Track chips, buy-ins, and payouts in real-time</p>
                </div>
                <div className="header-user-info">
                    <span>Logged in as <strong>{username}</strong> <span className="user-role">{userRole}</span></span>
                    <div className="header-actions">
                        <Button onClick={() => openModal('profile')} variant="secondary" className="stats-btn"><UserIcon/></Button>
                        {isAdmin && <Button onClick={() => setView('admin')} variant="secondary" className="stats-btn"><Crown/></Button>}
                        <Button onClick={() => setView('stats')} variant="secondary" className="stats-btn"><BarChart2 className="icon"/></Button>
                        <Button onClick={() => setView('blinds')} variant="secondary" className="stats-btn" disabled={!sessionActive}><Timer/></Button>
                        <Button onClick={() => openModal('settings')} variant="secondary" className="settings-btn"><Settings/></Button>
                        <Button onClick={() => signOut(auth)} variant="danger" className="logout-btn"><LogOut/></Button>
                    </div>
                </div>
            </header>
            
            <main>
                {view === 'admin' ? renderAdminPanel()
                 : view === 'blinds' ? renderBlindsTimer()
                 : view === 'stats' ? <StatsView db={db} appId={appId} setView={setView} currencySymbol={currencySymbol} />
                 : view === 'final-counts' ? <FinalCountsView sessionData={sessionData} players={players} currentUser={currentUser} isAdmin={isAdmin} isGameMaker={isGameMaker} db={db} appId={appId} sessionId={sessionId} handleEndGameCalculation={handleEndGameCalculation} />
                 : !sessionActive ? renderSessionManager()
                 : finalCalculations ? renderSummary()
                 : (
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
                 )
                }
            </main>
            
            <Modal 
                isOpen={modal.isOpen} 
                onClose={closeModal} 
                title={
                    modal.type === 'buy-in' ? 'Buy Chips' :
                    modal.type === 'self-buy-in' ? 'Join Game & Buy-in' :
                    modal.type === 'cash-out' ? 'Cash Out' :
                    modal.type === 'error' ? 'Error' :
                    modal.type === 'settings' ? 'Settings' :
                    modal.type === 'profile' ? 'User Profile' :
                    modal.type === 'edit-player' ? 'Edit Player' :
                    modal.type === 'show-qr' ? 'PromptPay QR Code' :
                    modal.type === 'no-qr' ? 'No PromptPay ID' :
                    'Modal'
                }
            >
                {modal.type === 'buy-in' && <BuyInModalContent />}
                {modal.type === 'self-buy-in' && <SelfBuyInModalContent />}
                {modal.type === 'cash-out' && <CashOutModalContent />}
                {modal.type === 'error' && <ErrorModalContent />}
                {modal.type === 'settings' && <SettingsModalContent />}
                {modal.type === 'profile' && <ProfileModalContent currentUser={currentUser} userProfile={userProfile} setUserProfile={setUserProfile} db={db} messaging={messaging} appId={appId} closeModal={closeModal} />}
                {modal.type === 'edit-player' && <EditPlayerModalContent />}
                {modal.type === 'show-qr' && <QrCodeModalContent />}
                {modal.type === 'no-qr' && <NoQrCodeModalContent />}
            </Modal>
        </div>
    );
}

const ProfileModalContent = ({ currentUser, userProfile, setUserProfile, db, messaging, appId, closeModal }) => {
    const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
    const [notificationStatus, setNotificationStatus] = useState('unknown');
    const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);

    useEffect(() => {
        if ('Notification' in window) {
            setNotificationStatus(Notification.permission);
        }
    }, []);

    const handleSave = async () => {
        const userDocRef = doc(db, `artifacts/${appId}/public/data/users/${currentUser.uid}`);
        const newProfile = { ...userProfile, displayName };
        await setDoc(userDocRef, newProfile, { merge: true });
        setUserProfile(newProfile);
        closeModal();
    };
    
    const enableNotifications = async () => {
        if (!messaging) {
            alert("Firebase Messaging is not initialized. Your browser may not support push notifications.");
            return;
        }

        setIsEnablingNotifications(true);
        
        try {
            const permission = await Notification.requestPermission();
            setNotificationStatus(permission);
            
            if (permission === 'granted') {
                console.log("Notification permission granted.");
                
                const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
                if (!vapidKey || vapidKey.trim() === '') {
                    throw new Error("VAPID public key is missing or empty. Please set VITE_VAPID_PUBLIC_KEY in your .env file. You can find this key in your Firebase project settings under Cloud Messaging -> Web Push certificates.");
                }

                // Get the token
                const currentToken = await getToken(messaging, { vapidKey: vapidKey });

                if (currentToken) {
                    console.log('FCM Token:', currentToken);
                    // Save the token to Firestore. Using a different field for FCM token.
                    const userDocRef = doc(db, `artifacts/${appId}/public/data/users/${currentUser.uid}`);
                    await setDoc(userDocRef, { 
                        notificationToken: currentToken,
                    }, { merge: true });

                    setUserProfile(prev => ({...prev, notificationToken: currentToken}));
                    alert('Notifications enabled successfully!');
                } else {
                    console.log('No registration token available. Request permission to generate one.');
                    alert('Could not get notification token. Please try again.');
                }
            } else {
                console.log('Unable to get permission to notify.');
                alert('Notification permission was denied.');
            }
        } catch (error) {
            console.error('An error occurred while retrieving token. ', error);
            alert(`Failed to enable notifications: ${error.message}`);
        } finally {
            setIsEnablingNotifications(false);
        }
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
            
            {('Notification' in window) && (
                <div className="form-group">
                    <label>Push Notifications</label>
                    <Button 
                        onClick={enableNotifications} 
                        variant={notificationStatus === 'granted' ? 'success' : 'primary'}
                        disabled={notificationStatus === 'denied' || isEnablingNotifications}
                    >
                        <Bell className="icon" />
                        {isEnablingNotifications ? 'Enabling...' : 
                         notificationStatus === 'granted' ? 'Notifications Enabled' : 
                         notificationStatus === 'denied' ? 'Notifications Blocked' : 
                         'Enable Notifications'}
                    </Button>
                    {notificationStatus === 'denied' && (
                        <p className="text-sm text-red">You've blocked notifications. Please update your browser settings to enable them.</p>
                    )}
                </div>
            )}
            
            <Button onClick={handleSave} variant="primary">Save Profile</Button>
        </div>
    );
};
