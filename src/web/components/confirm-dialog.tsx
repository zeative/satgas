import { useState } from "react";
import { RichText } from "@/components/rich-text";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  disabled?: boolean;
  desc: React.JSX.Element | string;
  cancelBtnText?: string;
  confirmText?: React.ReactNode;
  destructive?: boolean;
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
  // An async confirm keeps the dialog open and busy; resolving to a message shows it as the reason it failed.
} & ({ form: string; handleConfirm?: undefined } | { form?: undefined; handleConfirm: () => unknown });

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    desc,
    children,
    className,
    confirmText,
    cancelBtnText,
    destructive,
    isLoading,
    disabled = false,
    form,
    handleConfirm,
  } = props;
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setProblem(null);
  }
  const busy = isLoading || pending;

  const confirm = async () => {
    const result = handleConfirm?.();
    if (!(result instanceof Promise)) return;
    setPending(true);
    setProblem(null);
    try {
      const message = await result;
      if (typeof message === "string" && message) setProblem(message);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent className={cn(className && className)}>
        <AlertDialogHeader className="text-start">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{desc}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            <RichText text={problem} />
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelBtnText ?? t.cancel}</AlertDialogCancel>
          <Button
            type={form ? "submit" : "button"}
            form={form}
            onClick={handleConfirm && (() => void confirm())}
            variant={destructive ? "destructive" : "default"}
            disabled={disabled || busy}
          >
            {confirmText ?? t.continue}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
