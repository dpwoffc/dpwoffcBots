import {
    readGroups,
    requireOwnerAndBotAdmin,
    sendReply,
    writeGroups
} from "./groupDatabase.js";

export async function delgb(sock, message, botNumber) {
    const access = await requireOwnerAndBotAdmin(sock, message, botNumber);
    if (!access) return;

    try {
        const groups = await readGroups();
        const remainingGroups = groups.filter((group) => group?.id !== access.jid);

        if (remainingGroups.length === groups.length) {
            await sendReply(sock, access.jid, "Grup ini belum terdaftar di database.", message);
            return;
        }

        await writeGroups(remainingGroups);
        await sendReply(sock, access.jid, "Grup berhasil dihapus dari database.", message);
    } catch (error) {
        console.error("[DELGB] Gagal memperbarui group.json:", error?.message || error);
        await sendReply(sock, access.jid, "Gagal menghapus grup dari database.", message);
    }
}

export default delgb;
