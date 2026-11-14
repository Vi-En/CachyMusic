// CachyMusic - Zero-Dependency Client-Side Binary Audio Metadata & Artwork Parser
// Supports FLAC, MP3 (ID3v1 + ID3v2.2/2.3/2.4), OGG Vorbis, Opus, WAV (RIFF/INFO/ID3), and M4A/MP4/ALAC.
import { formatFileSize } from './utils.js';

const ID3V1_GENRES = [
    'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop',
    'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae',
    'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks',
    'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion',
    'Trance', 'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip',
    'Gospel', 'Noise', 'Alt. Rock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative',
    'Instrumental Pop', 'Instrumental Rock', 'Ethnic', 'Gothic', 'Darkwave',
    'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream',
    'Southern Rock', 'Comedy', 'Cult', 'Gangsta Rap', 'Top 40', 'Christian Rap',
    'Pop/Funk', 'Jungle', 'Native American', 'Cabaret', 'New Wave', 'Psychedelic',
    'Rave', 'Showtunes', 'Trailer', 'Lo-Fi', 'Tribal', 'Acid Punk', 'Acid Jazz',
    'Polka', 'Retro', 'Musical', 'Rock & Roll', 'Hard Rock', 'Folk', 'Folk-Rock',
    'National Folk', 'Swing', 'Fast-Fusion', 'Bebop', 'Latin', 'Revival', 'Celtic',
    'Bluegrass', 'Avantgarde', 'Gothic Rock', 'Progressive Rock', 'Psychedelic Rock',
    'Symphonic Rock', 'Slow Rock', 'Big Band', 'Chorus', 'Easy Listening', 'Acoustic',
    'Humour', 'Speech', 'Chanson', 'Opera', 'Chamber Music', 'Sonata', 'Symphony',
    'Booty Bass', 'Primus', 'Porn Groove', 'Satire', 'Slow Jam', 'Club', 'Tango',
    'Samba', 'Folklore', 'Ballad', 'Power Ballad', 'Rhythmic Soul', 'Freestyle',
    'Duet', 'Punk Rock', 'Drum Solo', 'A Cappella', 'Euro-House', 'Dance Hall',
    'Goa', 'Drum & Bass', 'Club-House', 'Hardcore', 'Terror', 'Indie', 'BritPop',
    'Afro-Punk', 'Polsk Punk', 'Beat', 'Christian Gangsta Rap', 'Heavy Metal',
    'Black Metal', 'Crossover', 'Contemporary Christian', 'Christian Rock',
    'Merengue', 'Salsa', 'Thrash Metal', 'Anime', 'JPop', 'Synthpop'
];

export function normalizeGenre(rawGenre) {
    if (rawGenre === null || rawGenre === undefined || rawGenre === '') return 'Audio';
    const str = rawGenre.toString().trim();
    const m = str.match(/^\(?(\d{1,3})\)?$/);
    if (m) {
        const idx = parseInt(m[1], 10);
        if (idx >= 0 && idx < ID3V1_GENRES.length) return ID3V1_GENRES[idx];
    }
    return str;
}

function bytesToDataUrl(picBytes, mimeHint = 'image/jpeg') {
    if (!picBytes || picBytes.length < 16) return null;
    let mime = mimeHint;
    if (picBytes[0] === 0x89 && picBytes[1] === 0x50 && picBytes[2] === 0x4E && picBytes[3] === 0x47) {
        mime = 'image/png';
    } else if (picBytes[0] === 0xFF && picBytes[1] === 0xD8 && picBytes[2] === 0xFF) {
        mime = 'image/jpeg';
    } else if (picBytes[0] === 0x52 && picBytes[1] === 0x49 && picBytes[2] === 0x46 && picBytes[3] === 0x46) {
        mime = 'image/webp';
    }
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < picBytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, picBytes.subarray(i, i + chunk));
    }
    return `data:${mime};base64,${btoa(binary)}`;
}

