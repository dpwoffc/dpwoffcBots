import { normalizeMessageContent } from "baileys";
import { readGroups, writeGroups } from "../groupDatabase.js";

const COMMAND = "antitagallkick";
const FLAG = "antitagallkick";
const KICK_FLAG = "antitagallkick";
const DESCRIPTION = "Anti tag semua anggota dengan kick";
const KICK_MODE = true;

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

function getMessageLayers(message) {
    const raw = message?.message || {};
    const normalized = normalizeMessageContent(raw) || raw;
    return [raw, normalized];
}

function getContextInfos(message) {
    const contexts = [];
    for (const layer of getMessageLayers(message)) {
        if (!layer || typeof layer !== "object") continue;
        for (const value of Object.values(layer)) {
            if (!value || typeof value !== "object") continue;
            if (value.contextInfo && typeof value.contextInfo === "object") {
                contexts.push(value.contextInfo);
            }
            if (value.message && typeof value.message === "object") {
                for (const nested of Object.values(value.message)) {
                    if (nested?.contextInfo && typeof nested.contextInfo === "object") {
                        contexts.push(nested.contextInfo);
                    }
                }
            }
        }
    }
    return contexts;
}

function getMessageText(message) {
    const content = getMessageLayers(message)[1] || {};
    return [
        content.conversation,
        content.extendedTextMessage?.text,
        content.imageMessage?.caption,
        content.videoMessage?.caption,
        content.documentMessage?.caption,
        content.audioMessage?.caption,
        content.buttonsResponseMessage?.selectedDisplayText,
        content.listResponseMessage?.title,
        content.listResponseMessage?.description,
        content.templateButtonReplyMessage?.selectedDisplayText,
        content.interactiveResponseMessage?.body?.text
    ].filter((value) => typeof value === "string").join("\n");
}

function hasSignal(message) {
    const text = getMessageText(message);
    const contexts = getContextInfos(message);
    const mentions = [...new Set(contexts.flatMap((context) => context.mentionedJid || []))];
    return contexts.some((context) => Number(context.nonJidMentions || 0) > 0) ||
        /@(all|semua)\b/iu.test(text) ||
        mentions.length >= 2;
}

function isViolation(message, metadata) {
    const text = getMessageText(message);
    const contexts = getContextInfos(message);
    const mentions = [...new Set(contexts.flatMap((context) => context.mentionedJid || []))];
    const nativeMentionAll = contexts.some((context) => Number(context.nonJidMentions || 0) > 0);
    const participantCount = Array.isArray(metadata?.participants) ? metadata.participants.length : 0;
    const tagsNearlyEveryone = participantCount > 1 &&
        mentions.length >= Math.max(2, participantCount - 1);
    return nativeMentionAll || /@(all|semua)\b/iu.test(text) || tagsNearlyEveryone;
}

async function getGroupRule(jid) {
    const groups = await readGroups();
    const group = groups.find((item) => item?.id === jid);
    if (!group) return { groups, group: null, rule: null };

    if (!Array.isArray(group.rules)) group.rules = [];
    if (!group.rules[0] || typeof group.rules[0] !== "object") group.rules[0] = {};
    return { groups, group, rule: group.rules[0] };
}

function isBotAdmin(metadata, sock) {
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
        console.error("[" + COMMAND.toUpperCase() + "] Gagal membaca metadata grup:", error?.message || error);
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

export async function enforceAntitagallkick(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!jid?.endsWith("@g.us") || message?.key?.fromMe || !hasSignal(message)) return;

    try {
        const { rule } = await getGroupRule(jid);
        if (!rule) return;

        const enabled = rule[FLAG] === true;
        const kickEnabled = rule[KICK_FLAG] === true;
        if (KICK_MODE ? !kickEnabled : !enabled || kickEnabled) return;

        const metadata = await sock.groupMetadata(jid);
        if (!isBotAdmin(metadata, sock) || !isViolation(message, metadata)) return;

        if (!message.__securityDeleted) {
            try {
                await sock.sendMessage(jid, { delete: message.key });
                message.__securityDeleted = true;
            } catch (error) {
                console.error("[" + COMMAND.toUpperCase() + "] Gagal menghapus pesan:", error?.message || error);
            }
        }

        if (KICK_MODE && !message.__securityKicked) {
            const participants = Array.isArray(metadata?.participants) ? metadata.participants : [];
            const target = findSenderParticipant(message, participants);
            if (!target || isAdmin(target)) return;

            const targetJid = message?.key?.participant || message?.participant || target.id || target.jid;
            if (!targetJid || normalizeId(targetJid) === normalizeId(sock.user?.id)) return;

            await sock.groupParticipantsUpdate(jid, [targetJid], "remove");
            message.__securityKicked = true;
        }
    } catch (error) {
        console.error("[" + COMMAND.toUpperCase() + "] Gagal memproses pelanggaran:", error?.message || error);
    }
}

export default async function antitagallkick(sock, message, botNumber, args = []) {
    const access = await authorizeGroup(sock, message, botNumber);
    if (!access) return;

    const action = String(args[0] || "").toLowerCase();
    if (!["on", "off"].includes(action) || args.length !== 1) {
        await sendReply(sock, access.jid, "Format: /" + COMMAND + " on atau /" + COMMAND + " off", message);
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
        await writeGroups(groups);
        await sendReply(
            sock,
            access.jid,
            DESCRIPTION + " " + (enabled ? "diaktifkan" : "dinonaktifkan") + ".",
            message
        );
    } catch (error) {
        console.error("[" + COMMAND.toUpperCase() + "] Gagal menyimpan pengaturan:", error?.message || error);
        await sendReply(sock, access.jid, "Gagal menyimpan pengaturan /" + COMMAND + ".", message);
    }
}

