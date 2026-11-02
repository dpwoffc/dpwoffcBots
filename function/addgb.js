import {
    createGroupRecord,
    readGroups,
    requireOwnerAndBotAdmin,
    sendReply,
    writeGroups
} from "./groupDatabase.js";

export async function addgb(sock, message, botNumber) {
    const access = await requireOwnerAndBotAdmin(sock, message, botNumber);
    if (!access) return;

    try {
        const groups = await readGroups();
        if (groups.some((group) => group?.id === access.jid)) {
            await sendReply(sock, access.jid, "Grup ini sudah terdaftar di database.", message);
            return;
        }

        groups.push(createGroupRecord(access.jid));
        await writeGroups(groups);
        await sendReply(sock, access.jid, "Grup berhasil ditambahkan ke database.", message);
    } catch (error) {
        console.error("[ADDGB] Gagal memperbarui group.json:", error?.message || error);
        await sendReply(sock, access.jid, "Gagal menambahkan grup ke database.", message);
    }
}

export default addgb;
