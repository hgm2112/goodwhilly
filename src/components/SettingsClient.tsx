"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface EbayStatus {
  configured: boolean;
  connected: boolean;
  env: "prod" | "sandbox";
  connectedAt: string | null;
  lastUpdated: string | null;
}

export function SettingsClient({ email }: { email: string }) {
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/ebay/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      setError("Couldn't read eBay status");
    }
  }

  useEffect(() => {
    load();

    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  async function connect() {
    setError(null);
    window.location.href = "/api/ebay/connect";
  }

  async function disconnect() {
    if (!window.confirm("Unlink your eBay account? Listings stay saved; new syncs will stop.")) return;
    await fetch("/api/ebay/disconnect", { method: "POST" });
    load();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* eBay */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">eBay connection</h2>
          <span
            className={`h-2.5 w-2.5 rounded-full ${status?.connected ? "bg-emerald-500" : status?.configured ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600"}`}
            title={status?.connected ? "Connected" : status?.configured ? "Configured, not connected" : "Not configured"}
          />
        </div>

        {!status ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {status.connected
                ? `Connected ${new Date(status.connectedAt!).toLocaleDateString()}.`
                : status.configured
                  ? "Server keys are set but no account is linked yet."
                  : "eBay isn't configured on the server (no EBAY_CLIENT_ID/SECRET/RUNAME). Price autofill and listing sync are disabled."}
            </p>
            {status.lastUpdated && (
              <p className="text-xs text-slate-400">Token last refreshed {status.lastUpdated.slice(0, 16).replace("T", " ")} UTC</p>
            )}
            <p className="text-xs text-slate-400">
              Environment: <span className="font-semibold">{status.env}</span>. Uses your own eBay
              account (OAuth + user token). Your access keys are encrypted on the server.
            </p>

            {status.connected ? (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost text-red-600 dark:text-red-400" onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={connect}>
                Connect eBay account
              </button>
            )}
          </>
        )}

        {error && <p className="rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      </div>

      {/* Pricing notes */}
      <div className="card space-y-2">
        <h2 className="text-sm font-bold">How prices are found</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <span className="font-semibold">Sealed product:</span> eBay sold-data average when the
            Marketplace Insights API access is approved, otherwise an estimate from active-listing
            prices for the exact UPC. Results are cached with a sample count.
          </li>
          <li>
            <span className="font-semibold">Bulk loose cards:</span> Scryfall market price for the
            exact card.
          </li>
          <li>
            <span className="font-semibold">Everything else:</span> your own value, typed in. Values
            drive bundle generation.
          </li>
        </ul>
      </div>

      {/* Account */}
      <div className="card space-y-2 md:col-span-2">
        <h2 className="text-sm font-bold">Account</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Signed in as <span className="font-medium text-slate-800 dark:text-slate-200">{email}</span>. Inventory, sales,
          listings, and bundles are scoped to your account only.
        </p>
        <p className="text-xs text-slate-400">
          For a password reset or to change the email use the &quot;Reset password&quot; link on the
          login screen.
        </p>
      </div>

      {/* Install app */}
      <div className="card space-y-2 md:col-span-2">
        <h2 className="text-sm font-bold">Install app</h2>
        {installed ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Goodwhilly is already installed on this device.
          </p>
        ) : installPrompt ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Install Goodwhilly as an app on this device.
            </p>
            <button className="btn btn-secondary" onClick={installApp}>
              Install app
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {/iPad|iPhone|iPod/.test(navigator.userAgent)
              ? "Use Safari's Share button, then choose Add to Home Screen."
              : /Android/i.test(navigator.userAgent)
                ? "Use Chrome or Edge's menu, then choose Install app or Add to Home screen."
                : "Use your browser's install option (address-bar install icon or app menu) to install Goodwhilly."}
          </p>
        )}
      </div>
    </div>
  );
}