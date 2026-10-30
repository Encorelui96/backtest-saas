import { Suspense } from "react";
import { SignIn } from "@/components/sign-in";

export default function SignInPage() {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <SignIn />
    </Suspense>
  );
}
