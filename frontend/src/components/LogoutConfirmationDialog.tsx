import { useState, type ReactNode } from "react";
import { Loader2, LogOut } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

type LogoutConfirmationDialogProps = {
  children: ReactNode;
  onConfirm: () => void | Promise<void>;
};

const MIN_LOGOUT_SPINNER_MS = 2000;

const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });

export function LogoutConfirmationDialog({
  children,
  onConfirm,
}: LogoutConfirmationDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (confirming) return;

    setConfirming(true);
    try {
      await wait(MIN_LOGOUT_SPINNER_MS);
      await onConfirm();
      setOpen(false);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!confirming) {
          setOpen(nextOpen);
        }
      }}
    >
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent className="theme-card border theme-border bg-[var(--app-surface)] text-[var(--app-text)]">
        <AlertDialogHeader className="items-center text-center sm:items-start sm:text-left">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">
            <LogOut className="h-6 w-6" />
          </div>
          <AlertDialogTitle>Logout of your account?</AlertDialogTitle>
          <AlertDialogDescription className="theme-muted">
            You will be signed out and returned to the login screen. Make sure any
            unsaved work has been submitted before continuing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>Stay Logged In</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirming}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {confirming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            {confirming ? "Logging out..." : "Yes, Logout"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
