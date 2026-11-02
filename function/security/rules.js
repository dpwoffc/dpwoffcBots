import { readGroups } from "../groupDatabase.js";

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

const RULES = [
    { name: "antilink", fields: ["antilink"] },
    { name: "antilinkkick", fields: ["antilinkkick"] },
    { name: "antisharechannel", fields: ["antisharechannel"] },
    { name: "antisharechannelkick", fields: ["antisharechannelkick"] },
    { name: "antitagsw", fields: ["antitagsw", "antitagswg"] },
    { name: "antitagswkick", fields: ["antitagswkick", "antitagswgkick"] },
    { name: "antiswgb", fields: ["antiswgb", "antiswgc"] },
    { name: "antiswgbkick", fields: ["antiswgbkick", "antiswgckick"] },
    { name: "antitagall", fields: ["antitagall"] },
    { name: "antitagallkick", fields: ["antitagallkick"] },
    { name: "antihidetag", fields: ["antihidetag"] },
    { name: "antihidetagkick", fields: ["antihidetagkick"] }
];

export async function rules(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!sock || !jid) return;

    if (!jid.endsWith("@g.us")) {
        await sendText(sock, jid, "Command /rules hanya bisa digunakan di grup.", message);
        return;
    }

    let groups;
    try {
        groups = await readGroups();
    } catch (error) {
        console.error("[RULES] Gagal membaca group.json:", error?.message || error);
        await sendText(sock, jid, "Data peraturan grup gagal dibaca.", message);
        return;
    }

    const group = groups.find((item) => item?.id === jid);
    const rule = Array.isArray(group?.rules) ? group.rules[0] : group?.rules;
    if (!group || !rule) {
        await sendText(sock, jid, "Data peraturan grup ini belum tersedia di group.json.", message);
        return;
    }

    const rows = RULES.map(({ name, fields }) => {
        const enabled = fields.some((field) => rule[field] === true);
        return [name, enabled ? "aktif" : "nonaktif"];
    });

    const title = "Peraturan Keamanan Grup";
    const headers = ["Rules", "Status"];

    try {
        if (typeof sock.sendTable !== "function") {
            throw new Error("sendTable tidak tersedia pada socket.");
        }

        await sock.sendTable(jid, title, headers, rows, makeFakeQuote());
    } catch (error) {
        console.warn("[RULES] Gagal mengirim rich table:", error?.message || error);
        const text = [
            title,
            headers.join(" | "),
            "---",
            ...rows.map((row) => row.join(" | "))
        ].join("\n");
        await sendText(sock, jid, text, message);
    }
}

export default rules;
