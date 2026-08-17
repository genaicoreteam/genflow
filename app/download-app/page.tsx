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
        <h2 className="mt-6 font-display font-semibold">For the maintainer</h2>
        <ol className="ml-5 mt-2 list-decimal space-y-1 text-sm text-brand-700">
          <li>Open the <code>android/</code> folder from this repository in Android Studio.</li>
          <li>In <code>MainActivity.kt</code>, set your live Vercel URL.</li>
          <li>Build → Generate Signed Bundle / APK → APK (create a keystore once; keep it safe).</li>
          <li>Copy the release APK into this project's <code>public/</code> folder as <code>genflow.apk</code> and redeploy.</li>
        </ol>
      </div>
    </Shell>
  );
}