function decodeBase64ToBytes(b64) {
    const clean = b64.replace(/\s+/g, '');
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function parseFlacPictureBlock(uint8, view, startPos, maxLen) {
    let p = startPos + 4;
    if (p + 4 > maxLen) return null;
    const mimeLen = view.getUint32(p, false);
    p += 4;
    if (mimeLen > 128 || p + mimeLen + 4 > maxLen) return null;
    const mime = new TextDecoder('ascii').decode(uint8.subarray(p, p + mimeLen)) || 'image/jpeg';
    p += mimeLen;
    const descLen = view.getUint32(p, false);
    p += 4 + descLen + 16;
    if (p + 4 > maxLen) return null;
    const picLen = view.getUint32(p, false);
    p += 4;
    if (picLen <= 16 || p + picLen > maxLen) return null;
    return bytesToDataUrl(uint8.subarray(p, p + picLen), mime);
}

function applyVorbisCommentEntry(meta, key, val) {
    const k = key.toUpperCase();
    const v = val.trim();
    if (!v) return;
    if (k === 'TITLE') meta.title = v;
    else if (k === 'ARTIST') meta.artist = v;
    else if ((k === 'ALBUMARTIST' || k === 'ALBUM_ARTIST') && !meta.artist) meta.artist = v;
    else if (k === 'ALBUM') meta.album = v;
    else if (k === 'GENRE') meta.genre = v;
    else if (k === 'DATE' || k === 'YEAR') {
        const m = v.match(/\d{4}/);
        if (m) meta.year = parseInt(m[0], 10);
    } else if (k === 'TRACKNUMBER' || k === 'TRACK') {
        meta.track = v.replace(/\/\d+$/, '');
    } else if (k === 'LYRICS' || k === 'UNSYNCEDLYRICS') {
        meta.lyrics = v;
    } else if (k === 'REPLAYGAIN_TRACK_GAIN') {
        const g = parseFloat(v.replace(/dB/i, '').trim());
        if (Number.isFinite(g)) meta.replayGain = g;
    } else if (k === 'REPLAYGAIN_TRACK_PEAK') {
        const p = parseFloat(v);
        if (Number.isFinite(p) && p > 0) meta.replayPeak = p;
    } else if (k === 'METADATA_BLOCK_PICTURE' && !meta.cover) {
        try {
            const bytes = decodeBase64ToBytes(v);
            const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            meta.cover = parseFlacPictureBlock(bytes, dv, 0, bytes.length);
        } catch (_) {}
    }
}

function parseVorbisCommentBlock(uint8, view, startPos, blockLen, meta, hasFramingBit = false) {
    let cPos = startPos;
    const end = startPos + blockLen;
    if (cPos + 4 > end) return;
    const vendorLen = view.getUint32(cPos, true);
    cPos += 4 + vendorLen;
    if (cPos + 4 > end) return;
    const count = view.getUint32(cPos, true);
    cPos += 4;
    const decoder = new TextDecoder('utf-8');
    for (let i = 0; i < count; i++) {
        if (cPos + 4 > end) break;
        const cLen = view.getUint32(cPos, true);
        cPos += 4;
        if (cPos + cLen > end) break;
        const comment = decoder.decode(uint8.subarray(cPos, cPos + cLen));
        cPos += cLen;
        const eq = comment.indexOf('=');
        if (eq !== -1) {
            applyVorbisCommentEntry(meta, comment.substring(0, eq), comment.substring(eq + 1));
        }
    }
    if (hasFramingBit && cPos < end) {
        // valid framing bit consumed
    }
}

function decodeId3Text(bytes, hasEncodingByte = true) {
    if (!bytes || bytes.length === 0) return '';
    const enc = hasEncodingByte ? bytes[0] : 0;
    const raw = hasEncodingByte ? bytes.subarray(1) : bytes;
    if (raw.length === 0) return '';
    try {
        if (enc === 1) return new TextDecoder('utf-16le').decode(raw).replace(/^\uFEFF/, '').replace(/\0+$/, '').trim();
        if (enc === 2) return new TextDecoder('utf-16be').decode(raw).replace(/^\uFEFF/, '').replace(/\0+$/, '').trim();
        if (enc === 3) return new TextDecoder('utf-8').decode(raw).replace(/\0+$/, '').trim();
        return new TextDecoder('iso-8859-1').decode(raw).replace(/\0+$/, '').trim();
    } catch (_) {
        return '';
    }
}

function parseId3v2Tag(uint8, view, offset, meta) {
    if (offset + 10 > uint8.length) return;
    if (uint8[offset] !== 0x49 || uint8[offset + 1] !== 0x44 || uint8[offset + 2] !== 0x33) return;
    const version = uint8[offset + 3];
    const tagSize = ((uint8[offset + 6] & 0x7F) << 21)
        | ((uint8[offset + 7] & 0x7F) << 14)
        | ((uint8[offset + 8] & 0x7F) << 7)
        | (uint8[offset + 9] & 0x7F);
    let pos = offset + 10;
    const end = Math.min(uint8.length, pos + tagSize);
    const asciiDec = new TextDecoder('ascii');
    const isV2 = version === 2;
    const hdrSize = isV2 ? 6 : 10;

    while (pos + hdrSize <= end) {
        const frameId = asciiDec.decode(uint8.subarray(pos, pos + (isV2 ? 3 : 4)));
        if (frameId.charCodeAt(0) === 0 || !frameId.trim()) break;
        let frameSize = 0;
        if (isV2) {
            frameSize = (uint8[pos + 3] << 16) | (uint8[pos + 4] << 8) | uint8[pos + 5];
        } else if (version >= 4) {
            frameSize = ((uint8[pos + 4] & 0x7F) << 21)
                | ((uint8[pos + 5] & 0x7F) << 14)
                | ((uint8[pos + 6] & 0x7F) << 7)
                | (uint8[pos + 7] & 0x7F);
        } else {
            frameSize = view.getUint32(pos + 4, false);
        }
        pos += hdrSize;
        if (frameSize <= 0 || pos + frameSize > end) break;
        const frameData = uint8.subarray(pos, pos + frameSize);
        pos += frameSize;

        if (frameId === 'TIT2' || frameId === 'TT2') meta.title = decodeId3Text(frameData);
        else if (frameId === 'TPE1' || frameId === 'TP1') meta.artist = decodeId3Text(frameData);
        else if ((frameId === 'TPE2' || frameId === 'TP2') && !meta.artist) meta.artist = decodeId3Text(frameData);
        else if (frameId === 'TALB' || frameId === 'TAL') meta.album = decodeId3Text(frameData);
        else if (frameId === 'TCON' || frameId === 'TCO') meta.genre = normalizeGenre(decodeId3Text(frameData));
        else if (frameId === 'TYER' || frameId === 'TDRC' || frameId === 'TYE') {
            const m = decodeId3Text(frameData).match(/\d{4}/);
            if (m) meta.year = parseInt(m[0], 10);
        } else if (frameId === 'TRCK' || frameId === 'TRK') {
            meta.track = decodeId3Text(frameData).replace(/\/\d+$/, '');
        } else if (frameId === 'TXXX' && frameData.length > 2) {
            const txt = decodeId3Text(frameData);
            const parts = txt.split('\0');
            if (parts.length >= 2) {
                const desc = parts[0].toUpperCase();
                const val = parts[1];
                if (desc === 'REPLAYGAIN_TRACK_GAIN') {
                    const g = parseFloat(val.replace(/dB/i, '').trim());
                    if (Number.isFinite(g)) meta.replayGain = g;
                } else if (desc === 'REPLAYGAIN_TRACK_PEAK') {
                    const p = parseFloat(val);
                    if (Number.isFinite(p) && p > 0) meta.replayPeak = p;
                }
            }
        } else if ((frameId === 'USLT' || frameId === 'ULT') && frameData.length > 4) {
            const enc = frameData[0];
            let dStart = 4;
            if (enc === 1 || enc === 2) {
                while (dStart + 1 < frameData.length && !(frameData[dStart] === 0 && frameData[dStart + 1] === 0)) dStart += 2;
                dStart += 2;
            } else {
                while (dStart < frameData.length && frameData[dStart] !== 0) dStart++;
                dStart += 1;
            }
            const lyricBytes = frameData.subarray(dStart);
            try {
                if (enc === 1) meta.lyrics = new TextDecoder('utf-16le').decode(lyricBytes).replace(/^\uFEFF/, '').trim();
                else if (enc === 2) meta.lyrics = new TextDecoder('utf-16be').decode(lyricBytes).replace(/^\uFEFF/, '').trim();
                else if (enc === 3) meta.lyrics = new TextDecoder('utf-8').decode(lyricBytes).trim();
                else meta.lyrics = new TextDecoder('iso-8859-1').decode(lyricBytes).trim();
            } catch (_) {}
        } else if ((frameId === 'APIC' || frameId === 'PIC') && frameData.length > 10 && !meta.cover) {
            const enc = frameData[0];
            let mime = 'image/jpeg';
            let dStart = 1;
            if (frameId === 'PIC') {
                const fmt = asciiDec.decode(frameData.subarray(1, 4)).toUpperCase();
                mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
                dStart = 5;
            } else {
                let mEnd = 1;
                while (mEnd < frameData.length && frameData[mEnd] !== 0) mEnd++;
                mime = asciiDec.decode(frameData.subarray(1, mEnd)) || 'image/jpeg';
                dStart = mEnd + 2;
            }
            if (enc === 1 || enc === 2) {
                while (dStart + 1 < frameData.length && !(frameData[dStart] === 0 && frameData[dStart + 1] === 0)) dStart += 2;
                dStart += 2;
            } else {
                while (dStart < frameData.length && frameData[dStart] !== 0) dStart++;
                dStart += 1;
            }
            const picBytes = frameData.subarray(dStart);
            const url = bytesToDataUrl(picBytes, mime);
            if (url) meta.cover = url;
        }
    }

    // Read trailing first MPEG frame header if sampleRate/bitrate missing
    const mpegOffset = Math.min(uint8.length - 4, offset + 10 + tagSize);
    for (let i = Math.max(0, mpegOffset); i < uint8.length - 4; i++) {
        if (uint8[i] === 0xFF && (uint8[i + 1] & 0xE0) === 0xE0) {
            const ver = (uint8[i + 1] >> 3) & 0x03;
            const brIdx = (uint8[i + 2] >> 4) & 0x0F;
            const srIdx = (uint8[i + 2] >> 2) & 0x03;
            const chMode = (uint8[i + 3] >> 6) & 0x03;
            const srs = ver === 3 ? [44100, 48000, 32000] : [22050, 24000, 16000];
            const brTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
            if (srIdx < 3 && !meta.sampleRate) meta.sampleRate = srs[srIdx];
            if (brIdx > 0 && brIdx < 15 && !meta.bitrate) meta.bitrate = brTable[brIdx];
            if (!meta.channels) meta.channels = (chMode === 3) ? 1 : 2;
            break;
        }
    }
}

function parseFlac(uint8, view, fileSize, meta) {
    meta.format = 'FLAC';
    let pos = 4;
    let isLast = false;
    while (!isLast && pos + 4 <= uint8.length) {
        const header = uint8[pos];
        isLast = (header & 0x80) !== 0;
        const type = header & 0x7F;
        const len = (uint8[pos + 1] << 16) | (uint8[pos + 2] << 8) | uint8[pos + 3];
        pos += 4;
        if (pos + len > uint8.length) break;

        if (type === 0 && len >= 34) {
            const sr = (uint8[pos + 10] << 12) | (uint8[pos + 11] << 4) | (uint8[pos + 12] >> 4);
            const ch = ((uint8[pos + 12] >> 1) & 0x07) + 1;
            const bps = (((uint8[pos + 12] & 0x01) << 4) | (uint8[pos + 13] >> 4)) + 1;
            const hi = uint8[pos + 13] & 0x0F;
            const lo = view.getUint32(pos + 14, false);
            const totalSamples = (hi * 4294967296) + lo;
            meta.sampleRate = sr;
            meta.channels = ch;
            meta.bitDepth = bps;
            if (sr > 0 && totalSamples > 0) {
                meta.duration = Math.round((totalSamples / sr) * 100) / 100;
                if (meta.duration > 0) meta.bitrate = Math.round((fileSize * 8) / meta.duration / 1000);
            }
        } else if (type === 4) {
            parseVorbisCommentBlock(uint8, view, pos, len, meta, false);
        } else if (type === 6 && !meta.cover) {
            const pic = parseFlacPictureBlock(uint8, view, pos, pos + len);
            if (pic) meta.cover = pic;
        }
        pos += len;
    }
}

function parseWav(uint8, view, meta) {
    meta.format = 'WAV';
    const dec = new TextDecoder('ascii');
    if (dec.decode(uint8.subarray(8, 12)) !== 'WAVE') return;
    let pos = 12;
    let byteRate = 0;
    let dataSize = 0;
    const latin1 = new TextDecoder('latin1');

    while (pos + 8 <= uint8.length) {
        const chunkId = dec.decode(uint8.subarray(pos, pos + 4));
        const chunkSize = view.getUint32(pos + 4, true);
        pos += 8;
        if (pos + chunkSize > uint8.length && chunkId !== 'data') break;

        if (chunkId === 'fmt ' && chunkSize >= 16) {
            meta.channels = view.getUint16(pos + 2, true);
            meta.sampleRate = view.getUint32(pos + 4, true);
            byteRate = view.getUint32(pos + 8, true);
            meta.bitDepth = view.getUint16(pos + 14, true);
            if (byteRate > 0) meta.bitrate = Math.round((byteRate * 8) / 1000);
        } else if (chunkId === 'data') {
            dataSize = chunkSize;
        } else if (chunkId === 'LIST' && chunkSize >= 4 && pos + 4 <= uint8.length) {
            const listType = dec.decode(uint8.subarray(pos, pos + 4));
            if (listType === 'INFO') {
                let p = pos + 4;
                const listEnd = Math.min(uint8.length, pos + chunkSize);
                while (p + 8 <= listEnd) {
                    const subId = dec.decode(uint8.subarray(p, p + 4));
                    const subLen = view.getUint32(p + 4, true);
                    p += 8;
                    if (p + subLen > listEnd) break;
                    const text = latin1.decode(uint8.subarray(p, p + subLen)).replace(/\0+$/, '').trim();
                    if (subId === 'INAM' && !meta.title) meta.title = text;
                    else if (subId === 'IART' && !meta.artist) meta.artist = text;
                    else if (subId === 'IPRD' && !meta.album) meta.album = text;
                    else if (subId === 'ICRD' && !meta.year) {
                        const m = text.match(/\d{4}/);
                        if (m) meta.year = parseInt(m[0], 10);
                    } else if (subId === 'IGNR' && !meta.genre) meta.genre = normalizeGenre(text);
                    else if (subId === 'ITRK' && !meta.track) meta.track = text;
                    p += subLen + (subLen % 2);
                }
            }
        } else if (chunkId === 'id3 ' || chunkId === 'ID3 ') {
            parseId3v2Tag(uint8, view, pos, meta);
        }
        pos += chunkSize + (chunkSize % 2);
    }

    if (byteRate > 0 && dataSize > 0) {
        meta.duration = Math.round((dataSize / byteRate) * 100) / 100;
    }
}

async function parseOggOpus(file, uint8, view, meta) {
    const packets = [];
    let pos = 0;
    let firstGranuleSr = 0;
    while (pos + 27 <= uint8.length && packets.length < 2) {
        if (uint8[pos] !== 0x4F || uint8[pos + 1] !== 0x67 || uint8[pos + 2] !== 0x67 || uint8[pos + 3] !== 0x53) break;
        const numSegs = uint8[pos + 26];
        if (pos + 27 + numSegs > uint8.length) break;
        let pageBodyLen = 0;
        for (let i = 0; i < numSegs; i++) pageBodyLen += uint8[pos + 27 + i];
        const bodyStart = pos + 27 + numSegs;
        if (bodyStart + pageBodyLen > uint8.length) break;
        packets.push(uint8.subarray(bodyStart, bodyStart + pageBodyLen));
        pos = bodyStart + pageBodyLen;
    }

    if (packets.length >= 1) {
        const p0 = packets[0];
        const hdrStr = new TextDecoder('ascii').decode(p0.subarray(0, 8));
        if (hdrStr === 'OpusHead') {
            meta.format = 'OPUS';
            meta.channels = p0[9];
            meta.sampleRate = 48000;
            firstGranuleSr = 48000;
        } else if (p0.length >= 29 && p0[0] === 0x01 && new TextDecoder('ascii').decode(p0.subarray(1, 7)) === 'vorbis') {
            meta.format = 'OGG';
            meta.channels = p0[11];
            const dv0 = new DataView(p0.buffer, p0.byteOffset, p0.byteLength);
            meta.sampleRate = dv0.getUint32(12, true);
            const nomBr = dv0.getUint32(20, true);
            if (nomBr > 0) meta.bitrate = Math.round(nomBr / 1000);
            firstGranuleSr = meta.sampleRate;
        }
    }

    if (packets.length >= 2) {
        const p1 = packets[1];
        const dv1 = new DataView(p1.buffer, p1.byteOffset, p1.byteLength);
        const magic = new TextDecoder('ascii').decode(p1.subarray(0, 8));
        if (magic === 'OpusTags') {
            parseVorbisCommentBlock(p1, dv1, 8, p1.length - 8, meta, false);
        } else if (p1[0] === 0x03 && new TextDecoder('ascii').decode(p1.subarray(1, 7)) === 'vorbis') {
            parseVorbisCommentBlock(p1, dv1, 7, p1.length - 7, meta, true);
        }
    }

    // Tail read to extract final OggS granule position for exact duration
    if (firstGranuleSr > 0 && file.size > 0) {
        try {
            const tailStart = Math.max(0, file.size - 65536);
            const tailBuf = await file.slice(tailStart, file.size).arrayBuffer();
            const tb = new Uint8Array(tailBuf);
            const tdv = new DataView(tailBuf);
            for (let i = tb.length - 27; i >= 0; i--) {
                if (tb[i] === 0x4F && tb[i + 1] === 0x67 && tb[i + 2] === 0x67 && tb[i + 3] === 0x53) {
                    const low = tdv.getUint32(i + 6, true);
                    const high = tdv.getUint32(i + 10, true);
                    const granule = high * 4294967296 + low;
                    if (granule > 0 && high !== 0xFFFFFFFF) {
                        meta.duration = Math.round((granule / firstGranuleSr) * 100) / 100;
                        if (meta.duration > 0 && !meta.bitrate) {
                            meta.bitrate = Math.round((file.size * 8) / meta.duration / 1000);
                        }
                        break;
                    }
                }
            }
        } catch (_) {}
    }
}

function parseMp4Atoms(uint8, view, start, end, meta, dec) {
    let pos = start;
    while (pos + 8 <= end) {
        let size = view.getUint32(pos, false);
        const type = dec.decode(uint8.subarray(pos + 4, pos + 8));
        let hdr = 8;
        if (size === 1 && pos + 16 <= end) {
            size = (view.getUint32(pos + 8, false) * 4294967296) + view.getUint32(pos + 12, false);
            hdr = 16;
        } else if (size === 0) {
            size = end - pos;
        }
        if (size < hdr || pos + size > end) break;
        const payloadStart = pos + hdr;
        const payloadEnd = pos + size;

        if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl' || type === 'udta' || type === 'ilst') {
            parseMp4Atoms(uint8, view, payloadStart, payloadEnd, meta, dec);
        } else if (type === 'meta' && payloadStart + 4 <= payloadEnd) {
            parseMp4Atoms(uint8, view, payloadStart + 4, payloadEnd, meta, dec);
        } else if (type === 'mvhd' && payloadStart + 20 <= payloadEnd) {
            const ver = uint8[payloadStart];
            if (ver === 0 && payloadStart + 20 <= payloadEnd) {
                const timescale = view.getUint32(payloadStart + 12, false);
                const dur = view.getUint32(payloadStart + 16, false);
                if (timescale > 0 && dur > 0) meta.duration = Math.round((dur / timescale) * 100) / 100;
            }
        } else if (type === 'stsd' && payloadStart + 16 <= payloadEnd) {
            const codec = dec.decode(uint8.subarray(payloadStart + 12, payloadStart + 16));
            if (codec === 'alac') meta.format = 'ALAC';
            if (payloadStart + 40 <= payloadEnd) {
                meta.channels = view.getUint16(payloadStart + 24, false) || 2;
                meta.bitDepth = view.getUint16(payloadStart + 26, false) || 16;
                meta.sampleRate = view.getUint16(payloadStart + 32, false) || 44100;
            }
        } else if (type.length === 4 && ['\xA9nam', '\xA9ART', '\xA9alb', '\xA9day', '\xA9gen', 'trkn', '\xA9lyr', 'covr', 'gnre'].includes(type)) {
            let p = payloadStart;
            while (p + 16 <= payloadEnd) {
                const dSize = view.getUint32(p, false);
                const dType = dec.decode(uint8.subarray(p + 4, p + 8));
                if (dSize < 16 || p + dSize > payloadEnd) break;
                if (dType === 'data') {
                    const dataTypeInd = view.getUint32(p + 8, false);
                    const dataBytes = uint8.subarray(p + 16, p + dSize);
                    const text = () => new TextDecoder('utf-8').decode(dataBytes).replace(/\0+$/, '').trim();
                    if (type === '\xA9nam') meta.title = text();
                    else if (type === '\xA9ART') meta.artist = text();
                    else if (type === '\xA9alb') meta.album = text();
                    else if (type === '\xA9gen') meta.genre = normalizeGenre(text());
                    else if (type === '\xA9lyr') meta.lyrics = text();
                    else if (type === '\xA9day') {
                        const m = text().match(/\d{4}/);
                        if (m) meta.year = parseInt(m[0], 10);
                    } else if (type === 'trkn' && dataBytes.length >= 4) {
                        meta.track = String((dataBytes[2] << 8) | dataBytes[3]);
                    } else if (type === 'gnre' && dataBytes.length >= 2) {
                        meta.genre = normalizeGenre(String(((dataBytes[0] << 8) | dataBytes[1]) - 1));
                    } else if (type === 'covr' && !meta.cover) {
                        const mime = (dataTypeInd === 14) ? 'image/png' : 'image/jpeg';
                        meta.cover = bytesToDataUrl(dataBytes, mime);
                    }
                }
                p += dSize;
            }
        }
        pos += size;
    }
}

