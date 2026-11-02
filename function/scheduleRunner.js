import { readGroups } from "./groupDatabase.js";

let runnerTimer = null;
let runnerSocket = null;
let running = false;
const completedRuns = new Set();

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function stopScheduleRunner(sock) {
    if (sock && runnerSocket !== sock) return;
    if (runnerTimer) clearInterval(runnerTimer);
    runnerTimer = null;
    runnerSocket = null;
}

export function startScheduleRunner(sock) {
    if (!sock) return;
    if (runnerSocket === sock && runnerTimer) return;
    stopScheduleRunner();
    runnerSocket = sock;

    const run = async () => {
        if (runnerSocket !== sock || running) return;
        running = true;
        try {
            const groups = await readGroups();
            const now = new Date();
            const today = localDateKey(now);
            const currentMinute = now.getHours() * 60 + now.getMinutes();

            for (const group of groups) {
                if (!group?.id || !Array.isArray(group.schedule)) continue;

                for (const item of group.schedule) {
                    if (!item || item.open !== true && item.close !== true) continue;
                    const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(item.time || ""));
                    if (!timeMatch) continue;
                    const scheduledMinute = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
                    const minuteOffset = currentMinute - scheduledMinute;
                    if (minuteOffset < 0 || minuteOffset > 1) continue;

                    const action = item.open === true ? "open" : "close";
                    const runKey = `${today}|${group.id}|${action}|${item.time}`;
                    if (completedRuns.has(runKey)) continue;

                    try {
                        await sock.groupSettingUpdate(
                            group.id,
                            action === "open" ? "not_announcement" : "announcement"
                        );
                        completedRuns.add(runKey);
                        console.log(`[SCHEDULE] ${group.id}: grup ${action === "open" ? "dibuka" : "ditutup"} pada ${item.time}.`);
                    } catch (error) {
                        console.error(`[SCHEDULE] Gagal ${action === "open" ? "membuka" : "menutup"} ${group.id}:`, error?.message || error);
                    }
                }
            }

            if (completedRuns.size > 5000) {
                const keepDate = localDateKey(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
                for (const key of completedRuns) {
                    if (key.slice(0, 10) < keepDate) completedRuns.delete(key);
                }
            }
        } catch (error) {
            console.error("[SCHEDULE] Gagal memuat jadwal grup:", error?.message || error);
        } finally {
            running = false;
        }
    };

    void run();
    runnerTimer = setInterval(run, 30_000);
}

