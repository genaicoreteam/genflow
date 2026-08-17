"use client";
import Shell from "@/components/Shell";
import { PageHead } from "@/components/Ui";
import { MemphisTeam } from "@/components/Memphis";

export default function DownloadApp() {
  return (
    <Shell title="Download App">
      <PageHead title="GenFlow for Android" sub="A lightweight app that loads this live website fullscreen — every deploy updates the app instantly, no reinstall needed." art={<MemphisTeam className="w-full" />} />
      <div className="card p-6">
        <a href="/genflow.apk" download className="btn-primary text-base">⇩ Download GenFlow.apk</a>
        <p className="mt-3 text-sm text-brand-600">
          After downloading, open the file and allow "Install from unknown sources" if Android asks.
          The app needs only Internet permission.
        </p>
      </div>
    </Shell>
  );
}
