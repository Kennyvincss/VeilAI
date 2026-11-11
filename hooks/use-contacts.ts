"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/hooks/use-api";

export interface Contact {
  id: string;
  label: string;
  accountId: string;
}

const KEY = (network: string) => `veil.contacts.v1.${network}`;

function readLocal(network: string): Contact[] {
  try {
    const raw = window.localStorage.getItem(KEY(network));
    const list = raw ? (JSON.parse(raw) as Contact[]) : [];
    return Array.isArray(list) ? list.filter((c) => c && typeof c.accountId === "string" && typeof c.label === "string") : [];
  } catch {
    return [];
  }
}
function writeLocal(network: string, list: Contact[]) {
  try {
    window.localStorage.setItem(KEY(network), JSON.stringify(list));
  } catch {
    /* storage unavailable: list stays in memory for this visit */
  }
}

/**
 * Address book. Signed-in users: encrypted in the database, synced across
 * devices. Everyone else: kept only in this browser (public account IDs and
 * names — never keys).
 */
export function useContacts(network: "mainnet" | "testnet") {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [persisted, setPersisted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api<{ persisted: boolean; contacts: Contact[]; notice?: string }>("/api/contacts");
      setPersisted(r.persisted);
      setNotice(r.notice ?? null);
      setContacts(r.persisted ? r.contacts : readLocal(network));
    } catch {
      setPersisted(false);
      setContacts(readLocal(network));
    } finally {
      setLoading(false);
    }
  }, [network]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the address book on mount is the purpose of this hook
    void load();
  }, [load]);

  const add = useCallback(
    async (label: string, accountId: string) => {
      if (contacts.some((c) => c.accountId === accountId)) throw new Error("That account is already in your address book.");
      if (persisted) {
        const { id } = await api<{ id: string }>("/api/contacts", { method: "POST", json: { label, accountId } });
        setContacts((l) => [...l, { id, label, accountId }]);
      } else {
        const next = [...contacts, { id: `local-${Date.now()}`, label, accountId }];
        writeLocal(network, next);
        setContacts(next);
      }
    },
    [contacts, persisted, network],
  );

  const remove = useCallback(
    async (id: string) => {
      if (persisted) await api(`/api/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const next = contacts.filter((c) => c.id !== id);
      if (!persisted) writeLocal(network, next);
      setContacts(next);
    },
    [contacts, persisted, network],
  );

  return { contacts, persisted, notice, loading, add, remove };
}
