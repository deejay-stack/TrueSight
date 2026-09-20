import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAppContext } from '../../context/AppContext';
import { Bell, Moon, Sun, Camera, Save, User as UserIcon, Check, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { motion } from "framer-motion";
import { LogoutConfirmationDialog } from '../../components/LogoutConfirmationDialog';

export const Profile = () => {
  const { currentUser, updateProfile } = useAppContext();
  const navigate = useNavigate();
  
  const [name, setName] = useState(currentUser.name);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = () => {
    setIsSaving(true);
    setTimeout(() => {
      updateProfile({ name });
      setIsSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 600);
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      updateProfile({ photoUrl: url });
    }
  };

  const toggleTheme = () => {
    updateProfile({ theme: currentUser.theme === 'light' ? 'dark' : 'light' });
  };

  const toggleNotifications = () => {
    updateProfile({ notifications: !currentUser.notifications });
  };

  const handleLogout = () => {
    navigate('/');
    // Add any mock logout logic here if needed
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex items-center space-x-3 border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
        <div className="w-12 h-12 bg-[color-mix(in_srgb,var(--app-accent)_12%,var(--app-surface))] rounded-xl flex items-center justify-center text-[var(--app-accent)]">
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Settings</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your profile, notifications, and app preferences.</p>
        </div>
      </div>

      <div className="grid gap-8">
        {/* Card 1: Profile Settings */}
        <div className="bg-white dark:bg-slate-800 shadow-sm rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-shadow hover:shadow-md">
          <div className="p-6 sm:p-8 space-y-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
              <UserIcon className="w-5 h-5 mr-2 text-[var(--app-accent)]" />
              Profile Settings
            </h2>
            
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6">
              <div className="relative group flex-shrink-0">
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-50 dark:border-slate-800 shadow-md">
                  {currentUser.photoUrl ? (
                    <img src={currentUser.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[color-mix(in_srgb,var(--app-accent)_14%,var(--app-surface))] flex items-center justify-center text-[var(--app-accent)]">
                      <UserIcon className="w-10 h-10" />
                    </div>
                  )}
                </div>
                <button
                  onClick={handlePhotoClick}
                  className="absolute bottom-0 right-0 p-2 bg-[var(--app-accent)] text-[var(--app-on-accent)] rounded-full shadow-lg hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,black)] transition-colors transform translate-x-1 translate-y-1 group-hover:scale-110"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept="image/*"
                />
              </div>
              <div className="text-center sm:text-left flex-1 w-full">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Personal Information</h3>
                
                <div className="grid gap-5 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[var(--app-ring)] dark:bg-slate-900 dark:text-white transition-shadow shadow-sm"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Account Role</label>
                    <input
                      type="text"
                      disabled
                      value={currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed font-medium shadow-sm"
                    />
                    <p className="text-xs text-slate-500 mt-2">Roles are managed by your administrator.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-6 sm:px-8 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 flex justify-end items-center space-x-4">
            {saved && (
              <motion.span 
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                className="text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center"
              >
                <Check className="w-4 h-4 mr-1" />
                Profile updated
              </motion.span>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={isSaving || name === currentUser.name}
              className="flex items-center space-x-2 px-6 py-2.5 bg-[var(--app-accent)] hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,black)] disabled:bg-slate-300 dark:disabled:bg-slate-700 text-[var(--app-on-accent)] rounded-lg font-medium transition-all active:scale-95 disabled:active:scale-100 shadow-sm hover:shadow"
            >
              {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              <span>Save Changes</span>
            </button>
          </div>
        </div>

        {/* Card 2: Notifications */}
        <div className="bg-white dark:bg-slate-800 shadow-sm rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 transition-shadow hover:shadow-md">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center mb-6">
            <Bell className="w-5 h-5 mr-2 text-[var(--app-accent)]" />
            Notifications
          </h2>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 max-w-2xl">
            <div className="flex flex-col pr-8">
              <span className="text-base font-semibold text-slate-900 dark:text-white">
                Email Notifications
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Receive important alerts about new assignments, class updates, and student submissions directly to your inbox.
              </span>
            </div>
            <button
              onClick={toggleNotifications}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--app-ring)] focus:ring-offset-2 ${currentUser.notifications ? 'bg-[var(--app-accent)]' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${currentUser.notifications ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Card 3: Preferences */}
        <div className="bg-white dark:bg-slate-800 shadow-sm rounded-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 transition-shadow hover:shadow-md">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center mb-6">
            {currentUser.theme === 'light' ? <Sun className="w-5 h-5 mr-2 text-amber-500" /> : <Moon className="w-5 h-5 mr-2 text-[var(--app-accent)]" />}
            Preferences
          </h2>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 max-w-2xl">
            <div className="flex flex-col pr-8">
              <span className="text-base font-semibold text-slate-900 dark:text-white">
                Dark Mode
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Switch between light and dark themes to reduce eye strain and customize your viewing experience.
              </span>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--app-ring)] focus:ring-offset-2 ${currentUser.theme === 'dark' ? 'bg-[var(--app-accent)]' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`pointer-events-none flex items-center justify-center h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${currentUser.theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}>
                 {currentUser.theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-[var(--app-accent)]" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
              </span>
            </button>
          </div>
        </div>

        {/* Logout Section */}
        <div className="flex justify-start">
          <LogoutConfirmationDialog onConfirm={handleLogout}>
            <button className="flex items-center space-x-2 px-6 py-3 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-xl font-medium transition-colors shadow-sm">
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </LogoutConfirmationDialog>
        </div>

      </div>
    </div>
  );
};
