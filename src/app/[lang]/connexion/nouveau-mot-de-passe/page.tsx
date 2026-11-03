import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { ResetPassword } from "@/components/reset-password";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ResetPassword />
    </Suspense>
  );
}
