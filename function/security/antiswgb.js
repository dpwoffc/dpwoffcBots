import { normalizeMessageContent } from "baileys";
import { readGroups, writeGroups } from "../groupDatabase.js";

const FLAG = "antiswgb";
const LEGACY_FLAG = "antiswgc";
const KICK_FLAG = "antiswgbkick";
const LEGACY_KICK_FLAG = "antiswgckick";

function normalizeId(value) {
    return String(value || "")
        .split("@")[0]
        .split(":")[0]
        .replace(/\D/g, "");
}

function participantIds(participant) {
    return [
        participant?.id,
        participant?.jid,
        participant?.phoneNumber,
        participant?.pn,
        participant?.lid,
        participant?.altJid
    ].map(normalizeId).filter(Boolean);
}

function isAdmin(participant) {
    return ["admin", "superadmin", true].includes(participant?.admin);
}

async function sendReply(sock, jid, text, message) {
    await sock.sendMessage(jid, { text }, { quoted: message });
}

async function authorizeGroup(sock, message, botNumber) {
    const jid = message?.key?.remoteJid;
    if (!jid || !jid.endsWith("@g.us")) {
        if (jid) await sendReply(sock, jid, "Command ini hanya bisa digunakan di grup.", message);
        return null;
    }

    let metadata;
    try {
        metadata = await sock.groupMetadata(jid);
    } catch (error) {
        console.error("[ANTISWGB] Gagal membaca metadata grup:", error?.message || error);
        await sendReply(sock, jid, "Gagal memeriksa izin admin grup.", message);
        return null;
    }

    const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
    const senderIds = [
        message?.senderNumber,
        message?.key?.participantAlt,
        message?.key?.remoteJidAlt,
        message?.key?.senderPn,
        message?.senderPn,
        message?.key?.participant
    ].map(normalizeId).filter(Boolean);
    const senderIsAdmin = participants.some((participant) =>
        isAdmin(participant) && participantIds(participant).some((id) => senderIds.includes(id))
    );

    if (!senderIsAdmin) {
        await sendReply(sock, jid, "Command ini hanya bisa digunakan oleh admin grup.", message);
        return null;
    }

    const botIds = [
        botNumber,
        message?.botNumber,
        message?.botJid,
        sock.user?.id,
        sock.user?.lid
    ].map(normalizeId).filter(Boolean);
    const botIsAdmin = participants.some((participant) =>
        isAdmin(participant) && participantIds(participant).some((id) => botIds.includes(id))
    );

    if (!botIsAdmin) {
        await sendReply(sock, jid, "Bot harus menjadi admin grup untuk mengaktifkan fitur ini.", message);
        return null;
    }

    return { jid };
}

async function getGroupRule(jid) {
    const groups = await readGroups();
    const group = groups.find((item) => item?.id === jid);
    if (!group) return { groups, group: null, rule: null };

    if (!Array.isArray(group.rules)) group.rules = [];
    if (!group.rules[0] || typeof group.rules[0] !== "object") group.rules[0] = {};
    return { groups, group, rule: group.rules[0] };
}

function hasGroupStory(message) {
    const raw = message?.message || {};
    const normalized = normalizeMessageContent(raw) || {};
    const contentLayers = [raw, normalized];
    return contentLayers.some((content) =>
        Boolean(content.groupStatusMessage || content.groupStatusMessageV2) ||
        Object.values(content).some((item) => item?.contextInfo?.isGroupStatus === true)
    );
}

function botIsAdmin(metadata, sock) {
    const botIds = [sock.user?.id, sock.user?.lid]
        .map(normalizeId)
        .filter(Boolean);
    return (metadata?.participants || []).some((participant) =>
        isAdmin(participant) && participantIds(participant).some((id) => botIds.includes(id))
    );
}

export async function enforceAntiswgb(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!jid?.endsWith("@g.us") || message?.key?.fromMe || !hasGroupStory(message)) return;

    try {
        const { rule } = await getGroupRule(jid);
        if (!rule) return;

        const enabled = rule[FLAG] === true || rule[LEGACY_FLAG] === true;
        const kickEnabled = rule[KICK_FLAG] === true || rule[LEGACY_KICK_FLAG] === true;
        if (!enabled || kickEnabled) return;

        const metadata = await sock.groupMetadata(jid);
        if (!botIsAdmin(metadata, sock)) return;
        if (!message.__securityDeleted) {
            await sock.sendMessage(jid, { delete: message.key });
            message.__securityDeleted = true;
        }
    } catch (error) {
        console.error("[ANTISWGB] Gagal menghapus story grup:", error?.message || error);
    }
}

export default async function antiswgb(sock, message, botNumber, args = []) {
    const access = await authorizeGroup(sock, message, botNumber);
    if (!access) return;

    const action = String(args[0] || "").toLowerCase();
    if (!["on", "off"].includes(action) || args.length !== 1) {
        await sendReply(sock, access.jid, "Format: /antiswgb on atau /antiswgb off", message);
        return;
    }

    try {
        const { groups, group, rule } = await getGroupRule(access.jid);
        if (!group || !rule) {
            await sendReply(sock, access.jid, "Grup ini belum terdaftar di database. Jalankan /addgb terlebih dahulu.", message);
            return;
        }

        const enabled = action === "on";
        rule[FLAG] = enabled;
        rule[LEGACY_FLAG] = enabled;
        await writeGroups(groups);
        await sendReply(
            sock,
            access.jid,
            `Anti Status/Story grup ${enabled ? "diaktifkan" : "dinonaktifkan"}.`,
            message
        );
    } catch (error) {
        console.error("[ANTISWGB] Gagal menyimpan pengaturan:", error?.message || error);
        await sendReply(sock, access.jid, "Gagal menyimpan pengaturan antiswgb.", message);
    }
}
