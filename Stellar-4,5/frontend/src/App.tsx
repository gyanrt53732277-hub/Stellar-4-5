import React, { useState, useEffect } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { 
  getAllProjects, 
  createProject, 
  fundMilestone, 
  submitMilestone, 
  approveMilestone, 
  disputeMilestone, 
  resolveDispute, 
  refundMilestone,
  CONTRACT_ID
} from './services/contractService';
import type { Project } from './services/contractService';
import { trackEvent } from './services/analyticsService';
import { submitFeedback, getFeedbackStats } from './services/feedbackService';
import type { FeedbackStats } from './services/feedbackService';
import { 
  Wallet, 
  Plus, 
  Check, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  HelpCircle, 
  MessageSquare, 
  Star, 
  Shield, 
  Info,
  DollarSign,
  ChevronRight,
  ExternalLink,
  Copy,
  ArrowRight
} from 'lucide-react';
import * as Sentry from '@sentry/react';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  useEffect(() => {
    document.body.className = theme === 'dark' ? 'bg-darkBg text-gray-100' : 'bg-gray-100 text-gray-800';
    document.body.style.backgroundColor = theme === 'dark' ? '#080B11' : '#f3f4f6';
  }, [theme]);

  // Onboarding Intro Modal state
  const [showIntroModal, setShowIntroModal] = useState(() => {
    return localStorage.getItem('hasSeenIntro') !== 'true';
  });

  const closeIntroModal = () => {
    localStorage.setItem('hasSeenIntro', 'true');
    setShowIntroModal(false);
  };

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Contract data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabs & Forms state
  const [activeTab, setActiveTab] = useState<'client' | 'freelancer' | 'onboarding'>('client');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newFreelancer, setNewFreelancer] = useState('');
  const [newArbiter, setNewArbiter] = useState('');
  const [newMilestones, setNewMilestones] = useState<Array<{ amount: string; description: string; deadline: string }>>([
    { amount: '50', description: 'Design Mockups', deadline: '' }
  ]);
  const [submittingProject, setSubmittingProject] = useState(false);

  // Actions loading state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Notification state
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info'; txHash?: string } | null>(null);

  // Feedback state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);

  // Dispute input state
  const [disputeReason, setDisputeReason] = useState<Record<string, string>>({});

  // Connect Wallet handler
  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      // Use static authModal to connect
      const { address } = await StellarWalletsKit.authModal();
      setWalletAddress(address);
      setWalletType('Freighter');
      trackEvent('wallet_connected', { walletType: 'Freighter' });
      showNotification('Wallet connected successfully!', 'success');
    } catch (err: any) {
      console.error('Wallet connection failed:', err);
      Sentry.captureException(err);
      setError(err.message || 'Failed to connect wallet');
      showNotification('Wallet connection failed', 'error');
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect Wallet handler
  const handleDisconnect = async () => {
    try {
      await StellarWalletsKit.disconnect();
    } catch (err) {
      console.warn('Disconnect error:', err);
    }
    setWalletAddress(null);
    setWalletType(null);
    trackEvent('wallet_disconnected');
    showNotification('Wallet disconnected', 'info');
  };

  // Notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'info', txHash?: string) => {
    setNotification({ message, type, txHash });
    setTimeout(() => {
      setNotification(null);
    }, 7000);
  };

  // Fetch projects from blockchain
  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const data = await getAllProjects();
      setProjects(data);
    } catch (err: any) {
      console.error('Failed to load projects from chain:', err);
      setError(err.message || 'Failed to sync with Stellar network');
    } finally {
      setLoadingProjects(false);
    }
  };

  // Load projects on startup and interval
  useEffect(() => {
    trackEvent('landing_page_viewed', { timestamp: new Date().toISOString() });
    loadProjects();
    const interval = setInterval(loadProjects, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch feedback statistics
  const loadFeedbackStats = async () => {
    try {
      const stats = await getFeedbackStats();
      setFeedbackStats(stats);
    } catch (err) {
      console.warn('Failed to load feedback stats:', err);
    }
  };

  useEffect(() => {
    loadFeedbackStats();
  }, [feedbackOpen]);

  // Add milestone input row
  const addMilestoneInput = () => {
    setNewMilestones([...newMilestones, { amount: '', description: '', deadline: '' }]);
  };

  // Remove milestone input row
  const removeMilestoneInput = (index: number) => {
    setNewMilestones(newMilestones.filter((_, i) => i !== index));
  };

  // Create Project handler
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      showNotification('Please connect your wallet first', 'error');
      return;
    }

    if (!newFreelancer) {
      showNotification('Freelancer address is required', 'error');
      return;
    }

    if (!/^G[A-Z0-9]{55}$/.test(newFreelancer)) {
      showNotification('Invalid Freelancer address format', 'error');
      return;
    }

    if (newArbiter && !/^G[A-Z0-9]{55}$/.test(newArbiter)) {
      showNotification('Invalid Arbiter address format', 'error');
      return;
    }

    // Input validation
    try {
      const formattedMilestones = newMilestones.map((m) => {
        const amountNum = parseFloat(m.amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          throw new Error('Milestone amount must be positive');
        }
        if (!m.description.trim()) {
          throw new Error('Milestone description cannot be empty');
        }
        if (!m.deadline) {
          throw new Error('Milestone deadline is required');
        }
        
        const parsedDate = new Date(m.deadline);
        if (isNaN(parsedDate.getTime())) {
          throw new Error(`Milestone deadline is invalid`);
        }

        // Convert deadline to Unix timestamp in seconds
        const deadlineTimestamp = Math.floor(parsedDate.getTime() / 1000);
        if (deadlineTimestamp <= Math.floor(Date.now() / 1000)) {
          throw new Error('Deadline must be in the future');
        }

        // Convert XLM to Stroops (1 XLM = 10,000,000 Stroops)
        const amountInStroops = Math.round(amountNum * 10000000);

        return {
          amount: amountInStroops,
          description: m.description,
          deadline: deadlineTimestamp
        };
      });

      setSubmittingProject(true);
      const txHash = await createProject(
        walletAddress,
        newFreelancer,
        newArbiter || walletAddress, // Default to client if empty
        formattedMilestones
      );

      showNotification('Project created successfully on-chain!', 'success', txHash);
      setCreateModalOpen(false);
      // Reset form
      setNewFreelancer('');
      setNewArbiter('');
      setNewMilestones([{ amount: '50', description: 'Design Mockups', deadline: '' }]);
      loadProjects();
    } catch (err: any) {
      console.error('Failed to create project:', err);
      Sentry.captureException(err);
      showNotification(err.message || 'Transaction rejected or failed', 'error');
    } finally {
      setSubmittingProject(false);
    }
  };

  // Generic milestone action wrapper
  const handleMilestoneAction = async (
    projectId: number,
    milestoneIndex: number,
    actionName: string,
    actionFn: () => Promise<string>
  ) => {
    const actionKey = `${projectId}-${milestoneIndex}-${actionName}`;
    setActionLoading(actionKey);
    try {
      const txHash = await actionFn();
      showNotification(`Milestone ${actionName} transaction successful!`, 'success', txHash);
      trackEvent(`milestone_${actionName}`, { projectId, milestoneIndex, txHash });
      loadProjects();
    } catch (err: any) {
      console.error(`Action ${actionName} failed:`, err);
      Sentry.captureException(err);
      showNotification(err.message || `Failed to ${actionName} milestone`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Feedback Submission handler
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackComment.trim()) return;

    setSubmittingFeedback(true);
    try {
      await submitFeedback({
        rating: feedbackRating,
        comment: feedbackComment,
        walletAddress: walletAddress || undefined
      });
      showNotification('Thank you for your feedback!', 'success');
      setFeedbackComment('');
      setFeedbackOpen(false);
      loadFeedbackStats();
    } catch (err: any) {
      console.error('Feedback submit failed:', err);
      showNotification(err.message || 'Failed to submit feedback', 'error');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('Address copied to clipboard', 'info');
  };

  return (
    <div className={`min-h-screen flex flex-col relative transition-colors duration-300 ${
      theme === 'dark' ? 'bg-darkBg text-gray-100' : 'bg-gray-100 text-gray-800'
    }`}>
      {/* Background gradients */}
      {theme === 'dark' && (
        <>
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl -z-10" />
        </>
      )}

      {/* Header */}
      <header className={`sticky top-0 z-40 border-b px-4 py-3 flex items-center justify-between backdrop-blur-md ${
        theme === 'dark' ? 'border-darkBorder bg-darkCard/50' : 'border-gray-200 bg-white/70'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent-600 to-clientPurple flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-accent-500/15">
            SE
          </div>
          <div>
            <h1 className={`text-xl font-bold ${
              theme === 'dark' ? 'bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent' : 'text-gray-900'
            }`}>StellarEscrow</h1>
            <p className="text-[10px] text-gray-500 font-medium tracking-wide">MILESTONE ESCROW TRUSTWAY</p>
          </div>
        </div>

        {/* Network Status & Wallet Connect */}
        <div className="flex items-center space-x-3">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition ${
              theme === 'dark' ? 'bg-gray-800/80 text-yellow-400 hover:bg-gray-800' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
            title="Toggle Theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <span className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            theme === 'dark' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-green-100 text-green-700 border border-green-200'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
            Stellar Testnet
          </span>

          {walletAddress ? (
            <div className={`flex items-center space-x-2 border rounded-lg p-1 ${
              theme === 'dark' ? 'bg-darkCard/80 border-darkBorder' : 'bg-white border-gray-300 shadow-sm'
            }`}>
              <span className={`text-xs px-2 font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
                {walletAddress.substring(0, 5)}...{walletAddress.substring(walletAddress.length - 4)}
                {walletType && <span className="text-[9px] text-gray-500 ml-1.5">({walletType})</span>}
              </span>
              <button 
                onClick={() => copyToClipboard(walletAddress)}
                className={`p-1 rounded transition ${
                  theme === 'dark' ? 'hover:bg-gray-800 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                }`}
                title="Copy Address"
              >
                <Copy size={12} />
              </button>
              <button 
                onClick={handleDisconnect}
                className="text-xs px-2.5 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-md font-semibold transition"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-accent-600 to-accent-700 hover:from-accent-500 hover:to-accent-600 text-white text-sm font-semibold rounded-lg shadow-lg shadow-accent-600/25 transition disabled:opacity-50"
            >
              <Wallet size={16} />
              <span>{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Onboarding Intro Modal */}
      <AnimatePresence>
        {showIntroModal && !walletAddress && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 180 }}
              className="bg-darkCard/80 border border-darkBorder/60 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/10 backdrop-blur-2xl"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-accent-600 to-clientPurple flex items-center justify-center shadow-lg shadow-accent-500/20">
                  <Shield size={32} className="text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">Welcome to StellarEscrow</h2>
                <p className="text-gray-400 max-w-xl mx-auto leading-relaxed">
                  The trustless milestone-based payment system for freelancers and clients. 
                  Before connecting your wallet, here is how you can get started on the Stellar Testnet.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mt-8">
                  <div className="bg-darkBg/50 p-5 rounded-xl border border-darkBorder/40 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Wallet size={48} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">1. Get a Wallet</h3>
                    <p className="text-sm text-gray-400">Install the <a href="https://www.freighter.app/" target="_blank" rel="noreferrer" className="text-accent-400 hover:underline font-semibold">Freighter Extension</a> and set the network to Testnet.</p>
                  </div>
                  <div className="bg-darkBg/50 p-5 rounded-xl border border-darkBorder/40 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <DollarSign size={48} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">2. Fund Account</h3>
                    <p className="text-sm text-gray-400">Get free test XLM from the <a href="https://laboratory.stellar.org/#account-creator?network=testnet" target="_blank" rel="noreferrer" className="text-clientPurple hover:underline font-semibold">Stellar Friendbot</a> by pasting your address.</p>
                  </div>
                  <div className="bg-darkBg/50 p-5 rounded-xl border border-darkBorder/40 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Check size={48} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">3. Start Escrow</h3>
                    <p className="text-sm text-gray-400">Connect your wallet below to create a project or view milestones assigned to you.</p>
                  </div>
                </div>

                <div className="pt-6">
                  <button 
                    onClick={closeIntroModal}
                    className="px-8 py-3 bg-gradient-to-r from-accent-600 to-accent-700 hover:from-accent-500 hover:to-accent-600 text-white rounded-xl font-bold shadow-lg shadow-accent-600/25 transition-all hover:scale-105 flex items-center justify-center space-x-2 mx-auto"
                  >
                    <span>I'm Ready to Connect</span>
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Action Notification Alert */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className={`fixed top-16 right-4 z-[9999] p-4 rounded-xl shadow-xl border max-w-md backdrop-blur-md transition-colors duration-300 ${
              theme === 'dark'
                ? (notification.type === 'success' ? 'border-green-500/30 text-green-200 bg-green-950/40' : notification.type === 'error' ? 'border-red-500/30 text-red-200 bg-red-950/40' : 'border-blue-500/30 text-blue-200 bg-blue-950/40')
                : (notification.type === 'success' ? 'border-green-300 text-green-800 bg-green-50 shadow-green-150/40' : notification.type === 'error' ? 'border-red-300 text-red-800 bg-red-50 shadow-red-150/40' : 'border-blue-300 text-blue-800 bg-blue-50 shadow-blue-150/40')
            }`}
          >
            <div className="flex items-start space-x-3">
              <div className="mt-0.5">
                {notification.type === 'success' && <Check className="text-green-500" size={18} />}
                {notification.type === 'error' && <AlertTriangle className="text-red-500" size={18} />}
                {notification.type === 'info' && <Info className="text-blue-500" size={18} />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{notification.message}</p>
                {notification.txHash && (
                  <a 
                    href={`https://stellar.expert/explorer/testnet/tx/${notification.txHash}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center text-xs text-accent-500 hover:underline font-semibold"
                  >
                    View on StellarExpert
                    <ExternalLink size={10} className="ml-1" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Error banner if any */}
        {error && (
          <div className="p-4 bg-red-950/20 border border-red-500/30 text-red-200 rounded-xl flex items-start space-x-3">
            <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-semibold">RPC Synchronizer Error</p>
              <p className="text-xs text-red-300/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex items-center justify-between border-b border-darkBorder">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('client')}
              className={`pb-3 px-4 text-sm font-semibold transition border-b-2 -mb-0.5 ${
                activeTab === 'client' 
                  ? 'border-clientPurple text-clientPurple' 
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              Client Dashboard
            </button>
            <button
              onClick={() => setActiveTab('freelancer')}
              className={`pb-3 px-4 text-sm font-semibold transition border-b-2 -mb-0.5 ${
                activeTab === 'freelancer' 
                  ? 'border-freelancerGreen text-freelancerGreen' 
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              Freelancer Portal
            </button>
            <button
              onClick={() => setActiveTab('onboarding')}
              className={`pb-3 px-4 text-sm font-semibold transition border-b-2 -mb-0.5 flex items-center space-x-1.5 ${
                activeTab === 'onboarding' 
                  ? 'border-accent-500 text-accent-400' 
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <HelpCircle size={14} />
              <span>How It Works</span>
            </button>
          </div>

          {activeTab === 'client' && (
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 15px rgba(139, 92, 246, 0.4)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCreateModalOpen(true)}
              className="mb-2 flex items-center space-x-1.5 px-3 py-1.5 bg-clientPurple text-white text-xs font-bold rounded-lg shadow-md transition cursor-pointer"
            >
              <Plus size={14} />
              <span>New Escrow Project</span>
            </motion.button>
          )}
        </div>

        {/* Sync Indicator */}
        <div className="flex items-center justify-end text-[11px] text-gray-500 space-x-1 font-medium">
          <RefreshCw size={10} className={`${loadingProjects ? 'animate-spin text-accent-500' : ''}`} />
          <span>{loadingProjects ? 'Fetching chain state...' : 'Synced live with Soroban RPC'}</span>
        </div>
        {/* Tab content 1: Client view */}
        {activeTab === 'client' && (
          <div className="space-y-6">
            {/* Create Project Modal */}
            <AnimatePresence>
              {createModalOpen && (
                <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 150 }}
                    className="bg-darkCard/80 border border-darkBorder/60 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl"
                  >
                    <div className="px-6 py-4 bg-gray-900 border-b border-darkBorder flex items-center justify-between">
                      <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                        <Plus className="text-clientPurple" size={20} />
                        <span>Create New Escrow Project</span>
                      </h3>
                      <button 
                        onClick={() => setCreateModalOpen(false)}
                        className="text-gray-400 hover:text-white transition text-sm font-bold"
                      >
                        Close
                      </button>
                    </div>

                    <form onSubmit={handleCreateProject} className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Freelancer Public Address (G...)</label>
                        <input 
                          type="text" 
                          required
                          value={newFreelancer}
                          onChange={(e) => setNewFreelancer(e.target.value)}
                          placeholder="Starts with G... (e.g. GC5QY4FK...)"
                          className={`w-full bg-darkBg border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none font-mono ${
                            newFreelancer.length > 0 && !/^G[A-Z0-9]{55}$/.test(newFreelancer) 
                              ? 'border-red-500 focus:border-red-500' 
                              : 'border-darkBorder focus:border-clientPurple'
                          }`}
                        />
                        {newFreelancer.length > 0 && !/^G[A-Z0-9]{55}$/.test(newFreelancer) && (
                          <p className="text-red-400 text-xs mt-1.5 flex items-center"><AlertTriangle size={12} className="mr-1" /> Invalid Stellar public key format.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Arbiter Public Address (Optional)</label>
                        <input 
                          type="text" 
                          value={newArbiter}
                          onChange={(e) => setNewArbiter(e.target.value)}
                          placeholder="Starts with G... (Optional)"
                          className={`w-full bg-darkBg border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none font-mono ${
                            newArbiter.length > 0 && !/^G[A-Z0-9]{55}$/.test(newArbiter) 
                              ? 'border-red-500 focus:border-red-500' 
                              : 'border-darkBorder focus:border-clientPurple'
                          }`}
                        />
                        {newArbiter.length > 0 && !/^G[A-Z0-9]{55}$/.test(newArbiter) && (
                          <p className="text-red-400 text-xs mt-1.5 flex items-center"><AlertTriangle size={12} className="mr-1" /> Invalid Stellar public key format.</p>
                        )}
                      </div>

                      <div className="border-t border-darkBorder/60 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Project Milestones</label>
                          <button 
                            type="button"
                            onClick={addMilestoneInput}
                            className="flex items-center space-x-1 text-xs font-semibold text-clientPurple hover:text-clientPurple/80 transition"
                          >
                            <Plus size={12} />
                            <span>Add Milestone</span>
                          </button>
                        </div>

                        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                          {newMilestones.map((m, index) => (
                            <div key={index} className="p-3 bg-darkBg/60 border border-darkBorder/40 rounded-xl space-y-3">
                              <div className="flex items-center justify-between text-xs text-gray-500 font-semibold">
                                <span>Milestone #{index + 1}</span>
                                {newMilestones.length > 1 && (
                                  <button 
                                    type="button"
                                    onClick={() => removeMilestoneInput(index)}
                                    className="text-red-400 hover:text-red-300 transition"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
                                  <input 
                                    type="text" 
                                    required
                                    value={m.description}
                                    onChange={(e) => {
                                      const items = [...newMilestones];
                                      items[index].description = e.target.value;
                                      setNewMilestones(items);
                                    }}
                                    placeholder="e.g. Design Mockups"
                                    className="w-full bg-darkBg border border-darkBorder rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-clientPurple"
                                  />
                                </div>
                                <div>
                                  <input 
                                    type="number" 
                                    required
                                    step="0.0000001"
                                    min="0.0000001"
                                    value={m.amount}
                                    onChange={(e) => {
                                      const items = [...newMilestones];
                                      items[index].amount = e.target.value;
                                      setNewMilestones(items);
                                    }}
                                    placeholder="e.g. 50 (XLM Amount)"
                                    className="w-full bg-darkBg border border-darkBorder rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-clientPurple"
                                  />
                                </div>
                              </div>
                              <div>
                                <input 
                                  type="date" 
                                  required
                                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                                  value={m.deadline}
                                  onChange={(e) => {
                                      const items = [...newMilestones];
                                      items[index].deadline = e.target.value;
                                      setNewMilestones(items);
                                  }}
                                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-clientPurple"
                                />
                                <p className="text-[10px] text-gray-500 mt-1">Completion deadline for this milestone (must be tomorrow or later).</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-darkBorder/60 pt-4 flex justify-end space-x-3">
                        <button 
                          type="button"
                          onClick={() => setCreateModalOpen(false)}
                          className="px-4 py-2 border border-darkBorder text-gray-400 hover:text-white rounded-lg text-sm font-semibold transition"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          disabled={submittingProject || (newFreelancer.length > 0 && !/^G[A-Z0-9]{55}$/.test(newFreelancer)) || (newArbiter.length > 0 && !/^G[A-Z0-9]{55}$/.test(newArbiter))}
                          className="px-5 py-2 bg-gradient-to-r from-clientPurple to-indigo-600 hover:from-clientPurple/90 hover:to-indigo-600/90 text-white rounded-lg text-sm font-bold shadow-lg shadow-clientPurple/20 transition disabled:opacity-50"
                        >
                          {submittingProject ? 'Creating On-chain...' : 'Create & Deploy'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Client Projects List */}
            {loadingProjects && projects.length === 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {[1, 2].map((i) => <SkeletonProjectCard key={i} />)}
              </div>
            ) : projects.filter(p => !walletAddress || p.client === walletAddress).length === 0 ? (
              <motion.div 
                initial={{ y: 0 }}
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                className="text-center py-16 border border-dashed border-darkBorder rounded-2xl bg-darkCard/20 flex flex-col items-center justify-center shadow-2xl shadow-cyan-500/5 backdrop-blur-md"
              >
                <div className="w-16 h-16 rounded-full bg-darkBg border border-darkBorder flex items-center justify-center mb-4">
                  <AlertTriangle size={24} className="text-gray-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-200">No Escrow Projects Found</h3>
                <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
                  Create your first project to get started.
                </p>
                {!walletAddress ? (
                  <button 
                    onClick={handleConnect} 
                    className="mt-6 px-5 py-2.5 bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 border border-gray-600 text-sm font-bold text-white rounded-xl shadow-lg transition"
                  >
                    Connect Wallet
                  </button>
                ) : (
                  <button
                    onClick={() => setCreateModalOpen(true)}
                    className="mt-6 px-5 py-2.5 bg-clientPurple hover:bg-clientPurple/90 text-sm font-bold text-white rounded-xl shadow-lg shadow-clientPurple/20 transition flex items-center space-x-2"
                  >
                    <Plus size={16} />
                    <span>Create Your First Project</span>
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {projects.filter(p => !walletAddress || p.client === walletAddress).map((project) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    userAddress={walletAddress}
                    role="client"
                    actionLoading={actionLoading}
                    onAction={handleMilestoneAction}
                    disputeReason={disputeReason}
                    setDisputeReason={setDisputeReason}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab content 2: Freelancer Portal */}
        {activeTab === 'freelancer' && (
          <div className="space-y-6">
            {loadingProjects && projects.length === 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {[1, 2].map((i) => <SkeletonProjectCard key={i} />)}
              </div>
            ) : projects.filter(p => !walletAddress || p.freelancer === walletAddress).length === 0 ? (
              <motion.div 
                initial={{ y: 0 }}
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 1 }}
                className="text-center py-16 border border-dashed border-darkBorder rounded-2xl bg-darkCard/20 flex flex-col items-center justify-center shadow-2xl shadow-cyan-500/5 backdrop-blur-md"
              >
                <div className="w-16 h-16 rounded-full bg-darkBg border border-darkBorder flex items-center justify-center mb-4">
                  <Shield size={24} className="text-freelancerGreen/60" />
                </div>
                <h3 className="text-lg font-bold text-gray-200">No Assigned Projects</h3>
                <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto leading-relaxed">
                  Create your first project to get started.
                </p>
                {!walletAddress && (
                  <button 
                    onClick={handleConnect} 
                    className="mt-6 px-5 py-2.5 bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 border border-gray-600 text-sm font-bold text-white rounded-xl shadow-lg transition"
                  >
                    Connect Wallet
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {projects.filter(p => !walletAddress || p.freelancer === walletAddress).map((project) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    userAddress={walletAddress}
                    role="freelancer"
                    actionLoading={actionLoading}
                    onAction={handleMilestoneAction}
                    disputeReason={disputeReason}
                    setDisputeReason={setDisputeReason}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab content 3: Onboarding Guide */}
        {activeTab === 'onboarding' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="p-6 bg-darkCard border border-darkBorder rounded-2xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <HelpCircle className="text-accent-400" size={20} />
                <span>StellarEscrow User Onboarding Guide</span>
              </h3>
              <p className="text-xs text-gray-400 leading-relaxed">
                StellarEscrow is a decentralized freelance payment milestone escrow trust system. It uses Stellar Soroban smart contracts to enforce payment trust, preventing disputes and securing payments.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-darkBorder pt-4">
                <div className="p-4 bg-darkBg/60 rounded-xl border border-darkBorder/40">
                  <div className="w-7 h-7 rounded-full bg-accent-500/10 text-accent-400 flex items-center justify-center font-bold text-xs mb-3">1</div>
                  <h4 className="text-sm font-bold text-gray-200">Wallet Setup</h4>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Install <a href="https://www.freighter.app/" target="_blank" rel="noreferrer" className="text-accent-400 hover:underline">Freighter Extension</a>. Open Freighter, go to settings and switch network to <b>Test Net</b>.
                  </p>
                </div>
                <div className="p-4 bg-darkBg/60 rounded-xl border border-darkBorder/40">
                  <div className="w-7 h-7 rounded-full bg-accent-500/10 text-accent-400 flex items-center justify-center font-bold text-xs mb-3">2</div>
                  <h4 className="text-sm font-bold text-gray-200">Request Testnet XLM</h4>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Copy your public key. Navigate to <a href="https://laboratory.stellar.org/#account-creator?network=testnet" target="_blank" rel="noreferrer" className="text-accent-400 hover:underline">Stellar Laboratory Friendbot</a>, paste address and fund it.
                  </p>
                </div>
                <div className="p-4 bg-darkBg/60 rounded-xl border border-darkBorder/40">
                  <div className="w-7 h-7 rounded-full bg-accent-500/10 text-accent-400 flex items-center justify-center font-bold text-xs mb-3">3</div>
                  <h4 className="text-sm font-bold text-gray-200">Create & Transact</h4>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Clients create projects, deposit funds into escrow, freelancers submit milestone work, and clients release locked payments securely!
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-darkCard border border-darkBorder rounded-2xl">
              <h4 className="text-sm font-bold text-gray-200 mb-3 uppercase tracking-wider">Milestone Lifecycle States</h4>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-700 text-gray-300 w-28 text-center flex-shrink-0">Created</span>
                  <p className="text-xs text-gray-400">Milestone is declared but unfunded. Freelancer should not start work yet.</p>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600/30 text-blue-400 w-28 text-center flex-shrink-0">Funded</span>
                  <p className="text-xs text-gray-400">Client has locked XLM tokens into the smart contract. Safe for freelancer to build.</p>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-600/30 text-yellow-400 w-28 text-center flex-shrink-0">Submitted</span>
                  <p className="text-xs text-gray-400">Freelancer finished work and submitted. Client has a review window to approve or dispute.</p>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/30 text-red-400 w-28 text-center flex-shrink-0">Disputed</span>
                  <p className="text-xs text-gray-400">Client flagged issues. Locked funds are in dispute pending Arbiter resolution or freelancer voluntary refund.</p>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-600/30 text-green-400 w-28 text-center flex-shrink-0">Released</span>
                  <p className="text-xs text-gray-400">Approved by client or arbiter. Locked funds automatically transferred to freelancer wallet.</p>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600/30 text-purple-400 w-28 text-center flex-shrink-0">Refunded</span>
                  <p className="text-xs text-gray-400">Client refunded due to milestone expiry (unsubmitted past deadline), Arbiter resolution, or freelancer consent.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Feedback Widget */}
      <button 
        onClick={() => window.open("https://docs.google.com/forms/d/e/1FAIpQLSexdbGV5XTjwVFyK-eN7243MU9HTFEGhOVUWFOxzD5QBU1Tjg/viewform?pli=1&pli=1", "_blank")}
        className="fixed bottom-6 right-6 z-40 flex items-center space-x-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-full shadow-2xl hover:scale-105 transition duration-200"
      >
        <MessageSquare size={16} />
        <span className="text-xs font-bold">Feedback Form</span>
      </button>

      {feedbackOpen && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-darkCard border border-darkBorder w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-scale-up">
            <div className="px-5 py-4 bg-gray-900 border-b border-darkBorder flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <MessageSquare className="text-accent-400" size={16} />
                <span>Submit Feedback & Rating</span>
              </h3>
              <button 
                onClick={() => setFeedbackOpen(false)}
                className="text-gray-400 hover:text-white transition text-xs font-bold"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleFeedbackSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Your Rating</label>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((stars) => (
                    <button
                      key={stars}
                      type="button"
                      onClick={() => setFeedbackRating(stars)}
                      className="p-1 text-yellow-500 transition"
                    >
                      <Star size={24} fill={stars <= feedbackRating ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Comment</label>
                <textarea
                  required
                  rows={4}
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Share your experience using StellarEscrow..."
                  className="w-full bg-darkBg border border-darkBorder rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-accent-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingFeedback || !feedbackComment.trim()}
                className="w-full py-2 bg-gradient-to-r from-accent-600 to-accent-700 hover:from-accent-500 hover:to-accent-600 text-white rounded-lg text-xs font-bold shadow-lg shadow-accent-600/20 transition disabled:opacity-50"
              >
                {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
              </button>

              {/* Aggregated stats summary inside modal */}
              {feedbackStats && feedbackStats.totalSubmissions > 0 && (
                <div className="border-t border-darkBorder pt-4 mt-2 space-y-2">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Aggregated Feedback Stats</h4>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-darkBg/50 p-2 rounded-lg border border-darkBorder/40">
                      <p className="text-lg font-bold text-white">{feedbackStats.averageRating} / 5</p>
                      <p className="text-[9px] text-gray-500 uppercase font-semibold">Average Rating</p>
                    </div>
                    <div className="bg-darkBg/50 p-2 rounded-lg border border-darkBorder/40">
                      <p className="text-lg font-bold text-white">{feedbackStats.totalSubmissions}</p>
                      <p className="text-[9px] text-gray-500 uppercase font-semibold">Total Reviews</p>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-darkBorder py-6 px-4 bg-darkCard/25 text-center text-xs text-gray-500 space-y-2">
        <p>© 2026 StellarEscrow. Built on Stellar Soroban Smart Contracts. Optimized for Testnet.</p>
        <div className="flex items-center justify-center space-x-4">
          <span className="font-mono text-[10px] bg-darkBg px-2.5 py-1 border border-darkBorder rounded text-gray-400">
            Contract: {CONTRACT_ID.substring(0, 8)}...{CONTRACT_ID.substring(CONTRACT_ID.length - 8)}
          </span>
        </div>
      </footer>
    </div>
  );
}

function SkeletonProjectCard() {
  return (
    <div className="bg-darkCard border border-darkBorder rounded-2xl overflow-hidden shadow-lg shadow-black/20 animate-pulse">
      <div className="px-6 py-4 bg-gray-900/60 border-b border-darkBorder/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-3">
          <div className="h-4 bg-gray-800 rounded w-32"></div>
          <div className="h-3 bg-gray-800 rounded w-48"></div>
        </div>
        <div className="flex flex-col items-start md:items-end gap-2">
          <div className="h-3 bg-gray-800 rounded w-24"></div>
          <div className="h-5 bg-gray-800 rounded w-20"></div>
        </div>
      </div>
      <div className="p-5 bg-darkCard">
        <div className="h-3 bg-gray-800 rounded w-full mb-3"></div>
        <div className="h-3 bg-gray-800 rounded w-4/5 mb-3"></div>
        <div className="h-3 bg-gray-800 rounded w-3/4"></div>
      </div>
    </div>
  );
}

// Sub-component: Project Card containing milestone accordion/timeline
interface ProjectCardProps {
  project: Project;
  userAddress: string | null;
  role: 'client' | 'freelancer';
  actionLoading: string | null;
  onAction: (projectId: number, milestoneIndex: number, actionName: string, actionFn: () => Promise<string>) => void;
  disputeReason: Record<string, string>;
  setDisputeReason: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

function ProjectCard({ 
  project, 
  userAddress, 
  role, 
  actionLoading, 
  onAction,
  disputeReason,
  setDisputeReason
}: ProjectCardProps) {
  const isProjectArbiter = userAddress && project.arbiter === userAddress;
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedClient, setCopiedClient] = useState(false);
  const [copiedFreelancer, setCopiedFreelancer] = useState(false);

  const handleShareProject = () => {
    const shareText = `I've created a secure escrow project for you on StellarEscrow. Connect your wallet here to view it: ${window.location.origin}`;
    navigator.clipboard.writeText(shareText);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleCopyClient = () => {
    navigator.clipboard.writeText(project.client);
    setCopiedClient(true);
    setTimeout(() => setCopiedClient(false), 2000);
  };

  const handleCopyFreelancer = () => {
    navigator.clipboard.writeText(project.freelancer);
    setCopiedFreelancer(true);
    setTimeout(() => setCopiedFreelancer(false), 2000);
  };

  const getStatusLabel = (status: number) => {
    switch (status) {
      case 0: return { text: 'Created', color: 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20', tooltip: 'Waiting for client to lock funds into the escrow contract.' };
      case 1: return { text: 'Funded', color: 'bg-blue-600/30 text-blue-400 border border-blue-500/20', tooltip: 'Funds are securely locked on-chain. Freelancer should start work.' };
      case 2: return { text: 'Submitted', color: 'bg-yellow-600/30 text-yellow-400 border border-yellow-500/20', tooltip: 'Work submitted by freelancer. Waiting for client review.' };
      case 4: return { text: 'Disputed', color: 'bg-red-600/30 text-red-400 border border-red-500/20', tooltip: 'Payment is disputed and locked. Awaiting arbiter resolution.' };
      case 5: return { text: 'Released', color: 'bg-green-600/30 text-green-400 border border-green-500/20', tooltip: 'Funds successfully released to the freelancer.' };
      case 6: return { text: 'Refunded', color: 'bg-purple-600/30 text-purple-400 border border-purple-500/20', tooltip: 'Funds have been returned to the client.' };
      default: return { text: 'Unknown', color: 'bg-gray-500 text-white', tooltip: '' };
    }
  };

  const formatAmount = (stroops: number) => {
    return (stroops / 10000000).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 7 });
  };

  // Check if a milestone is expired (current time > deadline)
  const isMilestoneExpired = (deadline: number) => {
    return Math.floor(Date.now() / 1000) > deadline;
  };

  // Get total contract balance (funded milestones + disputed milestones)
  const getEscrowBalance = () => {
    const sum = project.milestones
      .filter(m => m.status === 1 || m.status === 2 || m.status === 4)
      .reduce((acc, m) => acc + m.amount, 0);
    return formatAmount(sum);
  };

  return (
    <motion.div 
      initial={{ y: 0 }}
      animate={{ y: [0, -6, 0] }}
      transition={{
        repeat: Infinity,
        duration: 6,
        ease: "easeInOut",
        delay: (project.id || 0) % 2 === 0 ? 0 : 3
      }}
      className="bg-darkCard/60 border border-darkBorder/60 rounded-2xl overflow-hidden shadow-2xl shadow-cyan-500/5 glass-card transition-all duration-300 hover:border-accent-500/25 hover:shadow-cyan-500/10"
    >
      {/* Project Header */}
      <div className="px-6 py-4 bg-gray-900/60 border-b border-darkBorder/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-white">Project ID: #{project.id}</span>
            <button
              onClick={handleShareProject}
              className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800/80 text-gray-400 hover:text-white transition flex items-center space-x-1"
              title="Copy shareable project link"
            >
              <span>{linkCopied ? 'Link Copied!' : 'Share'}</span>
            </button>
            {isProjectArbiter && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-500/10 text-accent-400 border border-accent-500/20">
                <Shield size={10} className="mr-1" />
                You are Arbiter
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-gray-500">
            <span className="flex items-center">
              Client: <span className="font-mono text-gray-400 ml-1">{project.client.substring(0, 6)}...{project.client.substring(project.client.length - 6)}</span>
              <button 
                onClick={handleCopyClient} 
                className="ml-1 text-gray-500 hover:text-white transition relative inline-flex items-center justify-center cursor-pointer p-0.5"
                title="Copy Address"
              >
                <Copy size={10} />
                {copiedClient && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-[10px] text-white px-2 py-0.5 rounded shadow-lg z-50 whitespace-nowrap animate-bounce">
                    Copied!
                  </span>
                )}
              </button>
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="flex items-center">
              Freelancer: <span className="font-mono text-gray-400 ml-1">{project.freelancer.substring(0, 6)}...{project.freelancer.substring(project.freelancer.length - 6)}</span>
              <button 
                onClick={handleCopyFreelancer} 
                className="ml-1 text-gray-500 hover:text-white transition relative inline-flex items-center justify-center cursor-pointer p-0.5"
                title="Copy Address"
              >
                <Copy size={10} />
                {copiedFreelancer && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-[10px] text-white px-2 py-0.5 rounded shadow-lg z-50 whitespace-nowrap animate-bounce">
                    Copied!
                  </span>
                )}
              </button>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-0 border-darkBorder/60 pt-3 md:pt-0">
          <div className="text-right">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Escrow Balance</p>
            <p className="text-base font-bold text-accent-400 flex items-center justify-end">
              <DollarSign size={14} className="-mr-0.5" />
              <span>{getEscrowBalance()} XLM</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Milestones</p>
            <p className="text-sm font-bold text-gray-300">
              {project.milestones.filter(m => m.status === 5).length} / {project.milestones.length} Complete
            </p>
          </div>
        </div>
      </div>

      {/* Milestones List */}
      <div className="p-6 space-y-6">
        {project.milestones.map((milestone, index) => {
          const status = getStatusLabel(milestone.status);
          const isExpired = isMilestoneExpired(milestone.deadline);
          const actionKey = (name: string) => `${project.id}-${index}-${name}`;
          const isCurrentLoading = (name: string) => actionLoading === actionKey(name);
          
          const getDeadlineStatus = (deadline: number) => {
            const now = Math.floor(Date.now() / 1000);
            const daysDiff = Math.ceil((deadline - now) / 86400);
            if (daysDiff < 0) return { text: `Overdue by ${Math.abs(daysDiff)} days`, color: 'text-red-400 bg-red-400/10 border-red-500/20' };
            if (daysDiff === 0) return { text: 'Due Today', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20' };
            return { text: `Due in ${daysDiff} days`, color: 'text-orange-400 bg-orange-400/10 border-orange-500/20' };
          };
          const deadlineBadge = getDeadlineStatus(milestone.deadline);

          return (
            <motion.div 
              key={index} 
              initial={{ y: 0 }}
              animate={{ y: [0, -3, 0] }}
              transition={{
                repeat: Infinity,
                duration: 5 + index,
                ease: "easeInOut",
                delay: index * 0.3
              }}
              className="p-4 bg-darkBg/40 border border-darkBorder/60 rounded-xl space-y-4 shadow-xl shadow-black/10"
            >
              {/* Milestone Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-darkBorder/40 pb-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                    <ChevronRight size={14} className="text-accent-500" />
                    <span>Milestone #{index + 1}: {milestone.description}</span>
                  </h4>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center">
                      <DollarSign size={12} className="mr-0.5 text-accent-500" />
                      {formatAmount(milestone.amount)} XLM
                    </span>
                    <span className="flex items-center">
                      <Clock size={12} className="mr-1 text-accent-500" />
                      Deadline: {new Date(milestone.deadline * 1000).toLocaleDateString()}
                    </span>
                    {deadlineBadge && milestone.status !== 5 && milestone.status !== 6 && (
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${deadlineBadge.color}`}>
                        {deadlineBadge.text}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span 
                    title={status.tooltip}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-help ${status.color}`}
                  >
                    {status.text}
                  </span>
                </div>
              </div>

              {/* Steps Progress Flow Visualizer */}
              <div className="py-2">
                <div className="relative flex items-center justify-between">
                  <div className="absolute left-4 right-4 h-0.5 bg-gray-800 -z-10" />
                  
                  {/* Step 1: Created */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      milestone.status >= 0 
                        ? 'bg-clientPurple text-white shadow-lg shadow-clientPurple/30 border-2 border-purple-400' 
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      1
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1 font-semibold">Created</span>
                  </div>

                  {/* Step 2: Funded */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      milestone.status >= 1 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 border-2 border-blue-400' 
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      2
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1 font-semibold">Funded</span>
                  </div>

                  {/* Step 3: Submitted */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      milestone.status === 2 || milestone.status === 5 
                        ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-500/30 border-2 border-yellow-400' 
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      3
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1 font-semibold">Submitted</span>
                  </div>

                  {/* Step 4: Approved/Resolved */}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      milestone.status === 5 
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/50 border-2 border-green-400 scale-110 green-glow' 
                        : milestone.status === 6 
                        ? 'bg-purple-600 text-white border-2 border-purple-400'
                        : milestone.status === 4
                        ? 'bg-red-600 text-white shadow-lg shadow-red-500/30 border-2 border-red-400 animate-pulse'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      {milestone.status === 4 ? '!' : milestone.status === 6 ? '↺' : '✓'}
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1 font-semibold">
                      {milestone.status === 4 ? 'Disputed' : milestone.status === 6 ? 'Refunded' : 'Released'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                {/* Client Flow Actions */}
                {role === 'client' && userAddress === project.client && (
                  <>
                    {/* Fund Milestone */}
                    {milestone.status === 0 && (
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => onAction(project.id, index, 'fund', () => fundMilestone(userAddress, project.id, index))}
                        className="px-3.5 py-1.5 bg-clientPurple hover:bg-clientPurple/90 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition"
                      >
                        {isCurrentLoading('fund') ? (
                          <span className="flex items-center space-x-1.5">
                            <RefreshCw size={11} className="animate-spin" />
                            <span>Confirming on Stellar network...</span>
                          </span>
                        ) : (
                          'Fund Milestone (Lock XLM)'
                        )}
                      </button>
                    )}

                    {/* Approve Deliverable & Release Funds */}
                    {milestone.status === 2 && (
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => onAction(project.id, index, 'approve', () => approveMilestone(userAddress, project.id, index))}
                        className="px-3.5 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition"
                      >
                        {isCurrentLoading('approve') ? (
                          <span className="flex items-center space-x-1.5">
                            <RefreshCw size={11} className="animate-spin" />
                            <span>Confirming on Stellar network...</span>
                          </span>
                        ) : (
                          'Approve & Release Funds'
                        )}
                      </button>
                    )}

                    {/* Raise Dispute (available when Funded or Submitted) */}
                    {(milestone.status === 1 || milestone.status === 2) && (
                      <div className="flex items-center space-x-2">
                        <input 
                          type="text" 
                          placeholder="Dispute reason..."
                          value={disputeReason[`${project.id}-${index}`] || ''}
                          onChange={(e) => setDisputeReason({
                            ...disputeReason,
                            [`${project.id}-${index}`]: e.target.value
                          })}
                          className="bg-darkBg border border-darkBorder rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-red-500 w-36"
                        />
                        <button
                          disabled={actionLoading !== null || !disputeReason[`${project.id}-${index}`]?.trim()}
                          onClick={() => onAction(project.id, index, 'dispute', () => disputeMilestone(
                            userAddress, 
                            project.id, 
                            index, 
                            disputeReason[`${project.id}-${index}`]
                          ))}
                          className="px-3.5 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 disabled:opacity-50 text-red-400 text-xs font-bold rounded-lg transition"
                        >
                          {isCurrentLoading('dispute') ? (
                            <span className="flex items-center space-x-1.5">
                              <RefreshCw size={11} className="animate-spin" />
                              <span>Confirming on Stellar network...</span>
                            </span>
                          ) : (
                            'Raise Dispute'
                          )}
                        </button>
                      </div>
                    )}

                    {/* Client Refund on Expiry */}
                    {(milestone.status === 1 || milestone.status === 2 || milestone.status === 4) && isExpired && (
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => onAction(project.id, index, 'refund', () => refundMilestone(userAddress, project.id, index))}
                        className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition"
                      >
                        {isCurrentLoading('refund') ? (
                          <span className="flex items-center space-x-1.5">
                            <RefreshCw size={11} className="animate-spin" />
                            <span>Confirming on Stellar network...</span>
                          </span>
                        ) : (
                          'Claim Expired Refund'
                        )}
                      </button>
                    )}
                  </>
                )}

                {/* Freelancer Flow Actions */}
                {role === 'freelancer' && userAddress === project.freelancer && (
                  <>
                    {/* Submit work */}
                    {(milestone.status === 1 || milestone.status === 4) && (
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => onAction(project.id, index, 'submit', () => submitMilestone(userAddress, project.id, index))}
                        className="px-3.5 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition"
                      >
                        {isCurrentLoading('submit') ? (
                          <span className="flex items-center space-x-1.5">
                            <RefreshCw size={11} className="animate-spin" />
                            <span>Confirming on Stellar network...</span>
                          </span>
                        ) : (
                          'Mark Complete & Submit'
                        )}
                      </button>
                    )}

                    {/* Freelancer Voluntary Refund */}
                    {(milestone.status === 1 || milestone.status === 2 || milestone.status === 4) && (
                      <button
                        disabled={actionLoading !== null}
                        onClick={() => onAction(project.id, index, 'refund', () => refundMilestone(userAddress, project.id, index))}
                        className="px-3.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 disabled:opacity-50 text-purple-400 text-xs font-bold rounded-lg transition"
                        title="Cancel milestone and return funds voluntarily to client"
                      >
                        {isCurrentLoading('refund') ? (
                          <span className="flex items-center space-x-1.5">
                            <RefreshCw size={11} className="animate-spin" />
                            <span>Confirming on Stellar network...</span>
                          </span>
                        ) : (
                          'Cancel & Return Funds'
                        )}
                      </button>
                    )}
                  </>
                )}

                {/* Arbiter Flow Actions */}
                {isProjectArbiter && milestone.status === 4 && (
                  <div className="flex items-center space-x-2 border-l border-darkBorder/60 pl-3">
                    <span className="text-[10px] text-gray-500 font-bold uppercase mr-1">Arbiter Power:</span>
                    <button
                      disabled={actionLoading !== null}
                      onClick={() => onAction(project.id, index, 'resolve_client', () => resolveDispute(userAddress, project.id, index, true))}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition"
                    >
                      {isCurrentLoading('resolve_client') ? (
                        <span className="flex items-center space-x-1.5">
                          <RefreshCw size={11} className="animate-spin" />
                          <span>Confirming on Stellar network...</span>
                        </span>
                      ) : (
                        'Resolve to Client'
                      )}
                    </button>
                    <button
                      disabled={actionLoading !== null}
                      onClick={() => onAction(project.id, index, 'resolve_freelancer', () => resolveDispute(userAddress, project.id, index, false))}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition"
                    >
                      {isCurrentLoading('resolve_freelancer') ? (
                        <span className="flex items-center space-x-1.5">
                          <RefreshCw size={11} className="animate-spin" />
                          <span>Confirming on Stellar network...</span>
                        </span>
                      ) : (
                        'Resolve to Freelancer'
                      )}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
