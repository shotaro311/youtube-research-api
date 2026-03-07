import { chmod, mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

const TARGET_PATH = join(process.cwd(), "vendor", "yt-dlp", "yt-dlp");

const PLATFORM_ARTIFACTS = {
  darwin: "yt-dlp_macos",
  linux: "yt-dlp_linux",
};

async function main() {
  if (process.env.YT_DLP_SKIP_DOWNLOAD === "1") {
    console.log("[prepare-ytdlp] skipped by YT_DLP_SKIP_DOWNLOAD");
    return;
  }

  const artifact = PLATFORM_ARTIFACTS[process.platform];
  if (!artifact) {
    console.log(`[prepare-ytdlp] unsupported platform: ${process.platform}`);
    return;
  }

  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${artifact}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`[prepare-ytdlp] download failed: ${response.status} ${response.statusText}`);
  }

  const binary = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(TARGET_PATH), { recursive: true });
  await writeFile(TARGET_PATH, binary);
  await chmod(TARGET_PATH, 0o755);
  console.log(`[prepare-ytdlp] downloaded ${artifact} -> ${TARGET_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