export async function parseAudioFileMetadata(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const meta = {
        title: null,
        artist: null,
        album: null,
        genre: null,
        year: null,
        track: null,
        duration: 0,
        bitrate: null,
        sampleRate: null,
        bitDepth: null,
        channels: null,
        format: ext.toUpperCase(),
        size: formatFileSize(file.size),
        cover: null,
        lyrics: null,
        replayGain: null,
        replayPeak: null
    };

    try {
        const headSize = Math.min(file.size, 3 * 1024 * 1024);
        const arrayBuffer = await file.slice(0, headSize).arrayBuffer();
        const view = new DataView(arrayBuffer);
        const uint8 = new Uint8Array(arrayBuffer);
        const asciiDec = new TextDecoder('latin1');

        if (ext === 'flac' || (uint8[0] === 0x66 && uint8[1] === 0x4C && uint8[2] === 0x61 && uint8[3] === 0x43)) {
            parseFlac(uint8, view, file.size, meta);
        } else if (ext === 'wav' || (uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46)) {
            parseWav(uint8, view, meta);
        } else if (ext === 'ogg' || ext === 'opus' || (uint8[0] === 0x4F && uint8[1] === 0x67 && uint8[2] === 0x67 && uint8[3] === 0x53)) {
            await parseOggOpus(file, uint8, view, meta);
        } else if (['m4a', 'mp4', 'aac', 'alac'].includes(ext) || (uint8.length >= 8 && asciiDec.decode(uint8.subarray(4, 8)) === 'ftyp')) {
            meta.format = ext === 'alac' ? 'ALAC' : 'M4A';
            parseMp4Atoms(uint8, view, 0, uint8.length, meta, asciiDec);
            if (meta.duration > 0 && !meta.bitrate && file.size > 0) {
                meta.bitrate = Math.round((file.size * 8) / meta.duration / 1000);
            }
        } else if (uint8[0] === 0x49 && uint8[1] === 0x44 && uint8[2] === 0x33) {
            meta.format = 'MP3';
            parseId3v2Tag(uint8, view, 0, meta);
        }

        // Trailing ID3v1 fallback for MP3
        if ((ext === 'mp3' || meta.format === 'MP3') && file.size >= 128 && (!meta.title || !meta.artist)) {
            try {
                const v1Buf = await file.slice(file.size - 128, file.size).arrayBuffer();
                const v1 = new Uint8Array(v1Buf);
                if (v1[0] === 0x54 && v1[1] === 0x41 && v1[2] === 0x47) {
                    const readField = (a, b) => asciiDec.decode(v1.subarray(a, b)).replace(/\0+$/, '').trim();
                    if (!meta.title) meta.title = readField(3, 33) || null;
                    if (!meta.artist) meta.artist = readField(33, 63) || null;
                    if (!meta.album) meta.album = readField(63, 93) || null;
                    if (!meta.year) {
                        const y = parseInt(readField(93, 97), 10);
                        if (y > 1900 && y < 2100) meta.year = y;
                    }
                    if (!meta.track && v1[125] === 0 && v1[126] > 0) meta.track = String(v1[126]);
                    if (!meta.genre && v1[127] < ID3V1_GENRES.length) meta.genre = ID3V1_GENRES[v1[127]];
                }
            } catch (_) {}
        }

        // Fallback estimated MP3 duration when VBR header missing
        if (!meta.duration && meta.bitrate > 0 && file.size > 0) {
            meta.duration = Math.round(((file.size * 8) / (meta.bitrate * 1000)) * 100) / 100;
        }
    } catch (e) {
        console.warn('[TagParser] Metadata read error:', e);
    }

    return meta;
}
