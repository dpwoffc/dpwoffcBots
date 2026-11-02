import { readGroups, writeGroups } from "../groupDatabase.js";

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

export default async function setopen(sock, message, botNumber, args = []) {
    const access = await authorizeGroupCommand(sock, message, botNumber);
    if (!access) return;

    const action = String(args[0] || "").toLowerCase();
    if (!["on", "off"].includes(action)) {
        await sendReply(
            sock,
            access.jid,
            "Format: /setopen on <HH:mm> atau /setopen off",
            message
        );
        return;
    }

    let scheduleTime;
    if (action === "on") {
        const input = String(args[1] || "");
        const match = /^(\d{1,2})(?::([0-5]\d))?$/.exec(input);
        if (!match || args.length > 2) {
            await sendReply(
                sock,
                access.jid,
                "Format: /setopen on <HH:mm>. Contoh: /setopen on 12:30 (angka jam saja tetap berarti :00).",
                message
            );
            return;
        }

        const hour = Number(match[1]);
        const minute = Number(match[2] || 0);
        const hasMinutes = input.includes(":");
        const validTime = hasMinutes
            ? hour >= 0 && hour <= 23
            : hour >= 1 && hour <= 24;
        if (!validTime) {
            await sendReply(
                sock,
                access.jid,
                hasMinutes
                    ? "Jam harus 00:00 sampai 23:59 dan menit 00 sampai 59."
                    : "Format jam lama hanya menerima angka 1 sampai 24.",
                message
            );
            return;
        }

        scheduleTime = String(hour === 24 ? 0 : hour).padStart(2, "0") +
            ":" + String(minute).padStart(2, "0");
    } else if (args.length > 1) {
        await sendReply(sock, access.jid, "Format: /setopen off", message);
        return;
    }

    try {
        const groups = await readGroups();
        const group = groups.find((item) => item?.id === access.jid);
        if (!group) {
            await sendReply(
                sock,
                access.jid,
                "Grup belum ada di database. Jalankan /addgb terlebih dahulu.",
                message
            );
            return;
        }

        if (!Array.isArray(group.schedule)) group.schedule = [];

        let setting = group.schedule.find(
            (item) => item && Object.prototype.hasOwnProperty.call(item, "open")
        );

        if (!setting) {
            setting = { open: false, time: "08:00" };
            group.schedule.push(setting);
        }

        setting.open = action === "on";
        if (action === "on") {
            setting.time = scheduleTime;
        }

        await writeGroups(groups);

        const status = action === "on"
            ? "aktif pada pukul " + setting.time
            : "nonaktif";

        await sendReply(
            sock,
            access.jid,
            "Jadwal buka grup sekarang " + status + ".",
            message
        );
    } catch (error) {
        console.error("[GROUP] Gagal memperbarui setopen:", error?.message || error);
        await sendReply(
            sock,
            access.jid,
            "Gagal menyimpan perubahan jadwal ke group.json.",
            message
        );
    }
}
