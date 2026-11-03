import { Suspense } from "react";
import { ResetPassword } from "@/components/reset-password";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <ResetPassword />
    </Suspense>
  );
}
