import { Account } from "@/components/account";
import { RequireAuth } from "@/components/require-auth";

export default function AccountPage() {
  return (
    <RequireAuth>
      <Account />
    </RequireAuth>
  );
}
