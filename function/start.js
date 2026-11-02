import settings from "../settings.js";
import { readFile } from "node:fs/promises";

const getSetting = (...keys) => {
    for (const key of keys) {
        if (settings?.[key] !== undefined && settings[key] !== null && settings[key] !== "")
            return settings[key];
    }
    return undefined;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function start(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!sock || !jid) return console.error("[START] Socket/JID kosong.");

    const devNumber = String(
        getSetting("devNumber", "developerNumber", "ownerNumber") || ""
    ).replace(/\D/g, "");
    if (!devNumber) return console.error("[START] devNumber tidak ada.");

    const botName = getSetting("botName", "nameBot") || "GROUP SECURITY";
    const devName = getSetting("devName", "developerName") || "Developer";
    const prefix = String(getSetting("prefix") || "/");
    const pushName = message?.pushName || "Pengguna";

    const caption = [
        "╭━━━〔 " + String(botName).toUpperCase() + " 〕━━━╮",
        "│",
        "│ Halo, " + pushName + "!",
        "│",
        "│ Bot keamanan dan pengelolaan grup",
        "│ WhatsApp dalam satu tempat.",
        "│",
        "├──〔 MENU UTAMA 〕",
        "│",
        "│ " + prefix + "start",
        "│ " + prefix + "addgb",
        "│ " + prefix + "delgb",
        "│ " + prefix + "help",
        "│ " + prefix + "rules",
        "│ ",
        "├──〔 GRUP MENU 〕",
        "│",
        "│ " + prefix + "add <nomor>",
        "│ " + prefix + "kick <nomor/reply/tag>",
        "│ " + prefix + "promote <nomor>",
        "│ " + prefix + "demote <nomor>",
        "│ " + prefix + "hidetag <pesan>",
        "│ " + prefix + "open",
        "│ " + prefix + "close",
        "│ " + prefix + "setopen on <HH:mm> | off",
        "│ " + prefix + "setclose on <HH:mm> | off",
        "│ " + prefix + "schedule",
        "│ ",
        "├──〔 SECURITY MENU 〕",
        "│",
        "│ " + prefix + "antilink <on/off>",
        "│ " + prefix + "antilinkkick <on/off> ",
        "│ " + prefix + "antisharechannel <on/off>",
        "│ " + prefix + "antisharechannelkick <on/off>",
        "│ " + prefix + "antiswgb <on/off>",
        "│ " + prefix + "antiswgbkick <on/off>",
        "│ " + prefix + "antitagsw <on/off>",
        "│ " + prefix + "antitagswkick <on/off>",
        "│ " + prefix + "antitagall <on/off>",
        "│ " + prefix + "antitagallkick <on/off>",
        "│ " + prefix + "antihidetag <on/off>",
        "│ " + prefix + "antihidetagkick <on/off>",
        "│ " + prefix + "rules",
        "│",
        "│ Bot ini dibuat oleh " + devName + "",
        "╰━━━━━━━━━━━━━━━━━━━━━━╯",
    ].join("\n");

    const buttons = [
        {
            name: "cta_url",
            buttonParamsJson: JSON.stringify(
                {
                    display_text: "DEVELOPER",
                    url: "https://wa.me/" + devNumber
                }
            )
        },
        {
            name: "cta_url",
            buttonParamsJson: JSON.stringify(
                {
                    display_text: "TikTok",
                    url: "https://www.tiktok.com/@dpwoffc"
                }
            )
        }
    ];

    const trySend = async (label, payload) => {
        try {
            await sock.sendMessage(jid, payload, { quoted: message });
            return true;
        } catch (e) {
            console.warn("[START] " + label + " gagal:", e?.message || e);
            return false;
        }
    };

    let gif = null;
    try {
        gif = await readFile(new URL("../media/menu.gif", import.meta.url));
    } catch (e) {
        console.warn("[START] menu.gif tidak ditemukan:", e?.message);
    }

    // GIF dikirim sebagai video GIF-style bersama tombol dalam interactiveMessage.
    if (gif && await trySend("interactiveMessage GIF + tombol", {
        interactiveMessage: {
            title: caption,
            footer: botName + " • Bot Menu",
            buttons,
            header: "",
            video: gif,
            gifPlayback: true
        }
    })) return;

    await sleep(1000);

    // Fallback gambar dengan tombol dalam satu interactiveMessage.
    let image = null;
    try {
        image = await readFile(new URL("../media/menu.jpg", import.meta.url));
    } catch (e) {
        console.warn("[START] menu.jpg tidak ditemukan:", e?.message);
    }

    if (image && await trySend("interactiveMessage gambar + tombol", {
        interactiveMessage: {
            title: caption,
            footer: botName + " • Bot Menu",
            buttons,
            header: "Menu Utama",
            image
        }
    })) return;

    await sleep(1000);

    // Fallback teks dengan tombol interactiveMessage.
    if (await trySend("interactiveMessage teks", {
        interactiveMessage: {
            title: caption,
            footer: botName + " • Bot Menu",
            buttons
        }
    })) return;

    // Fallback terakhir: teks biasa.
    try {
        await sock.sendMessage(jid, { text: caption }, { quoted: message });
    } catch (e) {
        console.error("[START] Gagal mengirim menu:", e?.message || e);
    }
}

export default start;



