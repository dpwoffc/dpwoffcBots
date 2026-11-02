import settings from "./settings.js";
import start from "./function/start.js";
import schedule from "./function/schedule.js";
import addgb from "./function/addgb.js";
import delgb from "./function/delgb.js";
import add from "./function/admin/add.js";
import kick from "./function/admin/kick.js";
import promote from "./function/admin/promote.js";
import demote from "./function/admin/demote.js";
import hidetag from "./function/admin/hidetag.js";
import openGroup from "./function/admin/open.js";
import closeGroup from "./function/admin/close.js";
import setopen from "./function/admin/setopen.js";
import setclose from "./function/admin/setclose.js";
import antitagsw, { enforceAntitagsw } from "./function/security/antitagsw.js";
import antitagswkick, { enforceAntitagswkick } from "./function/security/antitagswkick.js";
import antiswgb, { enforceAntiswgb } from "./function/security/antiswgb.js";
import antiswgbkick, { enforceAntiswgbkick } from "./function/security/antiswgbkick.js";
import antilink, { enforceAntilink } from "./function/security/antilink.js";
import antilinkkick, { enforceAntilinkkick } from "./function/security/antilinkkick.js";
import antisharechannel, { enforceAntisharechannel } from "./function/security/antich.js";
import antisharechannelkick, { enforceAntisharechannelkick } from "./function/security/antichkick.js";
import antitagall, { enforceAntitagall } from "./function/security/antitagall.js";
import antitagallkick, { enforceAntitagallkick } from "./function/security/antitagallkick.js";
import antihidetag, { enforceAntihidetag } from "./function/security/antihidetag.js";
import antihidetagkick, { enforceAntihidetagkick } from "./function/security/antihidetagkick.js";
import rules from "./function/security/rules.js";

function normalizeNumber(value) {
    if (typeof value !== "string") return "";
    return value.split("@")[0].split(":")[0].replace(/\D/g, "");
}

function getSenderNumber(message) {
    if (message?.key?.fromMe) {
        const ownNumber = normalizeNumber(
            String(message?.botNumber || message?.botJid || "")
        );
        if (ownNumber) return ownNumber;
    }

    const candidates = [
        message?.senderNumber,
        message?.key?.participantAlt,
        message?.key?.remoteJidAlt,
        message?.key?.senderPn,
        message?.senderPn,
        message?.key?.participant,
        message?.key?.remoteJid
    ];

    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const number = normalizeNumber(candidate);
        if (number) return number;
    }

    return "";
}

function getAllowedNumbers(botNumber) {
    const devNumber = normalizeNumber(String(settings.devNumber || ""));
    const botAccess = Array.isArray(settings.botAccess)
        ? settings.botAccess
        : [settings.botAccess];

    return new Set(
        [devNumber, ...botAccess, botNumber]
            .map((value) => normalizeNumber(String(value || "")))
            .filter(Boolean)
    );
}

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

function withFakeQuote(sock) {
    return new Proxy(sock, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === "sendMessage" && typeof value === "function") {
                return (jid, content, options = {}) => {
                    return Reflect.apply(value, target, [
                        jid,
                        content,
                        {
                            ...(options && typeof options === "object" ? options : {}),
                            quoted: makeFakeQuote()
                        }
                    ]);
                };
            }
            return typeof value === "function" ? value.bind(target) : value;
        }
    });
}

export async function handleMessage(sock, message, botNumber) {
    try {
        if (!message) return;
        const jid = message.key?.remoteJid;
        if (!jid || jid.endsWith("@newsletter")) return;

        if (jid.endsWith("@g.us")) {
            await enforceAntitagsw(sock, message);
            await enforceAntitagswkick(sock, message);
            await enforceAntiswgb(sock, message);
            await enforceAntiswgbkick(sock, message);
            await enforceAntilink(sock, message);
            await enforceAntilinkkick(sock, message);
            await enforceAntisharechannel(sock, message);
            await enforceAntisharechannelkick(sock, message);
            await enforceAntitagall(sock, message);
            await enforceAntitagallkick(sock, message);
            await enforceAntihidetag(sock, message);
            await enforceAntihidetagkick(sock, message);
        }

        const senderNumber = getSenderNumber(message);
        const allowedNumbers = getAllowedNumbers(
            botNumber || message?.botNumber || message?.botJid
        );
        if (!senderNumber || !allowedNumbers.has(senderNumber)) return;

        const body = String(message.body || "").trim();
        if (!body.startsWith("/")) return;

        const args = body.slice(1).trim().split(/\s+/);
        const command = String(args.shift() || "").toLowerCase();
        if (!command) return;

        const botSock = withFakeQuote(sock);
        switch (command) {
            case "start":
                await start(botSock, message);
                break;

            case "schedule":
                await schedule(botSock, message);
                break;

            case "rules":
                await rules(botSock, message);
                break;

            case "addgb":
                await addgb(botSock, message, botNumber);
                break;

            case "delgb":
                await delgb(botSock, message, botNumber);
                break;

            case "add":
                await add(botSock, message, botNumber, args);
                break;

            case "kick":
                await kick(botSock, message, botNumber, args);
                break;

            case "promote":
                await promote(botSock, message, botNumber, args);
                break;

            case "demote":
                await demote(botSock, message, botNumber, args);
                break;

            case "hidetag":
                await hidetag(botSock, message, botNumber, args);
                break;

            case "open":
                await openGroup(botSock, message, botNumber);
                break;

            case "close":
                await closeGroup(botSock, message, botNumber);
                break;

            case "setopen":
                await setopen(botSock, message, botNumber, args);
                break;

            case "setclose":
                await setclose(botSock, message, botNumber, args);
                break;

            case "antitagsw":
                await antitagsw(botSock, message, botNumber, args);
                break;

            case "antitagswkick":
                await antitagswkick(botSock, message, botNumber, args);
                break;

            case "antiswgb":
                await antiswgb(botSock, message, botNumber, args);
                break;

            case "antiswgbkick":
                await antiswgbkick(botSock, message, botNumber, args);
                break;

            case "antilink":
                await antilink(botSock, message, botNumber, args);
                break;

            case "antilinkkick":
                await antilinkkick(botSock, message, botNumber, args);
                break;

            case "antisharechannel":
                await antisharechannel(botSock, message, botNumber, args);
                break;

            case "antisharechannelkick":
                await antisharechannelkick(botSock, message, botNumber, args);
                break;

            case "antitagall":
                await antitagall(botSock, message, botNumber, args);
                break;

            case "antitagallkick":
                await antitagallkick(botSock, message, botNumber, args);
                break;

            case "antihidetag":
                await antihidetag(botSock, message, botNumber, args);
                break;

            case "antihidetagkick":
                await antihidetagkick(botSock, message, botNumber, args);
                break;
        }
    } catch (error) {
        console.error("[handleMessage]", error);
    }
}


