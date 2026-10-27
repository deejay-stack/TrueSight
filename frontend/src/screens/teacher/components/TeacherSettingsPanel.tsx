import { Settings2, AlertTriangle, Bell, Palette, Save, Trash2, UserRound } from "lucide-react";
import { WorkspaceHeading } from "../../../components/WorkspaceHeading";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { GlobalThemeToggle } from "../../../components/theme/GlobalThemeToggle";
import { useAuth } from "../../../context/useAuth";
import {
  isSupportedProfileImageType,
  MAX_PROFILE_IMAGE_SIZE_BYTES,
  readFileAsDataUrl,
} from "../../../utils/profileImage";
import { TeacherProfileImageField } from "./TeacherProfileImageField";

type TeacherSettingsPanelProps = {
  onAccountDeleted: () => void;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function TeacherSettingsPanel({ onAccountDeleted }: TeacherSettingsPanelProps) {
  const { user, updateAccount, deleteAccount, loading } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(
    user?.profileImageUrl ?? null,
  );
  const [notifications, setNotifications] = useState(user?.notifications ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setProfileImageUrl(user?.profileImageUrl ?? null);
    setNotifications(user?.notifications ?? true);
  }, [user]);

  const handleProfileImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!isSupportedProfileImageType(file.type)) {
      toast.error("Unsupported image type. Use PNG, JPG, WEBP, or GIF.");
      return;
    }

    if (file.size > MAX_PROFILE_IMAGE_SIZE_BYTES) {
      toast.error("Image is too large. Maximum file size is 2MB.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProfileImageUrl(dataUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to process image.";
      toast.error(message);
    }
  };

  const handleSave = async () => {
    const nextName = name.trim();
    const nextEmail = email.trim();

    if (!nextName) {
      toast.error("Name is required.");
      return;
    }

    if (!isValidEmail(nextEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    try {
      setIsSaving(true);
      await updateAccount({
        name: nextName,
        email: nextEmail,
        profileImageUrl,
        notifications,
      });
      toast.success("Account settings updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save account settings.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete account permanently? This action cannot be undone.",
    );

    if (!confirmed) return;

    try {
      setIsDeleting(true);
      await deleteAccount();
      toast.success("Account deleted.");
      onAccountDeleted();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete account.";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="settings-card theme-card max-w-3xl">
      <CardContent className="space-y-5 p-5">
        <WorkspaceHeading eyebrow="YOUR ACCOUNT" title="Your settings." description="Manage your teacher profile, appearance, and notification preferences." icon={Settings2} />

        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_96%,transparent)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserRound className="h-4 w-4 text-[var(--app-accent)]" />
            <p className="font-semibold text-[var(--app-text)]">Profile</p>
          </div>

          <TeacherProfileImageField
            name={name || user?.name || "Teacher"}
            profileImageUrl={profileImageUrl}
            onSelectImage={handleProfileImageChange}
            onRemoveImage={() => setProfileImageUrl(null)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--app-text)]">Username</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your display name"
                className="bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--app-text)]">Email</label>
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)]"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_96%,transparent)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="h-4 w-4 text-[var(--app-accent)]" />
            <p className="font-semibold text-[var(--app-text)]">Notifications</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--app-text)]">In-app notifications</p>
              <p className="text-xs theme-muted">Submission alerts and class updates</p>
            </div>
            <button
              onClick={() => setNotifications((current) => !current)}
              className={[
                "theme-ring h-7 w-12 rounded-full p-1 transition-colors",
                notifications
                  ? "bg-[var(--app-accent)]"
                  : "bg-[color-mix(in_srgb,var(--app-muted)_35%,transparent)]",
              ].join(" ")}
            >
              <span
                className={[
                  "block h-5 w-5 rounded-full bg-white transition-transform",
                  notifications ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </button>
          </div>
        </div>

        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_96%,transparent)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-4 w-4 text-[var(--app-accent)]" />
            <p className="font-semibold text-[var(--app-text)]">Theme</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--app-text)]">Preferred Theme</p>
              <p className="text-xs theme-muted">
                Applied globally across teacher, student, login, and signup pages
              </p>
            </div>
            <GlobalThemeToggle />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button onClick={handleSave} disabled={isSaving || loading}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>

          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={isDeleting || loading}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isDeleting ? "Deleting..." : "Delete Account"}
          </Button>
        </div>

        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-[var(--status-danger)]">
          <p className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Deleting your account removes your classes, submissions, and profile data permanently.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
