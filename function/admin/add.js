
const normalizeId = (value) => String(value || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");

const getParticipantIds = (participant) => [
    participant?.id,
    participant?.jid,
    participant?.phoneNumber,
    participant?.pn,
    participant?.lid,
    participant?.altJid
].map(normalizeId).filter(Boolean);

const isAdmin = (participant) =>
    ["admin", "superadmin", true].includes(participant?.admin);

async function sendReply(sock, jid, text, message) {
    await sock.sendMessage(jid, { text }, { quoted: message });
}

async function authorizeGroupCommand(sock, message, botNumber, requireBotAdmin = true) {
    const jid = message?.key?.remoteJid;

    if (!jid || !jid.endsWith("@g.us")) {
        if (jid) {
            await sendReply(sock, jid, "Command ini hanya bisa digunakan di grup.", message);
        }
        return null;
    }

    let metadata;
    try {
        metadata = await sock.groupMetadata(jid);
    } catch (error) {
        console.error("[GROUP] Gagal membaca metadata grup:", error?.message || error);
        await sendReply(sock, jid, "Gagal memeriksa izin admin grup.", message);
        return null;
    }

    const participants = Array.isArray(metadata?.participants)
        ? metadata.participants
        : [];
    const senderIds = [
        message?.senderNumber,
        message?.key?.participantAlt,
        message?.key?.remoteJidAlt,
        message?.key?.senderPn,
        message?.senderPn,
        message?.key?.participant
    ].map(normalizeId).filter(Boolean);

    const senderIsAdmin = participants.some((participant) =>
        isAdmin(participant) &&
        getParticipantIds(participant).some((id) => senderIds.includes(id))
    );

    if (!senderIsAdmin) {
        await sendReply(sock, jid, "Command ini hanya bisa digunakan oleh admin grup.", message);
        return null;
    }

    if (requireBotAdmin) {
        const botIds = [
            botNumber,
            message?.botNumber,
            message?.botJid,
            sock.user?.id,
            sock.user?.lid
        ].map(normalizeId).filter(Boolean);

        const botIsAdmin = participants.some((participant) =>
            isAdmin(participant) &&
            getParticipantIds(participant).some((id) => botIds.includes(id))
        );

        if (!botIsAdmin) {
            await sendReply(
                sock,
                jid,
                "Bot harus menjadi admin grup untuk menjalankan command ini.",
                message
            );
            return null;
        }
    }

    return { jid, participants };
}

function getTargetJid(message, args) {
    const content = message?.message || {};
    const contextInfo = [
        content.extendedTextMessage?.contextInfo,
        content.imageMessage?.contextInfo,
        content.videoMessage?.contextInfo,
        content.documentMessage?.contextInfo
    ].find(Boolean) || {};

    if (contextInfo.mentionedJid?.[0]) {
        return contextInfo.mentionedJid[0];
    }

    const quotedJid = contextInfo.participant || contextInfo.remoteJid;
    if (
        quotedJid &&
        (quotedJid.endsWith("@s.whatsapp.net") || quotedJid.endsWith("@lid"))
    ) {
        return quotedJid;
    }

    const value = String(args[0] || "").trim().replace(/^@/, "");
    if (value.includes("@")) return value;

    const number = normalizeId(value);
    return number ? `${number}@s.whatsapp.net` : "";
}

function getTargetLabel(jid) {
    return normalizeId(jid) || jid;
}

export default async function add(sock, message, botNumber, args = []) {
    const access = await authorizeGroupCommand(sock, message, botNumber);
    if (!access) return;

    const targetJid = getTargetJid(message, args);
    if (!targetJid) {
        await sendReply(sock, access.jid, "Format: /add <nomor/reply/tag>", message);
        return;
    }

    const targetLabel = getTargetLabel(targetJid);

    try {
        const result = await sock.groupParticipantsUpdate(
            access.jid,
            [targetJid],
            "add"
        );
        const results = Array.isArray(result) ? result : [result];
        const failedResult = results.find(
            (item) => item?.status && !String(item.status).startsWith("2")
        );

        if (failedResult) {
            await sendReply(
                sock,
                access.jid,
                `Gagal menjalankan perintah add untuk ${targetLabel} (status ${failedResult.status}).`,
                message
            );
            return;
        }

        await sendReply(
            sock,
            access.jid,
            `Anggota ${targetLabel} berhasil ditambahkan.`,
            message
        );
    } catch (error) {
        console.error("[GROUP] Gagal menjalankan add:", error?.message || error);
        await sendReply(
            sock,
            access.jid,
            `Gagal menjalankan perintah add untuk ${targetLabel}.`,
            message
        );
    }
}
