import { readFile } from "node:fs/promises";

const makeFakeQuote = () => ({
    key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast"
    },
    message: {
        imageMessage: {
            text: "@dpwoffc",
            caption: "@dpwoffc"
        }
    }
});

async function sendText(sock, jid, text, message) {
    await sock.sendMessage(jid, { text }, { quoted: message });
}

export async function schedule(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!sock || !jid) return;

    if (!jid.endsWith("@g.us")) {
        await sendText(sock, jid, "Command schedule hanya bisa digunakan di grup.", message);
        return;
    }

    let groups;
    try {
        groups = JSON.parse(
            await readFile(new URL("../database/group.json", import.meta.url), "utf8")
        );
    } catch (error) {
        console.error("[SCHEDULE] Gagal membaca group.json:", error?.message || error);
        await sendText(sock, jid, "Data jadwal grup gagal dibaca.", message);
        return;
    }

    const group = Array.isArray(groups)
        ? groups.find((item) => item?.id === jid)
        : null;

    if (!group) {
        await sendText(sock, jid, "Data grup ini belum tersedia di group.json.", message);
        return;
    }

    const rows = [];
    for (const item of Array.isArray(group.schedule) ? group.schedule : []) {
        if (!item || typeof item !== "object") continue;
        const time = String(item.time || "-");
        if (typeof item.open === "boolean") {
            rows.push(["Buka grup", item.open ? "ON" : "OFF", time]);
        }
        if (typeof item.close === "boolean") {
            rows.push(["Tutup grup", item.close ? "ON" : "OFF", time]);
        }
    }

    if (rows.length === 0) {
        await sendText(sock, jid, "Belum ada jadwal yang tersimpan untuk grup ini.", message);
        return;
    }

    const title = "Jadwal Grup";
    const headers = ["Aksi", "Status", "Waktu"];
    const fakeQuote = makeFakeQuote();

    try {
        if (typeof sock.sendTable !== "function") {
            throw new Error("sendTable tidak tersedia pada socket.");
        }

        await sock.sendTable(
            jid,
            title,
            headers,
            rows,
            fakeQuote,
        );
    } catch (error) {
        console.warn("[SCHEDULE] Gagal mengirim rich table:", error?.message || error);
        const text = [
            title,
            headers.join(" | "),
            "---",
            ...rows.map((row) => row.join(" | "))
        ].filter(Boolean).join("\n");
        await sendText(sock, jid, text, message);
    }
}

export default schedule;




