import { readFile, rename, writeFile } from "node:fs/promises";
import settings from "../settings.js";

const databasePath = new URL("../database/group.json", import.meta.url);

export function normalizeNumber(value) {
    return String(value || "")
        .split("@")[0]
        .split(":")[0]
        .replace(/\D/g, "");
}

export async function sendReply(sock, jid, text, message) {
    await sock.sendMessage(jid, { text }, { quoted: message });
}

export async function requireOwnerAndBotAdmin(sock, message, botNumber) {
    const jid = message?.key?.remoteJid;
    if (!jid || !jid.endsWith("@g.us")) {
        if (jid) await sendReply(sock, jid, "Command ini hanya bisa digunakan di grup.", message);
        return null;
    }

    const owners = Array.isArray(settings.botAccess)
        ? settings.botAccess
        : [settings.botAccess];
    const senderNumber = normalizeNumber(
        message?.senderNumber || message?.key?.participantAlt || message?.key?.participant
    );

    if (!senderNumber || !owners.map(normalizeNumber).includes(senderNumber)) {
        await sendReply(sock, jid, "Command ini hanya bisa digunakan oleh owner bot.", message);
        return null;
    }

    let metadata;
    try {
        metadata = await sock.groupMetadata(jid);
    } catch (error) {
        console.error("[GROUP DB] Gagal membaca metadata grup:", error?.message || error);
        await sendReply(sock, jid, "Tidak dapat memeriksa admin bot di grup ini.", message);
        return null;
    }

    const botIdentifiers = [
        botNumber,
        message?.botNumber,
        message?.botJid,
        sock.user?.id,
        sock.user?.lid
    ].map(normalizeNumber).filter(Boolean);

    const botParticipant = (metadata?.participants || []).find((participant) => {
        const identifiers = [
            participant?.id,
            participant?.jid,
            participant?.phoneNumber,
            participant?.pn,
            participant?.lid,
            participant?.altJid
        ].map(normalizeNumber).filter(Boolean);

        return identifiers.some((identifier) => botIdentifiers.includes(identifier));
    });

    if (!botParticipant || !["admin", "superadmin", true].includes(botParticipant.admin)) {
        await sendReply(sock, jid, "Bot harus menjadi admin grup untuk menjalankan command ini.", message);
        return null;
    }

    return { jid };
}

export async function readGroups() {
    const parsed = JSON.parse(await readFile(databasePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Format group.json harus berupa array.");
    return parsed;
}

export async function writeGroups(groups) {
    const tempPath = new URL("../database/group.json.tmp", import.meta.url);
    await writeFile(tempPath, JSON.stringify(groups, null, 4) + "\n", "utf8");
    await rename(tempPath, databasePath);
}

export function createGroupRecord(jid) {
    return {
        id: jid,
        rules: [{
            antilink: false,
            antilinkkick: false,
            antisharechannel: false,
            antisharechannelkick: false,
            antiswgc: false,
            antiswgckick: false,
            antitagswg: false,
            antitagswgkick: false,
            antiswgb: false,
            antiswgbkick: false,
            antitagsw: false,
            antitagswkick: false,
            antitagall: false,
            antitagallkick: false,
            antihidetag: false,
            antihidetagkick: false
        }],
        schedule: [
            { open: false, time: "08:00" },
            { close: false, time: "21:00" }
        ]
    };
}

