import { graphGet } from "./client";

export interface MetaAdAccount {
  id: string;
  name: string;
  accountStatus: number;
}

interface AdAccountsResponse {
  data?: { id: string; account_id: string; name: string; account_status: number }[];
}

export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const res = await graphGet<AdAccountsResponse>(
    "/me/adaccounts",
    { fields: "account_id,name,account_status", limit: "200" },
    token,
  );
  return (res.data ?? []).map((a) => ({
    id: a.account_id,
    name: a.name,
    accountStatus: a.account_status,
  }));
}
