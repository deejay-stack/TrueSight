import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Camera, Sun, Moon, LogOut, X, Bell, BellOff, Edit2, Check } from 'lucide-react'
import { useAuth } from '../context/useAuth';
import { Button } from './ui/Button'
import { LogoutConfirmationDialog } from './LogoutConfirmationDialog'

interface ProfileSectionProps {
  userName: string
  userRole: string
  onClose: () => void
  showEnrolledStudents?: boolean
  enrolledStudentsCount?: number
  onViewEnrolledStudents?: () => void
}

export function ProfileSection({
  userName,
  userRole,
  onClose,
  showEnrolledStudents = false,
  enrolledStudentsCount = 0,
  onViewEnrolledStudents
}: ProfileSectionProps) {
  const { darkMode, toggleTheme } = useAuth()
  const theme = darkMode ? 'dark' : 'light'
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profileImage, setProfileImage] = useState<string | null>(
    localStorage.getItem(`profile-image-${userName}`)
  )
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    localStorage.getItem(`notifications-${userName}`) !== 'false'
  )
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(userName)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setProfileImage(result)
        localStorage.setItem(`profile-image-${userName}`, result)
      }
      reader.readAsDataURL(file)
    }
  }

  const toggleNotifications = () => {
    const newValue = !notificationsEnabled
    setNotificationsEnabled(newValue)
    localStorage.setItem(`notifications-${userName}`, String(newValue))
  }

  const handleSaveName = () => {
    if (editedName.trim()) {
      localStorage.setItem(`username-${userName}`, editedName)
      setIsEditingName(false)
      // In production, this would update the backend.
    }
  }

  const handleLogout = () => {
    // Clear any session data if needed
    navigate('/')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--sidebar-backdrop)] animate-in fade-in duration-200 sm:items-center">
      <div className="theme-surface w-full max-w-md rounded-t-3xl p-6 space-y-6 animate-in slide-in-from-bottom duration-300 sm:rounded-3xl sm:slide-in-from-bottom-0">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-[var(--app-text)]">Profile Settings</h2>
          <button
            onClick={onClose}
            className="theme-ring rounded-full p-2 text-[var(--app-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] hover:text-[var(--app-text)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Photo Section */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative group">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(135deg,var(--app-accent),var(--app-accent-2))] text-3xl font-bold text-[var(--app-on-accent)] shadow-[var(--app-shadow)]">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                (editedName || userName).charAt(0)
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="theme-ring absolute bottom-0 right-0 rounded-full bg-[var(--app-accent)] p-2 text-[var(--app-on-accent)] shadow-[var(--app-shadow)] transition duration-200 hover:scale-105"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          <div className="text-center w-full">
            {isEditingName ? (
              <div className="flex items-center gap-2 justify-center">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="theme-ring rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] px-3 py-1 text-center font-bold text-[var(--app-text)]"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="theme-ring rounded-lg bg-[var(--app-accent)] p-1.5 text-[var(--app-on-accent)] transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-center">
                <h3 className="font-bold text-lg text-[var(--app-text)]">
                  {editedName || userName}
                </h3>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="theme-ring p-1 text-[var(--app-muted)] transition-colors hover:text-[var(--app-accent)]"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-sm theme-muted mt-1">{userRole}</p>
          </div>
        </div>

        {/* Settings Options */}
        <div className="space-y-3">
          {/* Notifications Toggle */}
          <div className="flex items-center justify-between rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4 transition-colors">
            <div className="flex items-center gap-3">
              {notificationsEnabled ? (
                <Bell className="w-5 h-5 text-[var(--app-accent)]" />
              ) : (
                <BellOff className="w-5 h-5 text-[var(--app-muted)]" />
              )}
              <div>
                <p className="font-semibold text-[var(--app-text)]">Notifications</p>
                <p className="text-xs theme-muted">
                  {notificationsEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleNotifications}
              className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
                notificationsEnabled ? 'bg-[var(--app-accent)]' : 'bg-[color-mix(in_srgb,var(--app-muted)_34%,transparent)]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 ${
                  notificationsEnabled ? 'translate-x-7' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Theme Toggle */}
          <div className="flex items-center justify-between rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4 transition-colors">
            <div className="flex items-center gap-3">
              {theme === 'light' ? (
                <Sun className="w-5 h-5 text-amber-500" />
              ) : (
                <Moon className="w-5 h-5 text-[var(--app-accent)]" />
              )}
              <div>
                <p className="font-semibold text-[var(--app-text)]">Appearance</p>
                <p className="text-xs theme-muted">
                  {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
                theme === 'dark' ? 'bg-[var(--app-accent)]' : 'bg-[color-mix(in_srgb,var(--app-muted)_34%,transparent)]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 ${
                  theme === 'dark' ? 'translate-x-7' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* View Enrolled Students (Teacher Only) */}
          {showEnrolledStudents && (
            <button
              onClick={onViewEnrolledStudents}
              className="theme-ring flex w-full items-center justify-between rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface))] p-4 font-semibold text-[var(--app-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--app-accent)_16%,var(--app-surface))]"
            >
              <span>View Enrolled Students</span>
              <span className="rounded-full bg-[var(--app-accent)] px-2.5 py-1 text-xs text-[var(--app-on-accent)]">
                {enrolledStudentsCount}
              </span>
            </button>
          )}

          {/* Logout Button */}
          <LogoutConfirmationDialog onConfirm={handleLogout}>
            <Button
              className="w-full p-4 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-2xl flex items-center justify-center gap-3 transition-colors font-semibold"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </Button>
          </LogoutConfirmationDialog>
        </div>
      </div>
    </div>
  )
}
