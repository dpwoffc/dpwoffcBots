import { normalizeMessageContent } from "baileys";
import { readGroups, writeGroups } from "../groupDatabase.js";

const FLAG = "antitagswkick";
const LEGACY_FLAG = "antitagswgkick";

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
        console.error("[ANTITAGSWKICK] Gagal membaca metadata grup:", error?.message || error);
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

function hasGroupStatusMention(message) {
    const raw = message?.message || {};
    const normalized = normalizeMessageContent(raw) || {};
    return Boolean(raw.groupStatusMentionMessage || normalized.groupStatusMentionMessage);
}

function botIsAdmin(metadata, sock) {
    const botIds = [sock.user?.id, sock.user?.lid]
        .map(normalizeId)
        .filter(Boolean);
    return (metadata?.participants || []).some((participant) =>
        isAdmin(participant) && participantIds(participant).some((id) => botIds.includes(id))
    );
}

function findSenderParticipant(message, participants) {
    const senderIds = [
        message?.key?.participant,
        message?.participant,
        message?.key?.participantAlt,
        message?.key?.senderPn,
        message?.senderNumber
    ].map(normalizeId).filter(Boolean);

    return participants.find((participant) =>
        participantIds(participant).some((id) => senderIds.includes(id))
    );
}

export async function enforceAntitagswkick(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!jid?.endsWith("@g.us") || message?.key?.fromMe || !hasGroupStatusMention(message)) return;

    try {
        const { rule } = await getGroupRule(jid);
        if (!rule || (rule[FLAG] !== true && rule[LEGACY_FLAG] !== true)) return;

        const metadata = await sock.groupMetadata(jid);
        const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
        if (!botIsAdmin(metadata, sock)) return;

        if (!message.__securityDeleted) {
            try {
                await sock.sendMessage(jid, { delete: message.key });
                message.__securityDeleted = true;
            } catch (error) {
                console.error("[ANTITAGSWKICK] Gagal menghapus notifikasi mention status grup:", error?.message || error);
            }
        }

        const target = findSenderParticipant(message, participants);
        if (!target || isAdmin(target)) return;

        const targetJid = message?.key?.participant || message?.participant || target.id || target.jid;
        if (!targetJid || normalizeId(targetJid) === normalizeId(sock.user?.id)) return;

        if (!message.__securityKicked) {
            await sock.groupParticipantsUpdate(jid, [targetJid], "remove");
            message.__securityKicked = true;
        }
    } catch (error) {
        console.error("[ANTITAGSWKICK] Gagal menghapus mention atau mengeluarkan pengirim:", error?.message || error);
    }
}

export default async function antitagswkick(sock, message, botNumber, args = []) {
    const access = await authorizeGroup(sock, message, botNumber);
    if (!access) return;

    const action = String(args[0] || "").toLowerCase();
    if (!["on", "off"].includes(action) || args.length !== 1) {
        await sendReply(sock, access.jid, "Format: /antitagswkick on atau /antitagswkick off", message);
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
            `Anti mention grup di Status pribadi dengan kick ${enabled ? "diaktifkan" : "dinonaktifkan"}.`,
            message
        );
    } catch (error) {
        console.error("[ANTITAGSWKICK] Gagal menyimpan pengaturan:", error?.message || error);
        await sendReply(sock, access.jid, "Gagal menyimpan pengaturan antitagswkick.", message);
    }
}
