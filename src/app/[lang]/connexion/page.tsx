import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { SignIn } from "@/components/sign-in";

export default function SignInPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignIn />
    </Suspense>
  );
}
